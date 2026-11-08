package kernel

import (
	"reflect"
	"strings"
	"testing"
)

type memStore map[string]string

func (m memStore) Get(k string) *string {
	if v, ok := m[k]; ok {
		return &v
	}
	return nil
}
func (m memStore) Set(k, v string) { m[k] = v }
func (m memStore) Delete(k string) { delete(m, k) }

const room = "ray/the-vault"

var (
	ray   = Ctx{Caller: "hive:ray", Block: 100}
	alice = Ctx{Caller: "hive:alice", Block: 100}
)

// A lever that opens the way north to ray's treasury, and closes it again.
func setupLever(t *testing.T, s memStore) {
	t.Helper()
	mustDefine(t, s, "lever", "pull", Verb{
		Self:     "You pull the lever. Stone grinds open to the north.",
		Others:   "%n pulls the lever. Stone grinds open to the north.",
		Requires: map[string]string{"lever": ""},
		Sets:     map[string]string{"lever": "down", "exit:north": "ray/treasury"},
		Denied:   "The lever is already down.",
	})
	mustDefine(t, s, "lever", "push", Verb{
		Self:     "You push the lever back up. The north wall closes.",
		Requires: map[string]string{"lever": "down"},
		Sets:     map[string]string{"lever": "", "exit:north": ""},
		Denied:   "The lever is already up.",
	})
}

func mustDefine(t *testing.T, s memStore, object, verb string, v Verb) {
	t.Helper()
	if err := Define(s, ray, DefineArgs{Room: room, Object: object, Verb: verb, Def: v}); err != nil {
		t.Fatalf("define %s %s: %v", verb, object, err)
	}
}

func use(t *testing.T, s memStore, c Ctx, object, verb string) *Result {
	t.Helper()
	res, err := Use(s, c, UseArgs{Room: room, Object: object, Verb: verb})
	if err != nil {
		t.Fatalf("use %s %s: %v", verb, object, err)
	}
	return res
}

func TestLeverOpensAndClosesAnExit(t *testing.T) {
	s := memStore{}
	setupLever(t, s)

	res := use(t, s, alice, "lever", "pull")
	if !res.OK || !strings.Contains(res.Self, "grinds open") || res.Others == "" {
		t.Fatalf("pull: %+v", res)
	}
	want := []Effect{{Type: "SetExit", Direction: "north", Target: "ray/treasury"}}
	if !reflect.DeepEqual(res.Effects, want) {
		t.Fatalf("effects = %+v, want %+v", res.Effects, want)
	}
	// The state is shared: bob sees it down too.
	if got := ReadFlags(s, room); got["lever"] != "down" || got["exit:north"] != "ray/treasury" {
		t.Fatalf("flags = %v", got)
	}

	bob := Ctx{Caller: "hive:bob", Block: 101}
	again := use(t, s, bob, "lever", "pull")
	if again.OK || again.Self != "The lever is already down." || len(again.Effects) != 0 {
		t.Fatalf("second pull: %+v", again)
	}

	bob.Block++ // one use per player per block
	back := use(t, s, bob, "lever", "push")
	if !back.OK || !reflect.DeepEqual(back.Effects, []Effect{{Type: "ClearExit", Direction: "north"}}) {
		t.Fatalf("push: %+v", back)
	}
	if len(ReadFlags(s, room)) != 0 {
		t.Fatalf("flags not cleared: %v", ReadFlags(s, room))
	}
}

func TestOnlyTheAuthorDefinesVerbs(t *testing.T) {
	s := memStore{}
	err := Define(s, alice, DefineArgs{Room: room, Object: "lever", Verb: "pull", Def: Verb{Self: "x"}})
	if err == nil || !strings.Contains(err.Msg, "author") {
		t.Fatalf("alice defined a verb in ray's room: %v", err)
	}
	setupLever(t, s)
	if err := Remove(s, alice, RemoveArgs{Room: room, Object: "lever", Verb: "pull"}); err == nil {
		t.Fatal("alice removed a verb")
	}
	if err := Reset(s, alice, ResetArgs{Room: room}); err == nil {
		t.Fatal("alice reset the room")
	}
}

