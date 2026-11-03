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
