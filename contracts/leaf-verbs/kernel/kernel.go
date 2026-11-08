// Package kernel is the game logic of the Leaf verbs contract, kept free of
// the VSC SDK so it can be tested with plain `go test`. contract/main.go
// adapts it to the SDK (state, caller, block height).
//
// A room's author defines verbs on objects in their room as data: what the
// player sees, what others see, which room flags must hold, and which flags
// change. A flag named "exit:<direction>" is an exit: its value is the map key
// it leads to ("" = closed). Nothing here runs author-written code.
package kernel

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
)

// Store is the contract's persistent key-value state.
type Store interface {
	Get(key string) *string
	Set(key, value string)
	Delete(key string)
}

// Ctx is who is calling and when, taken from the signed transaction.
type Ctx struct {
	// Caller is the VSC address of the signer, e.g. "hive:alice".
	Caller string
	// Block is the Hive (L1) block height of the transaction.
	Block uint64
}

// Limits keep one room's data small and one player from spamming a room.
const (
	MaxVerbsPerRoom = 30
	MaxFlagsPerRoom = 32
	MaxRules        = 8
	MaxTextLen      = 200
	MaxValueLen     = 80
)

var (
	hiveName = regexp.MustCompile(`^[a-z][a-z0-9.-]{2,15}$`)
	permlink = regexp.MustCompile(`^[a-z0-9-]{1,255}$`)
	objectRe = regexp.MustCompile(`^[a-z][a-z0-9 -]{0,29}$`)
	verbRe   = regexp.MustCompile(`^[a-z]{2,15}$`)
	flagRe   = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,23}$`)
	exitRe   = regexp.MustCompile(`^exit:[a-z]{1,12}$`)
	targetRe = regexp.MustCompile(`^([a-z][a-z0-9.-]{2,15}/)?[a-z0-9-]{1,255}$`)
)

// Verb is one thing a player can do to an object, defined by the room's author.
type Verb struct {
	// Self is shown to the player who did it.
	Self string `json:"self"`
	// Others is shown to everyone else in the room; %n is the player's name.
	Others string `json:"others,omitempty"`
	// Requires: flag → value that must hold ("" = the flag is unset).
	Requires map[string]string `json:"requires,omitempty"`
	// Sets: flag → new value ("" unsets it).
	Sets map[string]string `json:"sets,omitempty"`
	// Denied is shown to the player when Requires doesn't hold.
	Denied string `json:"denied,omitempty"`
}

// Effect is a change the client applies to the room it shows.
type Effect struct {
	Type      string `json:"type"` // "SetExit" | "ClearExit"
	Direction string `json:"direction"`
	Target    string `json:"target,omitempty"`
}

// Result is what `use` returns to the caller.
type Result struct {
	OK      bool              `json:"ok"`
	Self    string            `json:"self"`
	Others  string            `json:"others,omitempty"`
	Effects []Effect          `json:"effects"`
	Flags   map[string]string `json:"flags"`
}

// Error is a refusal; the contract turns it into an abort, so nothing changes.
type Error struct{ Msg string }

func (e *Error) Error() string { return e.Msg }

func fail(msg string) *Error { return &Error{msg} }

// --- keys -------------------------------------------------------------------

func verbKey(room, object, verb string) string { return "v/" + room + "/" + object + "/" + verb }
func indexKey(room string) string              { return "i/" + room }
func flagsKey(room string) string              { return "f/" + room }
func lastUseKey(room, caller string) string    { return "u/" + room + "/" + caller }

// FlagsKey is the state key clients read to show a room's current flags.
func FlagsKey(room string) string { return flagsKey(room) }

// --- validation ---------------------------------------------------------------

// RoomAuthor returns the author of a room id "author/permlink".
func RoomAuthor(room string) (string, *Error) {
	slash := strings.IndexByte(room, '/')
	if slash <= 0 || !hiveName.MatchString(room[:slash]) || !permlink.MatchString(room[slash+1:]) {
		return "", fail("room must be author/permlink")
	}
	return room[:slash], nil
}

func checkOwner(ctx Ctx, room string) *Error {
	author, err := RoomAuthor(room)
	if err != nil {
		return err
	}
	if ctx.Caller != "hive:"+author {
		return fail("only the room's author can change its verbs")
	}
	return nil
}

func checkNames(object, verb string) *Error {
	if !objectRe.MatchString(object) {
		return fail("object: lowercase letters, numbers, spaces and hyphens, up to 30")
	}
	if !verbRe.MatchString(verb) {
		return fail("verb: 2 to 15 lowercase letters")
	}
	return nil
}

func checkFlag(name, value string) *Error {
	if exitRe.MatchString(name) {
		if value != "" && !targetRe.MatchString(value) {
			return fail("exit " + name + " must lead to a permlink or author/permlink")
		}
	} else if !flagRe.MatchString(name) {
		return fail("flag " + name + ": lowercase letters, numbers, _ and -, up to 24")
	}
	if len(value) > MaxValueLen {
		return fail("flag " + name + " value is too long")
	}
	return nil
}

func (v *Verb) check() *Error {
	if v.Self == "" {
		return fail("self text is required")
	}
	for _, t := range []string{v.Self, v.Others, v.Denied} {
		if len(t) > MaxTextLen {
			return fail("texts are 200 characters at most")
		}
	}
	if len(v.Requires) > MaxRules || len(v.Sets) > MaxRules {
		return fail("at most 8 requires and 8 sets")
	}
	for k, val := range v.Requires {
		if err := checkFlag(k, val); err != nil {
			return err
		}
	}
	for k, val := range v.Sets {
		if err := checkFlag(k, val); err != nil {
			return err
		}
	}
	return nil
}

// --- state helpers --------------------------------------------------------------

func readIndex(s Store, room string) []string {
	raw := s.Get(indexKey(room))
	if raw == nil || *raw == "" {
		return nil
	}
	return strings.Split(*raw, "\n")
}

func writeIndex(s Store, room string, entries []string) {
	if len(entries) == 0 {
		s.Delete(indexKey(room))
		return
	}
	sort.Strings(entries)
	s.Set(indexKey(room), strings.Join(entries, "\n"))
}

// ReadFlags returns a room's flags (never nil).
func ReadFlags(s Store, room string) map[string]string {
	flags := map[string]string{}
	if raw := s.Get(flagsKey(room)); raw != nil {
		_ = json.Unmarshal([]byte(*raw), &flags)
	}
	return flags
}

func writeFlags(s Store, room string, flags map[string]string) {
	if len(flags) == 0 {
		s.Delete(flagsKey(room))
		return
	}
	b, _ := json.Marshal(flags)
	s.Set(flagsKey(room), string(b))
}

// --- actions ----------------------------------------------------------------------

// DefineArgs is the payload of `define`.
type DefineArgs struct {
	Room   string `json:"room"`
	Object string `json:"object"`
	Verb   string `json:"verb"`
	Def    Verb   `json:"def"`
}

// Define adds or replaces a verb. Only the room's author may call it.
func Define(s Store, ctx Ctx, a DefineArgs) *Error {
	if err := checkOwner(ctx, a.Room); err != nil {
		return err
	}
	if err := checkNames(a.Object, a.Verb); err != nil {
		return err
	}
	if err := a.Def.check(); err != nil {
		return err
	}
	entry := a.Object + "|" + a.Verb
	index := readIndex(s, a.Room)
	found := false
	for _, e := range index {
		if e == entry {
			found = true
			break
		}
	}
	if !found {
		if len(index) >= MaxVerbsPerRoom {
			return fail("a room holds at most 30 verbs")
		}
		index = append(index, entry)
		writeIndex(s, a.Room, index)
	}
	b, _ := json.Marshal(a.Def)
	s.Set(verbKey(a.Room, a.Object, a.Verb), string(b))
	return nil
}

// RemoveArgs is the payload of `remove`.
type RemoveArgs struct {
	Room   string `json:"room"`
	Object string `json:"object"`
	Verb   string `json:"verb"`
}

// Remove deletes a verb. Only the room's author may call it.
func Remove(s Store, ctx Ctx, a RemoveArgs) *Error {
	if err := checkOwner(ctx, a.Room); err != nil {
		return err
	}
	entry := a.Object + "|" + a.Verb
	index := readIndex(s, a.Room)
	kept := index[:0]
	for _, e := range index {
		if e != entry {
			kept = append(kept, e)
		}
	}
	writeIndex(s, a.Room, kept)
	s.Delete(verbKey(a.Room, a.Object, a.Verb))
	return nil
}

// ResetArgs is the payload of `reset`.
type ResetArgs struct {
	Room string `json:"room"`
}

// Reset clears a room's flags (every exit back to closed). Author only.
func Reset(s Store, ctx Ctx, a ResetArgs) *Error {
	if err := checkOwner(ctx, a.Room); err != nil {
		return err
	}
	s.Delete(flagsKey(a.Room))
	return nil
}

// UseArgs is the payload of `use`. The player is the caller, never a field.
type UseArgs struct {
	Room   string `json:"room"`
	Object string `json:"object"`
	Verb   string `json:"verb"`
}

// Use performs a verb as the caller. A verb whose Requires don't hold
// returns OK=false with the Denied text and changes nothing.
func Use(s Store, ctx Ctx, a UseArgs) (*Result, *Error) {
	if _, err := RoomAuthor(a.Room); err != nil {
		return nil, err
	}
	if !strings.HasPrefix(ctx.Caller, "hive:") {
		return nil, fail("verbs are used by Hive accounts")
	}
	if err := checkNames(a.Object, a.Verb); err != nil {
		return nil, err
	}
	raw := s.Get(verbKey(a.Room, a.Object, a.Verb))
	if raw == nil {
		return nil, fail("nothing here answers to that")
	}
	var v Verb
	if json.Unmarshal([]byte(*raw), &v) != nil {
		return nil, fail("verb data is unreadable")
	}

	// One use per player per room per Hive block (about 3 seconds).
	lastKey := lastUseKey(a.Room, ctx.Caller)
	if last := s.Get(lastKey); last != nil && *last == u64(ctx.Block) {
		return nil, fail("slow down")
	}
	s.Set(lastKey, u64(ctx.Block))

	flags := ReadFlags(s, a.Room)
	for k, want := range v.Requires {
		if flags[k] != want {
			denied := v.Denied
			if denied == "" {
				denied = "Nothing happens."
			}
			return &Result{OK: false, Self: denied, Effects: []Effect{}, Flags: flags}, nil
		}
	}

	effects := []Effect{}
	keys := make([]string, 0, len(v.Sets))
	for k := range v.Sets {
		keys = append(keys, k)
	}
	sort.Strings(keys) // deterministic order of effects
	for _, k := range keys {
		val := v.Sets[k]
		if val == "" {
			delete(flags, k)
		} else {
			if _, exists := flags[k]; !exists && len(flags) >= MaxFlagsPerRoom {
				return nil, fail("this room has too many flags")
			}
			flags[k] = val
		}
		if exitRe.MatchString(k) {
			dir := strings.TrimPrefix(k, "exit:")
			if val == "" {
				effects = append(effects, Effect{Type: "ClearExit", Direction: dir})
			} else {
				effects = append(effects, Effect{Type: "SetExit", Direction: dir, Target: val})
			}
		}
	}
	writeFlags(s, a.Room, flags)
	return &Result{OK: true, Self: v.Self, Others: v.Others, Effects: effects, Flags: flags}, nil
}

func u64(n uint64) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
