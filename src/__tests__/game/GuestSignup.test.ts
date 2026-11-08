import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { CommandParser } from '../../game/commands/CommandParser';
import { guestSession } from '../../game/guest/GuestSession';
import { signupLines } from '../../game/guest/signup';
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

const room = (permlink: string): RoomData => ({ id: `ray/${permlink}`, title: permlink, description: '', author: 'ray', permlink, exits: {}, players: [], details: {} });

describe('signup', () => {
  it('is a command', () => {
    expect(new CommandParser().parse('signup')).toMatchObject({ type: 'signup' });
  });

  it('explains the steps with the referral link and Keychain', () => {
    const text = signupLines().join('\n');
    expect(text).toContain('https://ecency.com/signup/free?referral=hive-109456');
    expect(text).toContain('https://signup.hive.io');
    expect(text).toContain('https://hive-keychain.com');
  });
});

describe('first login after playing as a guest', () => {
  let hiveClient: any;
  let gameState: GameState;
  let load: jest.SpyInstance;
  const out = () => gameState.getOutputMessages().map(m => m.output);

  const history = (ops: any[]) => ops.map((op, i) => [i, op]);
  const moveOp = (permlink: string, timestamp: string) => ({
    timestamp,
    op: ['custom_json', { id: 'ego-death', json: JSON.stringify({ move_to: { Location: { author: 'ray', permlink } } }) }],
  });

  beforeEach(() => {
    hiveClient = Object.assign(new EventEmitter(), {
      loadAllGameData: jest.fn().mockResolvedValue(undefined),
      getRoomData: jest.fn(async (loc: { permlink: string }) => room(loc.permlink)),
      getRoomDetails: jest.fn().mockResolvedValue({}),
      getTimeEventConfig: jest.fn().mockReturnValue(null),
      getGameMap: jest.fn().mockReturnValue({ genesis: { author: 'ray', exits: {} }, cave: { author: 'ray', exits: {} } }),
      registerTimeEventRoom: jest.fn(),
      unregisterTimeEventRoom: jest.fn(),
      startBlockStream: jest.fn(),
      database: {
        call: jest.fn().mockResolvedValue([{ name: 'newbie', posting_json_metadata: '' }]),
        getAccountHistory: jest.fn().mockResolvedValue([]),
      },
    });
    gameState = new GameState(hiveClient, new EventEmitter() as any);
    load = jest.spyOn(guestSession, 'load');
  });

  afterEach(() => load.mockRestore());

  it("starts a brand-new player where their guest left off", async () => {
    load.mockReturnValue({ username: 'Guest-000001', location: { author: 'ray', permlink: 'cave' } });
    await gameState.login('newbie');
    expect(gameState.getPlayer()?.location).toEqual({ author: 'ray', permlink: 'cave' });
    expect(out()).toContain('Welcome to Hive! You start where your guest left off.');
  });

  it("uses the player's own last move when they have one", async () => {
    load.mockReturnValue({ username: 'Guest-000001', location: { author: 'ray', permlink: 'cave' } });
    hiveClient.database.getAccountHistory.mockResolvedValue(history([moveOp('genesis', '2026-11-01T00:00:00')]));
    await gameState.login('newbie');
    expect(gameState.getPlayer()?.location?.permlink).toBe('genesis');
    expect(out()).not.toContain('Welcome to Hive! You start where your guest left off.');
  });

  it("ignores a guest room that isn't on the map any more", async () => {
    load.mockReturnValue({ username: 'Guest-000001', location: { author: 'someone', permlink: 'gone' } });
    await gameState.login('newbie');
    expect(gameState.getPlayer()?.location?.permlink).toBe('genesis');
  });

  it("finds a guest's room stored under an author/permlink key", async () => {
    hiveClient.getGameMap.mockReturnValue({ genesis: { author: 'ray', exits: {} }, cave: { author: 'bob', exits: {} }, 'ray/cave': { author: 'ray', exits: {} } });
    load.mockReturnValue({ username: 'Guest-000001', location: { author: 'ray', permlink: 'cave' } });
    await gameState.login('newbie');
    expect(gameState.getPlayer()?.location).toEqual({ author: 'ray', permlink: 'cave' });
  });

  it('starts at the start room with no guest in this browser', async () => {
    load.mockReturnValue(null);
    await gameState.login('newbie');
    expect(gameState.getPlayer()?.location?.permlink).toBe('genesis');
  });

  it('shows the signup steps as a command', () => {
    gameState.showSignup();
    expect(out()).toEqual(signupLines());
  });
});
