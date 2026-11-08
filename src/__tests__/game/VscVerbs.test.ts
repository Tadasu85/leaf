import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { HiveClient } from '../../game/blockchain/HiveClient';
import { buildVscCall, MAX_VSC_CALL_BYTES } from '../../game/verbs/vscCall';
import { applyVerbEffects, cleanEffects, effectsFromFlags } from '../../game/verbs/verbEffects';
import { parseFlags, VscVerbRuntime } from '../../game/verbs/VscVerbRuntime';
import { objectsToText, parseRoomObjects, textToObjects } from '../../game/rooms/roomObjects';
import { RoomData } from '../../game/types/GameTypes';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    hive: { nodes: ['https://api.hive.test'] },
    game: { idName: 'ego-death', account: 'hive-109456', startRoom: { author: 'ray', permlink: 'genesis' } },
    builders: [],
    admins: [],
    vsc: { contractId: '', netId: 'vsc-mainnet', graphqlUrls: [], rcLimit: 1000 },
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn(), announceObjectUse: jest.fn() })),
}));

const cfg = { contractId: 'vsc1LeafVerbs', netId: 'vsc-mainnet', rcLimit: 1000, graphqlUrls: ['https://a/gql', 'https://b/gql'] };

describe('VSC calls', () => {
  it('builds a vsc.call custom_json signed with the posting key', () => {
    const op = buildVscCall(cfg, 'alice', 'use', { room: 'ray/vault', object: 'lever', verb: 'pull' });
    expect(op).toMatchObject({ id: 'vsc.call', required_auths: [], required_posting_auths: ['alice'] });
    const inner = JSON.parse(op.json);
    expect(inner).toEqual({
      net_id: 'vsc-mainnet',
      caller: 'hive:alice',
      contract_id: 'vsc1LeafVerbs',
      action: 'use',
      payload: '{"room":"ray/vault","object":"lever","verb":"pull"}',
      rc_limit: 1000,
      intents: [],
    });
  });

  it('can sign with the active key instead', () => {
    expect(buildVscCall(cfg, 'alice', 'use', {}, 'active')).toMatchObject({ required_auths: ['alice'], required_posting_auths: [] });
  });

  it('refuses guests, a missing contract and oversized calls', () => {
    expect(() => buildVscCall(cfg, 'Guest-000001', 'use', {})).toThrow(/Hive account/);
    expect(() => buildVscCall({ ...cfg, contractId: '' }, 'alice', 'use', {})).toThrow(/contract/);
    expect(() => buildVscCall(cfg, 'alice', 'define', { big: 'x'.repeat(MAX_VSC_CALL_BYTES) })).toThrow(/too large/);
  });
});

describe('verb effects', () => {
  const room = (exits: Record<string, string>): RoomData =>
    ({ id: 'ray/vault', title: 'Vault', description: '', author: 'ray', permlink: 'vault', exits, players: [], details: {} });

  it('keeps only well-formed exit effects', () => {
    expect(cleanEffects([
      { type: 'SetExit', direction: 'north', target: 'ray/treasury' },
      { type: 'SetExit', direction: 'north', target: 'Bad Target!' },
      { type: 'ClearExit', direction: 'south' },
      { type: 'Teleport', direction: 'up' },
      { type: 'SetExit', direction: 'NORTH', target: 'x' },
      null,
    ])).toEqual([
      { type: 'SetExit', direction: 'north', target: 'ray/treasury' },
      { type: 'ClearExit', direction: 'south' },
    ]);
    expect(cleanEffects('nope')).toEqual([]);
  });

  it('turns exit:<direction> flags into open exits', () => {
    expect(effectsFromFlags({ lever: 'down', 'exit:north': 'ray/treasury', 'exit:down': 'cellar' })).toEqual([
      { type: 'SetExit', direction: 'down', target: 'cellar' },
      { type: 'SetExit', direction: 'north', target: 'ray/treasury' },
    ]);
    expect(effectsFromFlags(null)).toEqual([]);
  });

  it("opens and closes contract exits but never the map's own", () => {
    const start = room({ south: 'hall' });
    const opened = applyVerbEffects(start, [
      { type: 'SetExit', direction: 'north', target: 'ray/treasury' },
      { type: 'SetExit', direction: 'south', target: 'elsewhere' },
    ]);
    expect(opened.room.exits).toEqual({ south: 'hall', north: 'ray/treasury' });
    expect(start.exits).toEqual({ south: 'hall' }); // not mutated
    const closed = applyVerbEffects(opened.room, [
      { type: 'ClearExit', direction: 'north' },
      { type: 'ClearExit', direction: 'south' },
    ], opened.contractExits);
    expect(closed.room.exits).toEqual({ south: 'hall' });
    expect([...closed.contractExits]).toEqual([]);
  });
});

