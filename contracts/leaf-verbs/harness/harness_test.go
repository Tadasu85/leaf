// Runs the built contract (../artifacts/main.wasm) inside VSC's own test
// harness (go-vsc-node's test_utils): the real WASM runtime, state store and
// call path, including how msg.caller is set from the signer.
//
//	cd contracts/leaf-verbs
//	tinygo build -gc=custom -scheduler=none -panic=trap -no-debug -target=wasm-unknown -o artifacts/main.wasm ./contract
//	cd harness && go test ./...
//
// Needs WasmEdge 0.13.4 (the version go-vsc-node pins) for cgo:
// CGO_CFLAGS=-I$WASMEDGE/include CGO_LDFLAGS=-L$WASMEDGE/lib LD_LIBRARY_PATH=$WASMEDGE/lib
package harness

import (
	"encoding/json"
	"os"
	"strconv"
	"sync"
	"testing"

	"vsc-node/lib/test_utils"
	stateEngine "vsc-node/modules/state-processing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const contractID = "vscleafverbs"

// One test environment per process: it holds a database lock, so every test
// shares it and uses a room of its own.
var (
	shared     *test_utils.ContractTest
	sharedOnce sync.Once
	txCount    int
)

type harness struct {
	t    *testing.T
	ct   *test_utils.ContractTest
	room string
}

func newHarness(t *testing.T, room string) *harness {
	sharedOnce.Do(func() {
		code, err := os.ReadFile("../artifacts/main.wasm")
		require.NoError(t, err, "build the contract first (see the top of this file)")
		ct := test_utils.NewContractTest()
		ct.RegisterContract(contractID, "hive:ray", code)
		shared = &ct
	})
	require.NotNil(t, shared)
	return &harness{t: t, ct: shared, room: room}
}

// call signs as `who` with the posting key (as Leaf does), unless active is set.
func (h *harness) call(who, action string, payload any, active bool) test_utils.ContractTestCallResult {
	txCount++
	// Leaf sends the payload as a JSON string inside vsc.call; a VSC node
	// unescapes it before the contract sees it (state-processing
	// transactions.go). This harness passes the payload through untouched,
	// so send what the contract receives on a node: the JSON text itself.
	body, _ := json.Marshal(payload)
	self := stateEngine.TxSelf{
		TxId:        "tx" + strconv.Itoa(txCount),
		BlockId:     "block",
		BlockHeight: h.ct.BlockHeight,
		Index:       txCount,
		Timestamp:   "2026-11-09T00:00:00",
	}
	if active {
		self.RequiredAuths = []string{"hive:" + who}
		self.RequiredPostingAuths = []string{}
	} else {
		self.RequiredAuths = []string{}
		self.RequiredPostingAuths = []string{"hive:" + who}
	}
	return h.ct.Call(stateEngine.TxVscCallContract{
		Self:       self,
		ContractId: contractID,
		Action:     action,
		Payload:    json.RawMessage(body),
		RcLimit:    1000,
	})
}

type useResult struct {
	OK      bool              `json:"ok"`
	Self    string            `json:"self"`
	Others  string            `json:"others"`
	Effects []map[string]any  `json:"effects"`
	Flags   map[string]string `json:"flags"`
}

func (h *harness) use(who, object, verb string) useResult {
	res := h.call(who, "use", map[string]string{"room": h.room, "object": object, "verb": verb}, false)
	require.True(h.t, res.Success, "use %s %s: %s", verb, object, res.ErrMsg)
	var out useResult
	require.NoError(h.t, json.Unmarshal([]byte(res.Ret), &out))
	return out
}

func (h *harness) defineLever() {
	pull := map[string]any{"room": h.room, "object": "lever", "verb": "pull", "def": map[string]any{
		"self": "You pull the lever. Stone grinds open to the north.", "others": "%n pulls the lever.",
		"requires": map[string]string{"lever": ""}, "sets": map[string]string{"lever": "down", "exit:north": "ray/treasury"},
		"denied": "The lever is already down.",
	}}
	push := map[string]any{"room": h.room, "object": "lever", "verb": "push", "def": map[string]any{
		"self": "You push the lever back up.", "requires": map[string]string{"lever": "down"},
		"sets": map[string]string{"lever": "", "exit:north": ""}, "denied": "The lever is already up.",
	}}
	for _, p := range []any{pull, push} {
		res := h.call("ray", "define", p, false)
		require.True(h.t, res.Success, res.ErrMsg)
	}
}

func TestLeverInTheVscRuntime(t *testing.T) {
	h := newHarness(t, "ray/the-vault")
	h.defineLever()

	pulled := h.use("alice", "lever", "pull")
	assert.True(t, pulled.OK)
	assert.Equal(t, []map[string]any{{"type": "SetExit", "direction": "north", "target": "ray/treasury"}}, pulled.Effects)
	assert.JSONEq(t, `{"lever":"down","exit:north":"ray/treasury"}`, h.ct.StateGet(contractID, "f|ray:the-vault"))

	h.ct.IncrementBlocks(1)
	again := h.use("bob", "lever", "pull")
	assert.False(t, again.OK)
	assert.Equal(t, "The lever is already down.", again.Self)

	h.ct.IncrementBlocks(1)
	pushed := h.use("bob", "lever", "push")
	assert.True(t, pushed.OK)
	assert.Equal(t, "", h.ct.StateGet(contractID, "f|ray:the-vault"))
}

func TestOnlyTheAuthorDefines(t *testing.T) {
	h := newHarness(t, "ray/the-hall")
	res := h.call("alice", "define", map[string]any{"room": h.room, "object": "lever", "verb": "pull", "def": map[string]any{"self": "x"}}, false)
	assert.False(t, res.Success)
	assert.Contains(t, res.ErrMsg, "author")
	// Signing with the active key works the same way.
	res = h.call("ray", "define", map[string]any{"room": h.room, "object": "bell", "verb": "ring", "def": map[string]any{"self": "Ding."}}, true)
	assert.True(t, res.Success, res.ErrMsg)
}

func TestOneUsePerBlockInTheRuntime(t *testing.T) {
	h := newHarness(t, "ray/the-cellar")
	h.ct.IncrementBlocks(1)
	h.defineLever()
	h.use("alice", "lever", "pull")
	res := h.call("alice", "use", map[string]string{"room": h.room, "object": "lever", "verb": "push"}, false)
	assert.False(t, res.Success)
	assert.Contains(t, res.ErrMsg, "slow down")
}