func TestOneUsePerPlayerPerBlock(t *testing.T) {
	s := memStore{}
	setupLever(t, s)
	use(t, s, alice, "lever", "pull")
	if _, err := Use(s, alice, UseArgs{Room: room, Object: "lever", Verb: "push"}); err == nil || err.Msg != "slow down" {
		t.Fatalf("second use in the same block: %v", err)
	}
	// Another player in the same block is fine.
	if _, err := Use(s, Ctx{Caller: "hive:bob", Block: 100}, UseArgs{Room: room, Object: "lever", Verb: "push"}); err != nil {
		t.Fatal(err)
	}
}

func TestRemoveAndReset(t *testing.T) {
	s := memStore{}
	setupLever(t, s)
	use(t, s, alice, "lever", "pull")
	if err := Reset(s, ray, ResetArgs{Room: room}); err != nil {
		t.Fatal(err)
	}
	if len(ReadFlags(s, room)) != 0 {
		t.Fatal("reset left flags")
	}
	if err := Remove(s, ray, RemoveArgs{Room: room, Object: "lever", Verb: "pull"}); err != nil {
		t.Fatal(err)
	}
	if _, err := Use(s, Ctx{Caller: "hive:alice", Block: 200}, UseArgs{Room: room, Object: "lever", Verb: "pull"}); err == nil {
		t.Fatal("removed verb still works")
	}
	if got := readIndex(s, room); !reflect.DeepEqual(got, []string{"lever|push"}) {
		t.Fatalf("index = %v", got)
	}
}

func TestRejectsBadInput(t *testing.T) {
	s := memStore{}
	cases := []struct {
		name string
		args DefineArgs
		want string
	}{
		{"room", DefineArgs{Room: "not-a-room", Object: "lever", Verb: "pull", Def: Verb{Self: "x"}}, "author/permlink"},
		{"object", DefineArgs{Room: room, Object: "Lever!", Verb: "pull", Def: Verb{Self: "x"}}, "object"},
		{"verb", DefineArgs{Room: room, Object: "lever", Verb: "p", Def: Verb{Self: "x"}}, "verb"},
		{"self", DefineArgs{Room: room, Object: "lever", Verb: "pull", Def: Verb{}}, "self"},
		{"long", DefineArgs{Room: room, Object: "lever", Verb: "pull", Def: Verb{Self: strings.Repeat("a", 201)}}, "200"},
		{"flag", DefineArgs{Room: room, Object: "lever", Verb: "pull", Def: Verb{Self: "x", Sets: map[string]string{"Bad Flag": "1"}}}, "flag"},
		{"exit", DefineArgs{Room: room, Object: "lever", Verb: "pull", Def: Verb{Self: "x", Sets: map[string]string{"exit:north": "Not A Room!"}}}, "exit"},
	}
	for _, c := range cases {
		if err := Define(s, ray, c.args); err == nil || !strings.Contains(err.Msg, c.want) {
			t.Errorf("%s: got %v, want an error mentioning %q", c.name, err, c.want)
		}
	}
	if len(s) != 0 {
		t.Fatalf("a refused define wrote state: %v", s)
	}
}

func TestVerbLimitPerRoom(t *testing.T) {
	s := memStore{}
	verbs := []string{}
	for i := 0; i < MaxVerbsPerRoom; i++ {
		v := "v" + string(rune('a'+i/26)) + string(rune('a'+i%26))
		verbs = append(verbs, v)
		mustDefine(t, s, "box", v, Verb{Self: "ok"})
	}
	if err := Define(s, ray, DefineArgs{Room: room, Object: "box", Verb: "extra", Def: Verb{Self: "x"}}); err == nil {
		t.Fatal("31st verb accepted")
	}
	// Redefining an existing verb doesn't count against the limit.
	mustDefine(t, s, "box", verbs[0], Verb{Self: "changed"})
}

func TestUseNeedsAHiveCaller(t *testing.T) {
	s := memStore{}
	setupLever(t, s)
	if _, err := Use(s, Ctx{Caller: "contract:vsc1abc", Block: 5}, UseArgs{Room: room, Object: "lever", Verb: "pull"}); err == nil {
		t.Fatal("a contract used a verb")
	}
}
