import { EventEmitter } from 'events';
import { parseExitMessages, buildExitMessages, renderExitMessage, MAX_EXIT_MESSAGE_LENGTH } from '../../game/rooms/exitMessages';
import { GameState } from '../../game/state/GameState';
import { RoomData } from '../../game/types/GameTypes';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    game: { idName: 'ego-death', account: 'hive-109456', startRoom: { author: 'ray', permlink: 'glass-room' } },
    builders: [],
    admins: [],
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

describe('exit message helpers', () => {
  it('reads exit messages from post metadata', () => {
    const meta = JSON.stringify({ exitMessages: { north: { leave: '  You   climb. ', arrive: 'You arrive.' }, up: { leave: '' } } });
    expect(parseExitMessages(meta)).toEqual({ north: { leave: 'You climb.', arrive: 'You arrive.' } });
  });

  it('ignores missing, malformed and hostile metadata', () => {
    expect(parseExitMessages('')).toBeUndefined();
    expect(parseExitMessages('not json')).toBeUndefined();
    expect(parseExitMessages('{"exitMessages":["x"]}')).toBeUndefined();
    expect(parseExitMessages({ exitMessages: { 'Bad Key!': { leave: 'x' }, north: { leave: 42 } } })).toBeUndefined();
    const long = parseExitMessages({ exitMessages: { north: { leave: 'a'.repeat(500) } } });
    expect(long!.north.leave).toHaveLength(MAX_EXIT_MESSAGE_LENGTH);
  });

  it('keeps only real exits and non-empty texts when saving', () => {
    expect(buildExitMessages(['north'], { north: { leave: ' x ', arrive: ' ' }, gone: { leave: 'y' } })).toEqual({ north: { leave: 'x' } });
  });

  it('keeps lines for other players too', () => {
    expect(parseExitMessages({ exitMessages: { up: { othersLeave: '%n climbs.', othersArrive: '%n appears.' } } }))
      .toEqual({ up: { othersLeave: '%n climbs.', othersArrive: '%n appears.' } });
  });

  it('fills in the player name', () => {
    expect(renderExitMessage('%n climbs. 100%% sure, %N.', 'alice')).toBe('alice climbs. 100% sure, alice.');
  });
});

describe('exit messages on moves', () => {
  const rooms: Record<string, RoomData> = {
    'glass-room': {
      id: 'ray/glass-room', title: 'Glass Room', description: 'Ferns.', author: 'ray', permlink: 'glass-room',
      exits: { up: 'loft', south: 'hall' }, players: [], details: {},
      exitMessages: { up: { leave: 'You climb the narrow ladder.', arrive: '%n pokes their head into the loft.' } },
    },
    loft: { id: 'ray/loft', title: 'Loft', description: 'Dusty.', author: 'ray', permlink: 'loft', exits: { down: 'glass-room' }, players: [], details: {} },
    hall: { id: 'ray/hall', title: 'Hall', description: 'Echoing.', author: 'ray', permlink: 'hall', exits: {}, players: [], details: {} },
  };
  let hiveClient: any;
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(async () => {
    hiveClient = Object.assign(new EventEmitter(), {
      getRoomData: jest.fn(async (loc: { permlink: string }) => rooms[loc.permlink]),
      getRoomDetails: jest.fn().mockResolvedValue({}),
      getTimeEventConfig: jest.fn().mockReturnValue(null),
      getGameMap: jest.fn().mockReturnValue({ loft: { author: 'ray' }, hall: { author: 'ray' }, 'glass-room': { author: 'ray' } }),
      moveTo: jest.fn().mockResolvedValue(undefined),
      registerTimeEventRoom: jest.fn(),
      unregisterTimeEventRoom: jest.fn(),
      invalidateRoom: jest.fn(),
    });
    gameState = new GameState(hiveClient, new EventEmitter() as any);
    (gameState as any).player = { username: 'alice', location: { author: 'ray', permlink: 'glass-room' }, isAdmin: false, isBuilder: false, characterDescription: '' };
    (gameState as any).isBulkDataLoaded = true;
    await gameState.loadRoom({ author: 'ray', permlink: 'glass-room' }, true);
  });

  it('shows the leave line before the next room and the arrive line after it', async () => {
    await gameState.move('up');
    const lines = out();
    const leave = lines.indexOf('You climb the narrow ladder.');
    const title = lines.lastIndexOf('Loft');
    const arrive = lines.indexOf('alice pokes their head into the loft.');
    expect(leave).toBeGreaterThanOrEqual(0);
    expect(title).toBeGreaterThan(leave);
    expect(arrive).toBeGreaterThan(title);
  });

  it('shows nothing extra for exits without messages', async () => {
    const before = out().length;
    await gameState.move('south');
    expect(out().slice(before)).not.toContain('You climb the narrow ladder.');
  });

  it('reloadRoom drops the cached post first', async () => {
    await gameState.reloadRoom({ author: 'ray', permlink: 'glass-room' });
    expect(hiveClient.invalidateRoom).toHaveBeenCalledWith('ray', 'glass-room');
  });
});

