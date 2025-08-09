# Leaf Programmability (VSC Verb Runtime)

Authoritative, forkable design for adding deterministic, on-chain programmability to Leaf using VSC (Virtual Smart Chain). This keeps the client serverless (no added scope in `leaf_server`) and lets others clone and launch their own games on Hive.

## Goals

- Deterministic, in-world “verbs” (room/object logic) executed on-chain.
- Pure client integration (no additional server responsibilities).
- Simple to fork: clear contract ABI, config, and deployment steps.
- Backward-compatible with existing Leaf world model on Hive (rooms/posts, movement, descriptions).

Non-goals: Replace Hive posts/map or movement operations; build general chat/presence in this phase.

## Architecture Overview

- Hive L1
  - Rooms as posts (title/body), exits in game map (`posting_json_metadata`), movement via `custom_json`, player descriptions in account metadata.
- VSC (WASM smart contracts)
  - GameKernel contract holds verb logic and room state by `roomId`.
  - Exposes verb hooks; emits events with outputs and effects.
- Client (Leaf)
  - New `VerbRuntime` abstraction with a `VSCAdapter`.
  - `GameState` invokes verbs on enter/say/emote/command; renders outputs; applies effects from events.

## Identifiers

- `roomId`: `${author}/${permlink}` (e.g., `raymonjohnstone/genesis-scaffold-precipice`).
- `player`: Hive username (Keychain identity).

## Contract ABI (GameKernel)

Hooks (called by clients; contract executes deterministically):

- `on_enter(roomId: string, player: string) -> VerbResult`
- `on_leave(roomId: string, player: string) -> VerbResult`
- `on_say(roomId: string, player: string, message: string) -> VerbResult`
- `on_emote(roomId: string, player: string, emote: string) -> VerbResult`
- `on_command(roomId: string, player: string, text: string) -> VerbResult`
- `on_tick(roomId: string, blockNum: u64) -> void` (scheduled by validators; emits events only)

Return type:

```
VerbResult = {
  output: string[];     // lines to render to the caller
  effects: Effect[];    // state changes/events to apply
}
```

Verb management (owner/admin only):

- `attach_verb(roomId, name, codeRef, acl)`
- `update_verb(roomId, name, codeRef)`
- `list_verbs(roomId) -> VerbMeta[]`

Notes:
- Contracts are AssemblyScript->WASM. `codeRef` may be inline or a content hash (e.g., IPFS) as per VSC SDK best practices.

## Effects Schema (emitted by contract, applied by clients)

Effect union:

```
type Effect =
  | { type: 'SetDetail'; key: string; value: string }
  | { type: 'ClearDetail'; key: string }
  | { type: 'SetExit'; direction: string; permlink: string }
  | { type: 'Broadcast'; text: string }
  | { type: 'GiveItem'; toPlayer: string; itemId: string }
  | { type: 'MovePlayer'; player: string; permlink: string };
```

Events:

- `VerbOutputEvent { roomId, player, lines: string[], txId, blockNum }`
- `RoomEffectEvent { roomId, effects: Effect[], txId, blockNum }`

Client responsibilities:
- Render `VerbOutputEvent.lines`.
- Apply `RoomEffectEvent.effects` to in-memory room state (details/exits/etc.).
- De-duplicate by `{txId, blockNum}`.

## Determinism, Limits, and Security

- Deterministic execution (WASM). No non-deterministic APIs; no network access from verbs.
- Per-invocation budgets (time, memory, max output lines, max effects).
- Rate-limiting by caller and room enforced in-contract (e.g., cooldowns).
- Permissions: only `roomOwner` (default = Hive post author) and admins can attach/update verbs. Optional per-verb ACLs for invocation.

## Client Integration (Leaf)

New abstraction (TypeScript):

```ts
export interface VerbRuntime {
  onEnter(roomId: string, player: string): Promise<VerbResult>;
  onLeave(roomId: string, player: string): Promise<VerbResult>;
  onSay(roomId: string, player: string, message: string): Promise<VerbResult>;
  onEmote(roomId: string, player: string, emote: string): Promise<VerbResult>;
  onCommand(roomId: string, player: string, text: string): Promise<VerbResult>;
  subscribe(
    roomId: string,
    handlers: {
      onVerbOutput(lines: string[]): void;
      onRoomEffect(effects: Effect[]): void;
    }
  ): () => void; // unsubscribe
}
```

Integration points:
- `GameState.login/move` → `onEnter` (render outputs, apply effects).
- `GameState.say/emote` → `onSay`/`onEmote` in addition to local echo.
- `useGame.handleCommand` → if not a core command, forward to `onCommand` and render/apply.
- Subscribe to room events on room change; unsubscribe on leave.

Command routing:
- Keep existing core commands (`look`, directions, `say`, `emote`, `@describe`, etc.).
- Forward unknown commands to `on_command`. Consider `:` prefix (e.g., `:inspect`).

## Configuration

Extend `src/config.ts` with:

```
vsc: {
  rpcUrl: string;
  wsUrl: string;
  contractAddress: string;
  network: 'testnet' | 'mainnet';
}
runtime: 'vsc'; // fixed to VSC (no fallback)
```

## Deployment (for forks)

1) Contract (VSC)
- Install VSC SDK and toolchain.
- Scaffold GameKernel (AssemblyScript) with `on_enter` and `on_command`.
- Deploy to VSC testnet; record `contractAddress`.

2) Client (Leaf)
- Add `VSCAdapter` using Keychain to sign calls (RC-based).
- Configure `config.vsc` with RPC/WS URLs and `contractAddress`.

3) Verify
- Login, move into a room with a sample verb.
- Run `:inspect` (or similar) and see outputs/effects.

## MVP Scope (Spike)

- Contract
  - Implement `on_enter`, `on_command` hooks.
  - Add two sample verbs: `inspect` (prints dynamic details), `toggle_exit <dir>` (adds/removes a test exit).
  - Emit `VerbOutputEvent` and `RoomEffectEvent`.

- Client
  - Define `VerbRuntime` interfaces and `VSCAdapter` scaffold.
  - Wire `onEnter` on room entry and unknown commands to `onCommand`.
  - Apply `SetDetail`, `SetExit`, and `Broadcast` effects.
  - Basic event subscription per room.

Acceptance:
- < 500 ms typical command round-trip on testnet.
- Deterministic, repeated outputs across clients.
- Documented end-to-end steps.

## Security & Abuse Controls

- Contract-side quotas per player/room; cooldown on `on_command`.
- Cap `output` lines and `effects` per invocation.
- Owner-only verb updates; optional ACLs per verb.
- Input validation mirrored in client (length/characters) before sending.

## Appendix: Example Effect Application (Client)

High-level application order when an effect event arrives:
1) For each `SetDetail`/`ClearDetail`, update `currentRoom.details` and refresh display when appropriate.
2) For `SetExit`, update `currentRoom.exits[direction]`.
3) For `Broadcast`, append a non-bold line to output.
4) De-duplicate by `{txId, blockNum}`.

## Notes on `leaf_server`

This design does not add any new responsibilities to `leaf_server`. The long-term goal is to remove it entirely. The programmability layer is fully client + VSC.


