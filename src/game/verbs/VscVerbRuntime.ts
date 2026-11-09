/**
 * Runs stateful room verbs on the Leaf verbs contract (contracts/leaf-verbs).
 *
 * - `use` broadcasts a signed `vsc.call` through Keychain. The player is the
 *   signer; the contract never trusts a name in the payload.
 * - `readFlags` reads a room's flags from a VSC node's GraphQL API, so a room
 *   shows exits other players opened.
 *
 * The outcome of a call (its `self` line) is produced by the contract a block
 * or so later. Reading it back (findContractOutput) is the next milestone;
 * until then the client shows a pending line and re-reads the room's flags.
 */
import { buildVscCall, CustomJsonOp, VscCallConfig } from './vscCall';

export interface VscRuntimeConfig extends VscCallConfig {
  /** VSC node GraphQL endpoints, tried in order. */
  graphqlUrls: string[];
}

export type Broadcast = (username: string, op: CustomJsonOp) => Promise<void>;
type Fetch = typeof fetch;

/**
 * State key the contract keeps a room's flags under (kernel.FlagsKey):
 * "f|author:permlink". Keys never contain "/" because a VSC node's state
 * store treats it as a directory path.
 */
export const flagsKey = (roomId: string) => `f|${roomId.replace('/', ':')}`;

// Unverified against a live node: VSC's GraphQL exposes getStateByKeys, used
// by its own token SDK, but check the argument names in the node's GraphiQL
// explorer before relying on it.
const STATE_QUERY = `query LeafRoomFlags($contractId: String!, $keys: [String!]!) {
  getStateByKeys(contractId: $contractId, keys: $keys)
}`;

export class VscVerbRuntime {
  constructor(
    private config: VscRuntimeConfig,
    private broadcast: Broadcast,
    private fetcher: Fetch = (...args) => fetch(...args),
  ) {}

  isReady(): boolean {
    return Boolean(this.config.contractId && this.config.netId);
  }

  async use(username: string, roomId: string, object: string, verb: string): Promise<void> {
    const op = buildVscCall(this.config, username, 'use', { room: roomId, object, verb });
    await this.broadcast(username, op);
  }

  /** A room's flags, or null if no node could be read. */
  async readFlags(roomId: string): Promise<Record<string, string> | null> {
    const key = flagsKey(roomId);
    for (const url of this.config.graphqlUrls) {
      try {
        const res = await this.fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: STATE_QUERY, variables: { contractId: this.config.contractId, keys: [key] } }),
        });
        const body = await res.json() as { data?: { getStateByKeys?: unknown }; errors?: unknown };
        if (!body.data || body.errors) continue;
        return parseFlags(body.data.getStateByKeys, key);
      } catch {
        // try the next node
      }
    }
    return null;
  }
}

/** getStateByKeys returns key → value (the value is the JSON the contract stored). */
export function parseFlags(state: unknown, key: string): Record<string, string> {
  if (!state || typeof state !== 'object') return {};
  const raw = (state as Record<string, unknown>)[key];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const flags: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && k.length <= 32 && v.length <= 80) flags[k] = v;
  }
  return flags;
}
