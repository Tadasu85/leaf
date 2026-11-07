import { EventEmitter } from 'events';
import { MuteList } from '../../game/social/MuteList';
import { CommandParser } from '../../game/commands/CommandParser';
import { GameState } from '../../game/state/GameState';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    game: { idName: 'ego-death', account: 'hive-109456', startRoom: { author: 'start-author', permlink: 'start-room' } },
    builders: [],
    admins: [],
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, data };
};

describe('MuteList', () => {
  it('keeps local mutes per viewer, case-insensitively', () => {
    const storage = memoryStorage();
    const list = new MuteList(storage);
    list.setViewer('alice');
    list.addLocal('Guest-000001');
    expect(list.isMuted('guest-000001')).toBe(true);
    list.setViewer('bob');
    expect(list.isMuted('Guest-000001')).toBe(false);
    list.setViewer('alice');
    expect(list.isMuted('Guest-000001')).toBe(true);
    expect(list.removeLocal('GUEST-000001')).toBe(true);
    expect(list.isMuted('Guest-000001')).toBe(false);
  });

  it('hides session Hive mutes without saving them locally', () => {
    const storage = memoryStorage();
    const list = new MuteList(storage);
    list.setViewer('alice');
    list.addSessionHive('pest');
    expect(list.isMuted('pest')).toBe(true);
    expect(list.localNames()).toEqual([]);
    list.setViewer('alice');
    expect(list.isMuted('pest')).toBe(false);
  });

  it('survives corrupt or missing storage', () => {
    const storage = memoryStorage();
    storage.setItem('leaf.mutes.alice', 'not json');
    const list = new MuteList(storage);
    list.setViewer('alice');
    expect(list.localNames()).toEqual([]);
    const noStorage = new MuteList(null);
    noStorage.setViewer('alice');
    noStorage.addLocal('x-guest');
    expect(noStorage.isMuted('x-guest')).toBe(true);
  });
});

describe('CommandParser mute commands', () => {
  const parse = (text: string) => new CommandParser().parse(text);
  it('parses mute, unmute and muted', () => {
    expect(parse('mute spammer')).toMatchObject({ type: 'mute', args: ['spammer'] });
    expect(parse('unmute @spammer')).toMatchObject({ type: 'unmute', args: ['spammer'] });
    expect(parse('mute Guest-000123')).toMatchObject({ type: 'mute', args: ['Guest-000123'] });
    expect(parse('muted')).toMatchObject({ type: 'muted' });
  });
  it('rejects names that are not accounts', () => {
    expect(parse('mute')).toBeNull();
    expect(parse('mute two words')).toBeNull();
    expect(parse('mute ab')).toBeNull();
  });
});

describe('GameState mutes', () => {
  let hiveClient: any;
  let socketManager: any;
  let gameState: GameState;
  const messages = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(() => {
    window.localStorage.clear();
    hiveClient = Object.assign(new EventEmitter(), {
      setHiveMute: jest.fn().mockResolvedValue(undefined),
      getHiveMutes: jest.fn().mockResolvedValue(['oldpest']),
    });
    socketManager = { refreshMutes: jest.fn(), on: jest.fn(), off: jest.fn() };
    gameState = new GameState(hiveClient, socketManager);
  });

  const loginAs = (username: string, isGuest = false) => {
    (gameState as any).player = { username, location: null, isAdmin: false, isBuilder: false, characterDescription: '', ...(isGuest ? { isGuest } : {}) };
    (gameState as any).mutes.setViewer(username);
    (gameState as any).currentRoom = { players: ['alice', 'pest', 'Guest-000009'] };
  };

  it('writes a Hive mute to the chain, hides the player now and asks the server to refresh', async () => {
    loginAs('alice');
    await gameState.mute('Pest');
    expect(hiveClient.setHiveMute).toHaveBeenCalledWith('alice', 'pest', true);
    expect(socketManager.refreshMutes).toHaveBeenCalled();
    expect(gameState.isMuted('pest')).toBe(true);
    expect(gameState.getCurrentRoom()?.players).toEqual(['alice', 'Guest-000009']);
    expect(messages()).toContain("You muted pest. It's saved to your Hive mute list, so it applies across Hive too.");
  });

  it('does not hide anyone if Keychain refuses', async () => {
    loginAs('alice');
    hiveClient.setHiveMute.mockRejectedValue(new Error('User cancelled'));
    await gameState.mute('pest');
    expect(gameState.isMuted('pest')).toBe(false);
    expect(socketManager.refreshMutes).not.toHaveBeenCalled();
    expect(messages()).toContain("Couldn't mute pest on Hive: User cancelled");
  });

  it('keeps mutes of guests in the browser, without touching Hive', async () => {
    loginAs('alice');
    await gameState.mute('Guest-000009');
    expect(hiveClient.setHiveMute).not.toHaveBeenCalled();
    expect(gameState.isMuted('Guest-000009')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('leaf.mutes.alice')!)).toEqual(['guest-000009']);
  });

  it("keeps a guest's own mutes in the browser", async () => {
    loginAs('Guest-000001', true);
    await gameState.mute('pest');
    expect(hiveClient.setHiveMute).not.toHaveBeenCalled();
    expect(gameState.isMuted('pest')).toBe(true);
  });

  it('filters muted players out of later player lists', async () => {
    loginAs('alice');
    await gameState.mute('Guest-000009');
    gameState.updateRoomPlayers(['alice', 'Guest-000009', 'friend']);
    expect(gameState.getCurrentRoom()?.players).toEqual(['alice', 'friend']);
  });

  it('unmutes on Hive and in the browser', async () => {
    loginAs('alice');
    await gameState.mute('pest');
    await gameState.unmute('pest');
    expect(hiveClient.setHiveMute).toHaveBeenLastCalledWith('alice', 'pest', false);
    expect(gameState.isMuted('pest')).toBe(false);
    await gameState.mute('Guest-000009');
    await gameState.unmute('guest-000009');
    expect(gameState.isMuted('Guest-000009')).toBe(false);
  });

  it('will not mute yourself', async () => {
    loginAs('alice');
    await gameState.mute('Alice');
    expect(hiveClient.setHiveMute).not.toHaveBeenCalled();
    expect(messages()).toContain("You can't mute yourself.");
  });

  it('lists Hive and browser mutes separately', async () => {
    loginAs('alice');
    await gameState.mute('Guest-000009');
    await gameState.listMuted();
    expect(messages()).toContain('Muted on Hive (1): oldpest');
    expect(messages()).toContain('Muted in this browser (1): guest-000009');
  });

  it("doesn't look up a guest's Hive mutes", async () => {
    loginAs('Guest-000001', true);
    await gameState.listMuted();
    expect(hiveClient.getHiveMutes).not.toHaveBeenCalled();
    expect(messages()).toContain("You haven't muted anyone.");
  });
});