describe('VscVerbRuntime', () => {
  it('broadcasts use as the player', async () => {
    const broadcast = jest.fn().mockResolvedValue(undefined);
    await new VscVerbRuntime(cfg, broadcast).use('alice', 'ray/vault', 'lever', 'pull');
    expect(broadcast).toHaveBeenCalledWith('alice', expect.objectContaining({ id: 'vsc.call' }));
    expect(JSON.parse(JSON.parse(broadcast.mock.calls[0][1].json).payload)).toEqual({ room: 'ray/vault', object: 'lever', verb: 'pull' });
  });

  it('reads flags with getStateByKeys, trying the next node on failure', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ json: async () => ({ data: { getStateByKeys: { 'f/ray/vault': '{"lever":"down","exit:north":"ray/treasury"}' } } }) });
    const flags = await new VscVerbRuntime(cfg, jest.fn(), fetcher as any).readFlags('ray/vault');
    expect(flags).toEqual({ lever: 'down', 'exit:north': 'ray/treasury' });
    expect(fetcher.mock.calls[1][0]).toBe('https://b/gql');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).variables).toEqual({ contractId: 'vsc1LeafVerbs', keys: ['f/ray/vault'] });
  });

  it('returns null when no node answers', async () => {
    const fetcher = jest.fn().mockResolvedValue({ json: async () => ({ errors: [{ message: 'no' }] }) });
    expect(await new VscVerbRuntime(cfg, jest.fn(), fetcher as any).readFlags('ray/vault')).toBeNull();
  });

  it('parses stored flags defensively', () => {
    expect(parseFlags({ k: '{"a":"1","b":2}' }, 'k')).toEqual({ a: '1' });
    expect(parseFlags({ k: 'not json' }, 'k')).toEqual({});
    expect(parseFlags({ k: { a: 'x' } }, 'k')).toEqual({ a: 'x' });
    expect(parseFlags(null, 'k')).toEqual({});
  });

  it('sends one custom_json through Keychain', async () => {
    const broadcast = jest.fn().mockResolvedValue({ success: true });
    const op = buildVscCall(cfg, 'alice', 'use', {});
    await (HiveClient.prototype as any).broadcastCustomJson.call({ keychain: { broadcast } }, 'alice', op);
    expect(broadcast.mock.calls[0][0]).toMatchObject({ username: 'alice', operations: [['custom_json', op]], method: 'Posting' });
    broadcast.mockResolvedValue({ success: false, message: 'user cancelled' });
    await expect((HiveClient.prototype as any).broadcastCustomJson.call({ keychain: { broadcast } }, 'alice', op)).rejects.toThrow('user cancelled');
  });
});

describe('room objects marked for VSC', () => {
  it('round-trips the * marker through Edit Room text', () => {
    const { objects, error } = textToObjects('*pull lever: You reach for the lever. | %n reaches for the lever.\nring bell: Ding.');
    expect(error).toBeUndefined();
    expect(objects).toEqual({
      lever: { pull: { self: 'You reach for the lever.', others: '%n reaches for the lever.', vsc: true } },
      bell: { ring: { self: 'Ding.' } },
    });
    expect(objectsToText(objects)).toBe('*pull lever: You reach for the lever. | %n reaches for the lever.\nring bell: Ding.');
  });

  it('reads vsc: true from post metadata and ignores other values', () => {
    expect(parseRoomObjects({ objects: { lever: { pull: { self: 'x', vsc: true }, push: { self: 'y', vsc: 'yes' } } } }))
      .toEqual({ lever: { pull: { self: 'x', vsc: true }, push: { self: 'y' } } });
  });
});

