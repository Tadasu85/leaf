// Leaf verbs contract: room authors define verbs on objects in their rooms
// as data; players use them. See ../README.md.
//
// Build (from contracts/leaf-verbs):
//
//	tinygo build -gc=custom -scheduler=none -panic=trap -no-debug -target=wasm-unknown -o artifacts/main.wasm ./contract
//
// Each export takes the call's JSON payload and returns a JSON string. The
// player is always the transaction's signer (msg.caller), never a payload
// field, so no one can act as someone else.
package main

import (
	"encoding/json"
	"strconv"

	"leaf-verbs/kernel"
	"leaf-verbs/sdk"
)

func main() {}

// sdkStore is the contract's persistent state.
type sdkStore struct{}

func (sdkStore) Get(key string) *string { return sdk.StateGetObject(key) }
func (sdkStore) Set(key, value string)  { sdk.StateSetObject(key, value) }
func (sdkStore) Delete(key string)      { sdk.StateDeleteObject(key) }

func ctx() kernel.Ctx {
	c := kernel.Ctx{}
	if caller := sdk.GetEnvKey("msg.caller"); caller != nil {
		c.Caller = *caller
	}
	if h := sdk.GetEnvKey("block.height"); h != nil {
		c.Block, _ = strconv.ParseUint(*h, 10, 64)
	}
	return c
}

func decode(payload *string, out interface{}) {
	if payload == nil || json.Unmarshal([]byte(*payload), out) != nil {
		sdk.Abort("payload must be JSON")
	}
}

func check(err *kernel.Error) {
	if err != nil {
		sdk.Abort(err.Msg)
	}
}

func ok() *string {
	s := `{"ok":true}`
	return &s
}

//go:wasmexport define
func Define(payload *string) *string {
	var a kernel.DefineArgs
	decode(payload, &a)
	check(kernel.Define(sdkStore{}, ctx(), a))
	return ok()
}

//go:wasmexport remove
func Remove(payload *string) *string {
	var a kernel.RemoveArgs
	decode(payload, &a)
	check(kernel.Remove(sdkStore{}, ctx(), a))
	return ok()
}

//go:wasmexport reset
func Reset(payload *string) *string {
	var a kernel.ResetArgs
	decode(payload, &a)
	check(kernel.Reset(sdkStore{}, ctx(), a))
	return ok()
}

//go:wasmexport use
func Use(payload *string) *string {
	var a kernel.UseArgs
	decode(payload, &a)
	res, err := kernel.Use(sdkStore{}, ctx(), a)
	check(err)
	b, _ := json.Marshal(res)
	out := string(b)
	// Logs are part of the contract output, so indexers and clients can see
	// what happened in a room without replaying the call.
	sdk.Log(`{"room":` + strconv.Quote(a.Room) + `,"by":` + strconv.Quote(ctx().Caller) + `,"result":` + out + `}`)
	return &out
}
