# Leaf verbs contract (VSC / Magi)

Stateful room objects for Leaf. A room's author defines verbs on objects in
their room as data; players use them; the contract keeps each room's flags.
A flag named `exit:<direction>` is an exit (its value is the room-map key it
leads to, empty = closed), so a lever one player pulls opens the way for
everyone. No author-written code runs anywhere.

Design and plan: the "VSC verbs for Leaf" doc in the Leaf project.

## Layout

| Path | What |
| --- | --- |
| `kernel/` | All game logic, plain Go, tested with `go test` |
| `contract/main.go` | WASM exports (`define`, `remove`, `reset`, `use`) adapting the kernel to the SDK |
| `sdk/`, `runtime/` | Copied unchanged from [vsc-eco/go-contract-template](https://github.com/vsc-eco/go-contract-template) @ `c1811bb` (only the module path in imports changed). Don't edit; re-copy to update |
| `artifacts/` | Build output (`main.wasm`, not committed) |

## Actions

The player is always the transaction's signer (`msg.caller`), never a payload field.

| Action | Who | Payload |
| --- | --- | --- |
| `define` | the room's author | `{"room":"ray/vault","object":"lever","verb":"pull","def":{"self":"…","others":"%n …","requires":{"lever":""},"sets":{"lever":"down","exit:north":"ray/treasury"},"denied":"…"}}` |
| `remove` | the room's author | `{"room":"ray/vault","object":"lever","verb":"pull"}` |
| `reset` | the room's author | `{"room":"ray/vault"}` (clears every flag) |
| `use` | any Hive account | `{"room":"ray/vault","object":"lever","verb":"pull"}` |

`use` returns `{"ok":bool,"self":"…","others":"…","effects":[{"type":"SetExit","direction":"north","target":"ray/treasury"}],"flags":{…}}`
and logs `{"room","by","result"}`. If `requires` doesn't hold it returns
`ok:false` with the `denied` text and changes nothing.

Limits: 30 verbs and 32 flags per room, 8 requires and 8 sets per verb,
texts 200 characters, flag values 80, one `use` per player per room per Hive
block. Names follow Leaf's room objects (object `^[a-z][a-z0-9 -]{0,29}$`,
verb `^[a-z]{2,15}$`).

State keys: `v/<room>/<object>/<verb>` (verb JSON), `i/<room>` (index),
`f/<room>` (flags JSON, what clients read), `u/<room>/<caller>` (last block used).

## Build and test

```sh
cd contracts/leaf-verbs
go test ./kernel/
tinygo build -gc=custom -scheduler=none -panic=trap -no-debug -target=wasm-unknown -o artifacts/main.wasm ./contract
```

TinyGo 0.39 (as the template uses). The build imports only the SDK's host
functions (`sdk.db.*`, `sdk.system.get_env_key`, `sdk.console.log`, `env.abort`).

Not done yet: running it in VSC's own test harness (`go-vsc-node`'s
`test_utils`, see the template's `test/contract_test.go`), and deploying to
testnet. Deploying is a `custom_json` from the deploying account; follow the
template's `deploy.sh` and record the contract id in `REACT_APP_VSC_CONTRACT`.
