import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { GuestSession, guestSession, isGuestName } from '../../game/guest/GuestSession';
import { RoomData } from '../../game/types/GameTypes';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    game: {
      idName: 'ego-death',
      account: 'hive-109456',
      startRoom: { author: 'start-author', permlink: 'start-room' },
    },
    builders: [],
    admins: [],
  },
}));

jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('isGuestName', () => {
  it('only matches server-style guest names', () => {
    expect(isGuestName('Guest-004821')).toBe(true);
    expect(isGuestName('guest-004821')).toBe(false);
    expect(isGuestName('Guest-48')).toBe(false);
    expect(isGuestName('alice')).toBe(false);
  });
});

describe('GuestSession', () => {
  it('gets a guest name from the server and saves it', async () => {
    const storage = memoryStorage();
    const fetchFn = jest.fn(async () => jsonResponse(200, { username: 'Guest-000123', sessionToken: 'tok' }));
    const session = new GuestSession({ storage, fetchFn: fetchFn as any, serverUrl: 'https://srv/' });
    await expect(session.start()).resolves.toEqual({ username: 'Guest-000123', sessionToken: 'tok' });
    expect(fetchFn).toHaveBeenCalledWith('https://srv/auth/guest');
    expect(session.getToken('Guest-000123')).toBe('tok');
  });

  it('resumes the saved guest and position without asking the server', async () => {
    const storage = memoryStorage();
    const fetchFn = jest.fn(async () => jsonResponse(200, { username: 'Guest-000123', sessionToken: 'tok' }));
    const first = new GuestSession({ storage, fetchFn: fetchFn as any });
    await first.start();
    first.saveLocation({ author: 'a', permlink: 'cave' });
    const second = new GuestSession({ storage, fetchFn: fetchFn as any });
    await expect(second.start()).resolves.toEqual({
      username: 'Guest-000123', sessionToken: 'tok', location: { author: 'a', permlink: 'cave' }
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('makes an offline guest that can explore when the server is down', async () => {
    const session = new GuestSession({
      storage: memoryStorage(),
      fetchFn: (async () => { throw new Error('Failed to fetch'); }) as any
    });
    const identity = await session.start();
    expect(isGuestName(identity.username)).toBe(true);
    expect(identity.sessionToken).toBeUndefined();
  });

  it('upgrades an offline guest once the server answers, keeping its position', async () => {
    const storage = memoryStorage();
    const down = new GuestSession({ storage, fetchFn: (async () => jsonResponse(503, {})) as any });
    await down.start();
    down.saveLocation({ author: 'a', permlink: 'cave' });
    const up = new GuestSession({
      storage,
      fetchFn: (async () => jsonResponse(200, { username: 'Guest-000999', sessionToken: 'tok' })) as any
    });
    await expect(up.start()).resolves.toEqual({
      username: 'Guest-000999', sessionToken: 'tok', location: { author: 'a', permlink: 'cave' }
    });
  });

  it('ignores corrupt saved data', async () => {
    const storage = memoryStorage();
    storage.setItem('leaf.guest', '{"username":"hive-109456","sessionToken":"x"}');
    const session = new GuestSession({ storage, fetchFn: (async () => jsonResponse(404, {})) as any });
    expect(session.load()).toBeNull();
    storage.setItem('leaf.guest', 'not json');
    expect(session.load()).toBeNull();
  });
});

class MockHiveClient extends EventEmitter {
  loadAllGameData = jest.fn().mockResolvedValue(undefined);
  getRoomData = jest.fn();
  getRoomDetails = jest.fn().mockResolvedValue({});
  getTimeEventConfig = jest.fn().mockReturnValue(null);
  getGameMap = jest.fn().mockReturnValue({
    'start-room': { author: 'start-author', exits: {} },
    'cave-room': { author: 'auth', exits: {} },
    'forest-room': { author: 'auth', exits: {} },
  });
  moveTo = jest.fn().mockResolvedValue(undefined);
  setDescription = jest.fn().mockResolvedValue(undefined);
  setShortDescription = jest.fn().mockResolvedValue(undefined);
  startBlockStream = jest.fn();
  registerTimeEventRoom = jest.fn();
  unregisterTimeEventRoom = jest.fn();
  database = { call: jest.fn(), getAccountHistory: jest.fn() };
}

const room = (permlink: string, extra: Partial<RoomData> = {}): RoomData => ({
  id: permlink, title: permlink, description: '', author: permlink === 'start-room' ? 'start-author' : 'auth',
  permlink, exits: { north: 'forest-room' }, players: [], details: {}, ...extra,
});

describe('GameState guest play', () => {
  let hiveClient: MockHiveClient;
  let gameState: GameState;
  let saveLocation: jest.SpyInstance;

  beforeEach(() => {
    hiveClient = new MockHiveClient();
    hiveClient.getRoomData.mockImplementation(async (loc: { permlink: string }) => room(loc.permlink));
    gameState = new GameState(hiveClient as any, new EventEmitter() as any);
    saveLocation = jest.spyOn(guestSession, 'saveLocation').mockImplementation(() => {});
  });

  afterEach(() => saveLocation.mockRestore());

  const messages = () => gameState.getOutputMessages().map(m => m.output);

  it('starts a new guest in the start room without touching their Hive account', async () => {
    await gameState.loginAsGuest({ username: 'Guest-000001', sessionToken: 't' });
    expect(gameState.getPlayer()).toMatchObject({ username: 'Guest-000001', isGuest: true, isBuilder: false, isAdmin: false });
    expect(gameState.getPlayer()?.location).toEqual({ author: 'start-author', permlink: 'start-room' });
    expect(hiveClient.database.call).not.toHaveBeenCalled();
    expect(hiveClient.database.getAccountHistory).not.toHaveBeenCalled();
  });

  it('resumes a guest where they left off', async () => {
    await gameState.loginAsGuest({ username: 'Guest-000001', location: { author: 'auth', permlink: 'cave-room' } });
    expect(gameState.getCurrentRoom()?.permlink).toBe('cave-room');
  });

  it('falls back to the start room if the saved room is no longer on the map', async () => {
    await gameState.loginAsGuest({ username: 'Guest-000001', location: { author: 'someone', permlink: 'gone' } });
    expect(gameState.getPlayer()?.location?.permlink).toBe('start-room');
  });

  it('saves moves in the browser instead of broadcasting them', async () => {
    await gameState.loginAsGuest({ username: 'Guest-000001' });
    await gameState.move('north');
    expect(hiveClient.moveTo).not.toHaveBeenCalled();
    expect(saveLocation).toHaveBeenCalledWith({ author: 'auth', permlink: 'forest-room' });
    expect(gameState.getCurrentRoom()?.permlink).toBe('forest-room');
  });

  it('explains that guests cannot set descriptions', async () => {
    await gameState.loginAsGuest({ username: 'Guest-000001' });
    await gameState.setDescription('A wanderer');
    await gameState.setShortDescription('wanderer');
    expect(hiveClient.setDescription).not.toHaveBeenCalled();
    expect(hiveClient.setShortDescription).not.toHaveBeenCalled();
    expect(messages()).toContain("Guests can't set a description. Log in with a Hive account to do that.");
  });

  it('describes a guest when another player looks at them', async () => {
    hiveClient.getRoomData.mockImplementation(async (loc: { permlink: string }) => room(loc.permlink, { players: ['Guest-000002'] }));
    (gameState as any).player = { username: 'alice', location: { author: 'start-author', permlink: 'start-room' }, isAdmin: false, isBuilder: false, characterDescription: '' };
    await gameState.loadRoom({ author: 'start-author', permlink: 'start-room' }, true);
    (gameState as any).currentRoom.players = ['Guest-000002'];
    await gameState.lookAtPlayer('guest-000002');
    expect(messages()).toContain('Guest-000002 is a guest, looking around without a Hive account.');
    expect(hiveClient.database.call).not.toHaveBeenCalled();
  });

  it('still broadcasts moves for regular players', async () => {
    (gameState as any).player = { username: 'alice', location: { author: 'start-author', permlink: 'start-room' }, isAdmin: false, isBuilder: false, characterDescription: '' };
    (gameState as any).isBulkDataLoaded = true;
    await gameState.loadRoom({ author: 'start-author', permlink: 'start-room' }, true);
    await gameState.move('north');
    expect(hiveClient.moveTo).toHaveBeenCalledWith('alice', { author: 'auth', permlink: 'forest-room' });
    expect(saveLocation).not.toHaveBeenCalled();
  });
});
