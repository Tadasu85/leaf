import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { CommandParser } from '../../game/commands/CommandParser';
import { guestSession } from '../../game/guest/GuestSession';
import { RoomData } from '../../game/types/GameTypes';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    game: { idName: 'ego-death', account: 'hive-109456', startRoom: { author: 'ray', permlink: 'genesis' } },
    builders: [],
    admins: [],
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

const room = (permlink: string, title: string): RoomData => ({
  id: `ray/${permlink}`, title, description: '', author: 'ray', permlink, exits: {}, players: [], details: {},
});

describe('eject command', () => {
  it('parses eject <player>', () => {
    const parser = new CommandParser();
    expect(parser.parse('eject pest')).toMatchObject({ type: 'eject', args: ['pest'] });
    expect(parser.parse('eject')).toBeNull();
  });
});

describe('GameState eject', () => {
  let hiveClient: any;
  let socketManager: any;
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(async () => {
    hiveClient = Object.assign(new EventEmitter(), {
      getRoomData: jest.fn(async (loc: { permlink: string }) => loc.permlink === 'genesis' ? room('genesis', 'Genesis') : room('glass-room', 'Glass Room')),
      getRoomDetails: jest.fn().mockResolvedValue({}),
      getTimeEventConfig: jest.fn().mockReturnValue(null),
      getGameMap: jest.fn().mockReturnValue({}),
      moveTo: jest.fn().mockResolvedValue(undefined),
      registerTimeEventRoom: jest.fn(),
      unregisterTimeEventRoom: jest.fn(),
    });
    socketManager = Object.assign(new EventEmitter(), { ejectPlayer: jest.fn(() => true) });
    gameState = new GameState(hiveClient, null as any);
    gameState.setSocketManager(socketManager);
    (gameState as any).isBulkDataLoaded = true;
  });

  const enter = async (username: string, extra: Record<string, unknown> = {}) => {
    (gameState as any).player = { username, location: { author: 'ray', permlink: 'glass-room' }, isAdmin: false, isBuilder: false, characterDescription: '', ...extra };
    await gameState.loadRoom({ author: 'ray', permlink: 'glass-room' }, true);
  };

  it("asks the server when you're the room's author", async () => {
    await enter('ray');
    gameState.ejectPlayer('pest');
    expect(socketManager.ejectPlayer).toHaveBeenCalledWith('pest');
  });

  it("refuses in someone else's room without asking the server", async () => {
    await enter('visitor');
    gameState.ejectPlayer('pest');
    expect(socketManager.ejectPlayer).not.toHaveBeenCalled();
    expect(out()).toContain('You can only remove people from rooms you built.');
  });

  it("shows the server's answer", async () => {
    await enter('ray');
    socketManager.emit('ejectResult', { ok: true, message: 'You removed pest from this room for 10 minutes.' });
    expect(out()).toContain('You removed pest from this room for 10 minutes.');
  });

  it('tells others in the room', async () => {
    await enter('friend');
    socketManager.emit('playerEjected', { channelId: 'ray/glass-room', target: 'pest', by: 'ray' });
    expect(out()).toContain('pest has been removed from the room by ray.');
  });

  it('sends an ejected player to the start room and saves the move', async () => {
    await enter('pest');
    socketManager.emit('ejected', { channelId: 'ray/glass-room', by: 'ray', until: Date.now() + 10 * 60 * 1000 });
    await new Promise(r => setTimeout(r, 0));
    expect(out()).toContain('ray has removed you from Glass Room. You can return in 10 minutes.');
    expect(gameState.getCurrentRoom()?.permlink).toBe('genesis');
    expect(hiveClient.moveTo).toHaveBeenCalledWith('pest', { author: 'ray', permlink: 'genesis' });
  });

  it('saves a guest\'s move in the browser', async () => {
    const save = jest.spyOn(guestSession, 'saveLocation').mockImplementation(() => {});
    await enter('Guest-000001', { isGuest: true });
    socketManager.emit('ejected', { channelId: 'ray/glass-room', by: 'ray', until: Date.now() + 60000 });
    await new Promise(r => setTimeout(r, 0));
    expect(save).toHaveBeenCalledWith({ author: 'ray', permlink: 'genesis' });
    expect(hiveClient.moveTo).not.toHaveBeenCalled();
    save.mockRestore();
  });

  it('ignores an ejection from a room the player already left', async () => {
    await enter('pest');
    socketManager.emit('ejected', { channelId: 'ray/other-room', by: 'ray', until: Date.now() + 60000 });
    await new Promise(r => setTimeout(r, 0));
    expect(gameState.getCurrentRoom()?.permlink).toBe('glass-room');
  });
});
