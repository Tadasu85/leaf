/**
 * Building calls to a VSC (Magi) contract. A call is an ordinary Hive
 * `custom_json` with id `vsc.call`; VSC nodes pick it up from the chain and
 * run the contract with the signer as `msg.caller`. The inner fields follow
 * VSC's own SDKs: net_id, caller, contract_id, action, payload (a JSON
 * string), rc_limit, intents.
 *
 * Leaf signs these with the posting key, like moves. If the network turns
 * out to require active authority for contract calls, change `authority`.
 */

export interface VscCallConfig {
  /** e.g. "vsc-mainnet" */
  netId: string;
  /** The deployed Leaf verbs contract, e.g. "vsc1…". */
  contractId: string;
  /** Resource-credit ceiling for one call. */
  rcLimit: number;
}

export type VscAction = 'use' | 'define' | 'remove' | 'reset';

export interface CustomJsonOp {
  required_auths: string[];
  required_posting_auths: string[];
  id: 'vsc.call';
  json: string;
}

/** Hive's limit on a custom_json body; VSC refuses larger calls. */
export const MAX_VSC_CALL_BYTES = 8192;

const HIVE_NAME = /^[a-z][a-z0-9.-]{2,15}$/;

/** Bytes in the UTF-8 encoding of `s` (no TextEncoder in every runtime). */
const utf8Length = (s: string): number => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

export function buildVscCall(
  config: VscCallConfig,
  username: string,
  action: VscAction,
  payload: Record<string, unknown>,
  authority: 'posting' | 'active' = 'posting',
): CustomJsonOp {
  if (!HIVE_NAME.test(username)) throw new Error(`Not a Hive account: ${username}`);
  if (!config.contractId) throw new Error('No VSC contract configured');
  const json = JSON.stringify({
    net_id: config.netId,
    caller: `hive:${username}`,
    contract_id: config.contractId,
    action,
    payload: JSON.stringify(payload),
    rc_limit: config.rcLimit,
    intents: [],
  });
  if (utf8Length(json) > MAX_VSC_CALL_BYTES) {
    throw new Error('VSC call is too large');
  }
  return {
    required_auths: authority === 'active' ? [username] : [],
    required_posting_auths: authority === 'posting' ? [username] : [],
    id: 'vsc.call',
    json,
  };
}