describe('GameState with VSC verbs', () => {
  let gameState: GameState;
  let verbs: { isReady: jest.Mock; use: jest.Mock; readFlags: jest.Mock };
  const out = () => gameState.getOutputMessages().map(m => m.output);
  const vault = (): RoomData => ({
    id: 'ray/vault', title: 'Vault', description: '', author: 'ray', permlink: 'vault',
    exits: { south: 'hall' }, players: [], details: {},
    objects: { lever: { pull: { self: 'You reach for the lever.', vsc: true } }, bell: { ring: { self: 'Ding.' } } },
  });

  beforeEach(() => {
    const hiveClient = Object.assign(new EventEmitter(), {
      getRoomData: jest.fn(async () => vault()),
      getRoomDetails: jest.fn().mockResolvedValue({}),
      getTimeEventConfig: jest.fn().mockReturnValue(null),
      getGameMap: jest.fn().mockReturnValue({}),
      registerTimeEventRoom: jest.fn(),
      unregisterTimeEventRoom: jest.fn(),
    });
    gameState = new GameState(hiveClient as any, new EventEmitter() as any);
    verbs = {
      isReady: jest.fn().mockReturnValue(true),
      use: jest.fn().mockResolvedValue(undefined),
      readFlags: jest.fn().mockResolvedValue({}),
    };
    (gameState as any).verbs = verbs;
    gameState.verbRefreshDelayMs = 0;
    (gameState as any).player = { username: 'alice', location: { author: 'ray', permlink: 'vault' }, isAdmin: false, isBuilder: false, characterDescription: '' };
  });

  const flush = () => new Promise(r => setTimeout(r, 5));

  it('shows the waiting line, calls the contract, then shows the exit it opened', async () => {
    await gameState.loadRoom({ author: 'ray', permlink: 'vault' }, true);
    verbs.readFlags.mockResolvedValue({ lever: 'down', 'exit:north': 'ray/treasury' });
    expect(gameState.tryRoomObject('pull the lever')).toBe(true);
    expect(out()).toContain('You reach for the lever.');
    await flush();
    expect(verbs.use).toHaveBeenCalledWith('alice', 'ray/vault', 'lever', 'pull');
    await flush();
    expect(gameState.getCurrentRoom()?.exits).toEqual({ south: 'hall', north: 'ray/treasury' });
  });

  it('closes an exit the contract opened once its flag is gone', async () => {
    verbs.readFlags.mockResolvedValue({ 'exit:north': 'ray/treasury' });
    await gameState.loadRoom({ author: 'ray', permlink: 'vault' }, true);
    await flush();
    expect(gameState.getCurrentRoom()?.exits.north).toBe('ray/treasury');
    verbs.readFlags.mockResolvedValue({});
    await gameState.refreshVerbState();
    expect(gameState.getCurrentRoom()?.exits).toEqual({ south: 'hall' });
  });

  it('leaves text-only objects alone', async () => {
    await gameState.loadRoom({ author: 'ray', permlink: 'vault' }, true);
    gameState.tryRoomObject('ring bell');
    await flush();
    expect(out()).toContain('Ding.');
    expect(verbs.use).not.toHaveBeenCalled();
  });

  it('keeps guests out of contract verbs', async () => {
    await gameState.loadRoom({ author: 'ray', permlink: 'vault' }, true);
    (gameState as any).player.isGuest = true;
    gameState.tryRoomObject('pull lever');
    expect(out().some(l => /Only Hive players/.test(l))).toBe(true);
    expect(verbs.use).not.toHaveBeenCalled();
  });

  it('says so when the call fails', async () => {
    await gameState.loadRoom({ author: 'ray', permlink: 'vault' }, true);
    verbs.use.mockRejectedValue(new Error('cancelled'));
    gameState.tryRoomObject('pull lever');
    await flush();
    expect(out()).toContain("That didn't go through. Nothing changed.");
  });
});
