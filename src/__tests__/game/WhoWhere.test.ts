import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { CommandParser } from '../../game/commands/CommandParser';
import { describeLocation, loadWhereVisible, saveWhereVisible } from '../../game/social/whereVisible';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));
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

describe('where on / off', () => {
  beforeEach(() => window.localStorage.clear());

  it('parses where, where on and where off', () => {
    const parse = (t: string) => new CommandParser().parse(t); // one parser per command (rate limit)
    expect(parse('where')).toMatchObject({ type: 'where', args: [] });
    expect(parse('where on')).toMatchObject({ type: 'where', args: ['on'] });
    expect(parse('WHERE OFF')).toMatchObject({ type: 'where', args: ['off'] });
    expect(parse('where maybe')?.type).not.toBe('where');
  });

  it('keeps the choice per player in this browser', () => {
    expect(loadWhereVisible('alice')).toBe(false);
    saveWhereVisible('Alice', true);
    expect(loadWhereVisible('alice')).toBe(true);
    expect(loadWhereVisible('bob')).toBe(false);
    saveWhereVisible('alice', false);
    expect(loadWhereVisible('alice')).toBe(false);
    expect(loadWhereVisible(null)).toBe(false);
  });

  it('names a room by its cached title, else by its permlink', () => {
    expect(describeLocation('ray/deep-cavern', () => 'The Deep Cavern')).toBe('The Deep Cavern');
    expect(describeLocation('ray/deep-cavern', () => undefined)).toBe('deep cavern');
    expect(describeLocation('deep-cavern')).toBe('deep cavern');
  });
});

describe('GameState who and where', () => {
  let socket: EventEmitter & { setWhereVisible: jest.Mock; requestWho: jest.Mock };
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(() => {
    window.localStorage.clear();
    const hiveClient = Object.assign(new EventEmitter(), {
      getGameMap: jest.fn().mockReturnValue({}),
      getCachedRoomTitle: jest.fn(({ permlink }: { permlink: string }) => (permlink === 'deep-cavern' ? 'The Deep Cavern' : undefined)),
    });
    socket = Object.assign(new EventEmitter(), { setWhereVisible: jest.fn().mockReturnValue(true), requestWho: jest.fn().mockReturnValue(true) });
    gameState = new GameState(hiveClient as any, null as any);
    gameState.setSocketManager(socket as any);
    (gameState as any).player = { username: 'alice', location: { author: 'ray', permlink: 'genesis' }, isAdmin: false, isBuilder: false, characterDescription: '' };
  });

  it('turns where on and off, saving the choice and telling the server', () => {
    gameState.setWhereVisible(true);
    expect(socket.setWhereVisible).toHaveBeenCalledWith(true);
    expect(loadWhereVisible('alice')).toBe(true);
    gameState.setWhereVisible(undefined);
    expect(out().at(-1)).toMatch(/shows which room you are in/);
    gameState.setWhereVisible(false);
    expect(socket.setWhereVisible).toHaveBeenLastCalledWith(false);
    expect(loadWhereVisible('alice')).toBe(false);
    expect(out().at(-1)).toBe('who no longer shows which room you are in.');
  });

  it('lists rooms for players who share them', () => {
    socket.emit('whoList', { players: ['alice', 'bob', 'carol', 'dave'], locations: { bob: 'ray/deep-cavern', carol: 'ray/old-mill' } });
    expect(out().at(-1)).toBe('Online now (4): alice, bob (The Deep Cavern), carol (old mill), dave');
  });

  it('still reads an old server that sends no locations', () => {
    socket.emit('whoList', { players: ['alice', 'bob'] });
    expect(out().at(-1)).toBe('Online now (2): alice, bob');
  });
});
