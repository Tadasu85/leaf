import { findPendingRooms, getPendingRoomStatus, pendingRoomLimitFor, DEFAULT_PENDING_ROOM_LIMIT } from '../../game/rooms/pendingRooms';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: { hive: { nodes: ['https://api.hive.test'] }, game: { idName: 'ego-death', account: 'hive-109456' } },
}));

const post = (permlink: string, meta: object = { app: 'ego-death', type: 'room' }) => ({ permlink, title: permlink, json_metadata: JSON.stringify(meta) });

const makeClient = (posts: any[], replies: Record<string, any[]> = {}, gameMeta: object = {}) => ({
  call: jest.fn().mockResolvedValue(posts),
  database: {
    call: jest.fn(async (method: string, params: any[]) => (method === 'get_content_replies' ? replies[params[1]] ?? [] : [])),
    getAccounts: jest.fn().mockResolvedValue([{ posting_json_metadata: JSON.stringify({ egodeathgamedata: gameMeta }) }]),
  },
}) as any;

describe('pending rooms', () => {
  it('counts room posts that are not on the map and not rejected', async () => {
    const client = makeClient(
      [post('approved'), post('waiting'), post('rejected'), post('blog-post', { app: 'peakd' })],
      { rejected: [{ author: 'hive-109456', body: 'Rejected: too short' }] }
    );
    const pending = await findPendingRooms(client, 'alice', { approved: { author: 'alice' } });
    expect(pending.map(p => p.content.permlink)).toEqual(['waiting']);
  });

  it("still lists a room whose permlink another author's room uses", async () => {
    const client = makeClient([post('the-dock'), post('pier')]);
    const pending = await findPendingRooms(client, 'alice', {
      'the-dock': { author: 'ray' },
      'alice/pier': { author: 'alice' },
    });
    expect(pending.map(p => p.content.permlink)).toEqual(['the-dock']);
  });

  it('uses the default limit unless the admin set one', () => {
    expect(pendingRoomLimitFor({}, 'alice')).toBe(DEFAULT_PENDING_ROOM_LIMIT);
    expect(pendingRoomLimitFor({ builderLimits: { alice: 5 } }, 'alice')).toBe(5);
    expect(pendingRoomLimitFor({ builderLimits: { alice: 'lots' } }, 'alice')).toBe(DEFAULT_PENDING_ROOM_LIMIT);
  });

  it('reports a builder at their limit', async () => {
    const client = makeClient([post('a'), post('b'), post('c')], {}, { rooms_authors_exits: {} });
    await expect(getPendingRoomStatus(client, 'alice')).resolves.toEqual({ pending: 3, limit: 3, atLimit: true });
  });

  it('honours a raised limit from the game account', async () => {
    const client = makeClient([post('a'), post('b'), post('c')], {}, { rooms_authors_exits: {}, builderLimits: { alice: 4 } });
    await expect(getPendingRoomStatus(client, 'alice')).resolves.toEqual({ pending: 3, limit: 4, atLimit: false });
  });
});
