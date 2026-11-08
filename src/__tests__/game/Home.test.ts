import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { CommandParser } from '../../game/commands/CommandParser';
import { HiveClient } from '../../game/blockchain/HiveClient';
import { guestSession } from '../../game/guest/GuestSession';
import { readHomeFromAccount } from '../../game/rooms/home';
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
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

const room = (permlink: string, title = permlink): RoomData => ({ id: `ray/${permlink}`, title, description: '', author: 'ray', permlink, exits: {}, players: [], details: {} });

describe('home helpers and commands', () => {
  it('reads a home from Hive profile metadata', () => {
    expect(readHomeFromAccount({ posting_json_metadata: JSON.stringify({ egodeathplayer: { home: { author: 'ray', permlink: 'cave' } } }) }))
      .toEqual({ author: 'ray', permlink: 'cave' });
    expect(readHomeFromAccount({ posting_json_metadata: '{"egodeathplayer":{"home":"cave"}}' })).toBeNull();
    expect(readHomeFromAccount({ posting_json_metadata: 'bad' })).toBeNull();
    expect(readHomeFromAccount(null)).toBeNull();
  });

  it('parses home, sethome and @sethome', () => {
    const parse = (t: string) => new CommandParser().parse(t); // the parser rate-limits one instance
    expect(parse('home')).toMatchObject({ type: 'home' });
    expect(parse('sethome')).toMatchObject({ type: 'sethome' });
    expect(parse('@sethome')).toMatchObject({ type: 'sethome' });
  });

  it('saves home in the profile without touching anything else', async () => {
    const meta = { profile: { name: 'Ray' }, egodeathplayer: { Description: 'tall' } };
    const broadcast = jest.fn().mockResolvedValue({ success: true });
    const ctx = { keychain: { broadcast }, database: { call: jest.fn().mockResolvedValue([{ posting_json_metadata: JSON.stringify(meta), json_metadata: '{"a":1}' }]) } };
    await (HiveClient.prototype as any).setPlayerHome.call(ctx, 'ray', { author: 'ray', permlink: 'cave' });
    const op = broadcast.mock.calls[0][0].operations[0];
    expect(op[0]).toBe('account_update2');
    expect(op[1].json_metadata).toBe('{"a":1}');
    expect(JSON.parse(op[1].posting_json_metadata)).toEqual({ profile: { name: 'Ray' }, egodeathplayer: { Description: 'tall', home: { author: 'ray', permlink: 'cave' } } });
  });
});

describe('GameState home', () => {
  let hiveClient: any;
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(async () => {
    window.localStorage.clear();
    hiveClient = Object.assign(new EventEmitter(), {
      getRoomData: jest.fn(async (loc: { permlink: string }) => room(loc.permlink, loc.permlink === 'cave' ? 'The Cave' : loc.permlink)),
      getRoomDetails: jest.fn().mockResolvedValue({}),
      getTimeEventConfig: jest.fn().mockReturnValue(null),
      getGameMap: jest.fn().mockReturnValue({ genesis: { author: 'ray' }, cave: { author: 'ray' }, forest: { author: 'ray' } }),
      moveTo: jest.fn().mockResolvedValue(undefined),
      setPlayerHome: jest.fn().mockResolvedValue(undefined),
      registerTimeEventRoom: jest.fn(),
      unregisterTimeEventRoom: jest.fn(),
    });
    gameState = new GameState(hiveClient, new EventEmitter() as any);
    (gameState as any).isBulkDataLoaded = true;
  });

  const standIn = async (permlink: string, extra: Record<string, unknown> = {}) => {
    (gameState as any).player = { username: 'alice', location: { author: 'ray', permlink }, isAdmin: false, isBuilder: false, characterDescription: '', ...extra };
    await gameState.loadRoom({ author: 'ray', permlink }, true);
  };

  it('sets home on Hive and goes back there', async () => {
    await standIn('cave');
    await gameState.setHome();
    expect(hiveClient.setPlayerHome).toHaveBeenCalledWith('alice', { author: 'ray', permlink: 'cave' });
    expect(out()).toContain("The Cave is now your home. Type 'home' to come back here from anywhere.");
    await standIn('forest');
    await gameState.goHome();
    expect(gameState.getCurrentRoom()?.permlink).toBe('cave');
    expect(hiveClient.moveTo).toHaveBeenCalledWith('alice', { author: 'ray', permlink: 'cave' });
  });

  it('goes to the start room without a home', async () => {
    await standIn('forest');
    await gameState.goHome();
    expect(gameState.getCurrentRoom()?.permlink).toBe('genesis');
    expect(out()).toContain("You haven't set a home, so you head back to where you started. Type 'sethome' in a room to make it home.");
  });

  it("says so when you're already home", async () => {
    await standIn('genesis');
    await gameState.goHome();
    expect(out()).toContain("You're already home.");
    expect(hiveClient.moveTo).not.toHaveBeenCalled();
  });

  it('keeps a guest home in the browser', async () => {
    const save = jest.spyOn(guestSession, 'saveLocation').mockImplementation(() => {});
    await standIn('cave', { username: 'Guest-000001', isGuest: true });
    (gameState as any).player.username = 'Guest-000001';
    await gameState.setHome();
    expect(hiveClient.setPlayerHome).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem('leaf.home.Guest-000001')!)).toEqual({ author: 'ray', permlink: 'cave' });
    await standIn('forest', { username: 'Guest-000001', isGuest: true });
    (gameState as any).player.username = 'Guest-000001';
    await gameState.goHome();
    expect(gameState.getCurrentRoom()?.permlink).toBe('cave');
    expect(save).toHaveBeenCalledWith({ author: 'ray', permlink: 'cave' });
    save.mockRestore();
  });

  it('refuses a room that is not on the map', async () => {
    hiveClient.getGameMap.mockReturnValue({ genesis: { author: 'ray' } });
    await standIn('cave');
    await gameState.setHome();
    expect(hiveClient.setPlayerHome).not.toHaveBeenCalled();
    expect(out()).toContain("This room isn't on the map, so it can't be your home.");
  });

  it('accepts a room stored under an author/permlink key', async () => {
    hiveClient.getGameMap.mockReturnValue({ genesis: { author: 'ray' }, cave: { author: 'bob' }, 'ray/cave': { author: 'ray' } });
    await standIn('cave');
    await gameState.setHome();
    expect(hiveClient.setPlayerHome).toHaveBeenCalled();
  });

  it('reports a failed save', async () => {
    hiveClient.setPlayerHome.mockRejectedValue(new Error('cancelled'));
    await standIn('cave');
    await gameState.setHome();
    expect(out()).toContain("Couldn't save your home: cancelled");
  });
});