describe('exit lines other players see', () => {
  const glass: RoomData = {
    id: 'ray/glass-room', title: 'Glass Room', description: '', author: 'ray', permlink: 'glass-room',
    exits: { up: 'loft', south: 'hall' }, players: [], details: {},
    exitMessages: { up: { othersLeave: '%n climbs the narrow ladder.', othersArrive: '%n pokes their head up through the hatch.' } },
  };
  const loft: RoomData = { id: 'ray/loft', title: 'Loft', description: '', author: 'ray', permlink: 'loft', exits: { down: 'glass-room' }, players: [], details: {} };
  const hall: RoomData = { id: 'ray/hall', title: 'Hall', description: '', author: 'ray', permlink: 'hall', exits: {}, players: [], details: {} };
  let hiveClient: any;
  let socketManager: any;
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);
  const flush = () => new Promise(r => setTimeout(r, 0));

  beforeEach(async () => {
    const rooms: Record<string, RoomData> = { 'glass-room': glass, loft, hall };
    hiveClient = Object.assign(new EventEmitter(), {
      getRoomData: jest.fn(async (loc: { permlink: string }) => rooms[loc.permlink]),
      getRoomDetails: jest.fn().mockResolvedValue({}),
      getTimeEventConfig: jest.fn().mockReturnValue(null),
      getGameMap: jest.fn().mockReturnValue({ loft: { author: 'ray' }, hall: { author: 'ray' }, 'glass-room': { author: 'ray' } }),
      moveTo: jest.fn().mockResolvedValue(undefined),
      registerTimeEventRoom: jest.fn(),
      unregisterTimeEventRoom: jest.fn(),
    });
    socketManager = Object.assign(new EventEmitter(), { announceExit: jest.fn() });
    gameState = new GameState(hiveClient, null as any);
    gameState.setSocketManager(socketManager);
    (gameState as any).isBulkDataLoaded = true;
  });

  const standIn = async (permlink: string, username = 'bob') => {
    (gameState as any).player = { username, location: { author: 'ray', permlink }, isAdmin: false, isBuilder: false, characterDescription: '' };
    await gameState.loadRoom({ author: 'ray', permlink }, true);
  };

  it('announces the exit when the room has lines for others', async () => {
    await standIn('glass-room', 'alice');
    await gameState.move('up');
    expect(socketManager.announceExit).toHaveBeenCalledWith({ from: 'ray/glass-room', to: 'ray/loft', direction: 'up', othersLeave: true, othersArrive: true });
  });

  it("doesn't announce exits without lines for others", async () => {
    await standIn('glass-room', 'alice');
    await gameState.move('south');
    expect(socketManager.announceExit).not.toHaveBeenCalled();
  });

  it("shows the room's leave line instead of the generic one", async () => {
    await standIn('glass-room');
    socketManager.emit('playerUsedExit', { username: 'alice', channelId: 'ray/glass-room', direction: 'up' });
    gameState.notifyPlayerLeft('alice');
    expect(out()).toContain('alice climbs the narrow ladder.');
    expect(out()).not.toContain('alice has left the room.');
  });

  it("shows the source room's arrival line in the room entered", async () => {
    await standIn('loft');
    socketManager.emit('playerArrivedVia', { username: 'alice', channelId: 'ray/loft', from: 'ray/glass-room', direction: 'up' });
    gameState.notifyPlayerJoined('alice');
    await flush();
    expect(out()).toContain('alice pokes their head up through the hatch.');
    expect(out()).not.toContain('alice has entered the room.');
  });

  it('ignores relays for other rooms and from players muted here', async () => {
    await standIn('glass-room');
    socketManager.emit('playerUsedExit', { username: 'alice', channelId: 'ray/elsewhere', direction: 'up' });
    (gameState as any).mutes = { isMuted: (n: string) => n === 'pest' };
    socketManager.emit('playerUsedExit', { username: 'pest', channelId: 'ray/glass-room', direction: 'up' });
    expect(out()).not.toContain('alice climbs the narrow ladder.');
    expect(out()).not.toContain('pest climbs the narrow ladder.');
  });
});
