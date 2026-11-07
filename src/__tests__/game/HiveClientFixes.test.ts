import { HiveClient } from '../../game/blockchain/HiveClient';
import { TimeEventConfig } from '../../game/types/GameTypes';

const computePhase = (config: Partial<TimeEventConfig>, block: number): number =>
  (HiveClient.prototype as any).computePhase.call({}, config, block);

const phases = [
  { phase: 0, name: 'A', description: '', exits: {} },
  { phase: 1, name: 'B', description: '', exits: {} },
  { phase: 2, name: 'C', description: '', exits: {} },
];

describe('HiveClient.computePhase', () => {
  it('returns 0 instead of throwing when phases are missing', () => {
    expect(computePhase({ intervalBlocks: 10, startBlock: 100 }, 500)).toBe(0);
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, phases: [] }, 500)).toBe(0);
  });

  it('returns 0 for a non-positive interval', () => {
    expect(computePhase({ intervalBlocks: 0, startBlock: 100, phases }, 500)).toBe(0);
  });

  it('cycles phases from startBlock', () => {
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, phases }, 100)).toBe(0);
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, phases }, 115)).toBe(1);
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, phases }, 130)).toBe(0);
  });

  it('applies startPhase as an offset', () => {
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, startPhase: 2, phases }, 100)).toBe(2);
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, startPhase: 2, phases }, 110)).toBe(0);
    expect(computePhase({ intervalBlocks: 10, startBlock: 100, startPhase: 1, phases }, 50)).toBe(1);
  });
});

describe('HiveClient.updatePost', () => {
  const makeThis = (jsonMetadata: string, broadcastResult: any = { success: true }) => ({
    database: {
      call: jest.fn().mockResolvedValue({ parent_author: '', parent_permlink: 'blog', json_metadata: jsonMetadata }),
    },
    keychain: { broadcast: jest.fn().mockResolvedValue(broadcastResult) },
  });

  it('keeps existing metadata fields such as connection and timeEvent', async () => {
    const original = {
      app: 'ego-death',
      connection: { fromRoom: { author: 'bob', permlink: 'dock' }, exitToNewRoom: 'east', exitFromNewRoom: 'west' },
      timeEvent: { type: 'ferry', intervalBlocks: 100, phases: [] },
    };
    const self = makeThis(JSON.stringify(original));
    await (HiveClient.prototype as any).updatePost.call(self, 'alice', 'gondola', 'Gondola', 'Body', { app: 'ego-death', tags: ['ego-death'] });

    const op = self.keychain.broadcast.mock.calls[0][0].operations[0][1];
    const written = JSON.parse(op.json_metadata);
    expect(written.connection).toEqual(original.connection);
    expect(written.timeEvent).toEqual(original.timeEvent);
    expect(written.tags).toEqual(['ego-death']);
  });

  it('throws when Keychain reports failure', async () => {
    const self = makeThis('{}', { success: false, message: 'User cancelled' });
    await expect(
      (HiveClient.prototype as any).updatePost.call(self, 'alice', 'gondola', 'Gondola', 'Body', {})
    ).rejects.toThrow('User cancelled');
  });
});

describe('HiveClient.signMessage', () => {
  const sign = (keychain: any) =>
    (HiveClient.prototype as any).signMessage.call({ keychain }, 'alice', 'leaf-chat-login:alice:n:1');

  it('returns the Keychain signature for the posting key', async () => {
    const signBuffer = jest.fn().mockResolvedValue({ success: true, result: 'abc123' });
    await expect(sign({ signBuffer })).resolves.toBe('abc123');
    expect(signBuffer).toHaveBeenCalledWith(expect.objectContaining({
      username: 'alice',
      message: 'leaf-chat-login:alice:n:1',
      method: 'Posting'
    }));
  });

  it('returns null when the user cancels', async () => {
    await expect(sign({ signBuffer: jest.fn().mockRejectedValue(new Error('User cancelled')) })).resolves.toBeNull();
    await expect(sign({ signBuffer: jest.fn().mockResolvedValue({ success: false, message: 'cancel' }) })).resolves.toBeNull();
  });

  it('returns null when Keychain cannot sign messages', async () => {
    await expect(sign({ broadcast: jest.fn() })).resolves.toBeNull();
    await expect(sign(undefined)).resolves.toBeNull();
  });
});

describe('HiveClient Hive mutes', () => {
  it('broadcasts a follow ignore op to mute, and an empty one to unmute', async () => {
    const broadcast = jest.fn().mockResolvedValue({ success: true });
    const ctx = { keychain: { broadcast } };
    await (HiveClient.prototype as any).setHiveMute.call(ctx, 'alice', 'pest', true);
    await (HiveClient.prototype as any).setHiveMute.call(ctx, 'alice', 'pest', false);
    const [muteOp] = broadcast.mock.calls[0][0].operations;
    const [unmuteOp] = broadcast.mock.calls[1][0].operations;
    expect(muteOp[0]).toBe('custom_json');
    expect(muteOp[1].id).toBe('follow');
    expect(muteOp[1].required_posting_auths).toEqual(['alice']);
    expect(JSON.parse(muteOp[1].json)).toEqual(['follow', { follower: 'alice', following: 'pest', what: ['ignore'] }]);
    expect(JSON.parse(unmuteOp[1].json)).toEqual(['follow', { follower: 'alice', following: 'pest', what: [] }]);
  });

  it('throws when Keychain reports failure without throwing', async () => {
    const ctx = { keychain: { broadcast: jest.fn().mockResolvedValue({ success: false, message: 'nope' }) } };
    await expect((HiveClient.prototype as any).setHiveMute.call(ctx, 'alice', 'pest', true)).rejects.toThrow('nope');
  });

  it('pages through the Hive mute list', async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({ following: `user${String(i).padStart(4, '0')}` }));
    const call = jest.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([{ following: 'user0999' }, { following: 'zed' }]);
    const muted = await (HiveClient.prototype as any).getHiveMutes.call({ database: { call } }, 'alice');
    expect(muted).toHaveLength(1001);
    expect(call).toHaveBeenNthCalledWith(2, 'get_following', ['alice', 'user0999', 'ignore', 1000]);
  });
});
