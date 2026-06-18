import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { RoomData, TimeEventConfig } from '../../game/types/GameTypes';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn() }));

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    game: {
      idName: 'ego-death',
      account: 'hive-109456',
      startRoom: { author: 'start-author', permlink: 'start-room' },
    },
    builders: [],
    admins: [],
  },
}));

// Prevent real SocketManager from connecting
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    isConnected: jest.fn().mockReturnValue(false),
    sendChat: jest.fn(),
    sendEmote: jest.fn(),
    claimBuilder: jest.fn(),
    destroy: jest.fn(),
  })),
}));

// ─── Mock classes ─────────────────────────────────────────────────────────────

class MockHiveClient extends EventEmitter {
  loadAllGameData = jest.fn().mockResolvedValue(undefined);
  getRoomData = jest.fn();
  getRoomDetails = jest.fn().mockResolvedValue({});
  getTimeEventConfig = jest.fn().mockReturnValue(null);
  getGameMap = jest.fn().mockReturnValue({});
  moveTo = jest.fn().mockResolvedValue(undefined);
  setDescription = jest.fn().mockResolvedValue(undefined);
  setShortDescription = jest.fn().mockResolvedValue(undefined);
  startBlockStream = jest.fn();
  stopMoveListener = jest.fn();
  registerTimeEventRoom = jest.fn();
  unregisterTimeEventRoom = jest.fn();
  getBuilderProgress = jest.fn().mockResolvedValue({
    uniqueRooms: 0, totalSeconds: 0, explorerMet: false, chroniclerMet: false,
  });
  database = {
    call: jest.fn(),
    getAccountHistory: jest.fn(),
  };
}

class MockSocketManager extends EventEmitter {
  isConnected = jest.fn().mockReturnValue(false);
  sendChat = jest.fn();
  sendEmote = jest.fn();
  claimBuilder = jest.fn();
  destroy = jest.fn();
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockRoom: RoomData = {
  id: 'cave-room',
  title: 'The Cave',
  description: 'A dark cave.',
  author: 'auth',
  permlink: 'cave-room',
  exits: { north: 'forest-room' },
  players: [],
  details: { stalactites: 'Sharp and icy.' },
};

const mockAccount = {
  posting_json_metadata: JSON.stringify({
    egodeathplayer: { Description: 'A mysterious figure', ShortDesc: 'mysterious' },
  }),
  json_metadata: '{}',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMessages(gs: GameState): string[] {
  return gs.getOutputMessages().map(m => m.output);
}

function setPlayer(gs: GameState, overrides: Partial<{ username: string; isAdmin: boolean; isBuilder: boolean }> = {}) {
  (gs as any).player = {
    username: overrides.username ?? 'alice',
    location: { author: 'auth', permlink: 'cave-room' },
    isAdmin: overrides.isAdmin ?? false,
    isBuilder: overrides.isBuilder ?? false,
    characterDescription: '',
  };
}

function setRoom(gs: GameState, room: RoomData = mockRoom) {
  (gs as any).currentRoom = { ...room };
}

function setReadyState(gs: GameState) {
  setPlayer(gs);
  setRoom(gs);
  (gs as any).hasReceivedInitialPlayerList = true;
  (gs as any).isBulkDataLoaded = true;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('GameState', () => {
  let hiveClient: MockHiveClient;
  let socketManager: MockSocketManager;
  let gameState: GameState;

  beforeEach(() => {
    jest.clearAllMocks();
    hiveClient = new MockHiveClient();
    socketManager = new MockSocketManager();
    hiveClient.database.call.mockResolvedValue([mockAccount]);
    hiveClient.database.getAccountHistory.mockResolvedValue([]);
    hiveClient.getRoomData.mockResolvedValue({ ...mockRoom });
    gameState = new GameState(hiveClient as any, socketManager as any);
  });

  // ─── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('registers timeEventDetected listener on hiveClient', () => {
      expect(hiveClient.listenerCount('timeEventDetected')).toBe(1);
    });

    it('starts with no player and no current room', () => {
      expect(gameState.getPlayer()).toBeNull();
      expect(gameState.getCurrentRoom()).toBeNull();
    });
  });

  // ─── initialize ─────────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('calls hiveClient.loadAllGameData()', async () => {
      await gameState.initialize();
      expect(hiveClient.loadAllGameData).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — second call skips loadAllGameData', async () => {
      await gameState.initialize();
      await gameState.initialize();
      expect(hiveClient.loadAllGameData).toHaveBeenCalledTimes(1);
    });

    it('rethrows errors from loadAllGameData', async () => {
      hiveClient.loadAllGameData.mockRejectedValue(new Error('network'));
      await expect(gameState.initialize()).rejects.toThrow('network');
    });
  });

  // ─── registerTimeEventRoom / unregisterTimeEventRoom ────────────────────────

  describe('registerTimeEventRoom / unregisterTimeEventRoom', () => {
    const config: TimeEventConfig = {
      type: 'ferry',
      intervalBlocks: 100,
      startBlock: 1000,
      currentPhase: 0,
      phases: [
        { phase: 0, name: 'North', description: 'Heading north.', exits: { north: 'port-a' } },
        { phase: 1, name: 'South', description: 'Heading south.', exits: { south: 'port-b' } },
      ],
    };

    it('delegates registration to hiveClient', () => {
      gameState.registerTimeEventRoom('ferry-dock', config);
      expect(hiveClient.registerTimeEventRoom).toHaveBeenCalledWith('ferry-dock', config);
    });

    it('stores the config locally', () => {
      gameState.registerTimeEventRoom('ferry-dock', config);
      expect((gameState as any).timeEventRooms.get('ferry-dock')).toBe(config);
    });

    it('delegates unregistration to hiveClient', () => {
      gameState.registerTimeEventRoom('ferry-dock', config);
      gameState.unregisterTimeEventRoom('ferry-dock');
      expect(hiveClient.unregisterTimeEventRoom).toHaveBeenCalledWith('ferry-dock');
    });

    it('removes config locally on unregister', () => {
      gameState.registerTimeEventRoom('ferry-dock', config);
      gameState.unregisterTimeEventRoom('ferry-dock');
      expect((gameState as any).timeEventRooms.has('ferry-dock')).toBe(false);
    });
  });

  // ─── handleTimeEvent ────────────────────────────────────────────────────────

  describe('handleTimeEvent (via hiveClient emit)', () => {
    const timeEventConfig: TimeEventConfig = {
      type: 'ferry',
      intervalBlocks: 100,
      startBlock: 1000,
      currentPhase: 0,
      phases: [
        { phase: 0, name: 'Phase A', description: 'Going to A.', exits: { north: 'port-a' } },
        { phase: 1, name: 'Phase B', description: 'Going to B.', exits: { south: 'port-b' } },
      ],
    };

    beforeEach(() => {
      gameState.registerTimeEventRoom('ferry-dock', timeEventConfig);
      setRoom(gameState, { ...mockRoom, permlink: 'ferry-dock', author: 'auth', exits: {} });
      setPlayer(gameState);
      (gameState as any).hasReceivedInitialPlayerList = true;
    });

    it('updates exits and outputs phase messages when in matching room', () => {
      hiveClient.emit('timeEventDetected', {
        type: 'timeEvent', roomPermlink: 'ferry-dock', currentBlock: 1100,
        eventType: 'ferry', phase: 1, timestamp: new Date().toISOString(),
      });
      const msgs = getMessages(gameState);
      expect(msgs).toContain('\nPhase B');
      expect(msgs).toContain('Going to B.');
    });

    it('updates the current room exits', () => {
      hiveClient.emit('timeEventDetected', {
        type: 'timeEvent', roomPermlink: 'ferry-dock', currentBlock: 1100,
        eventType: 'ferry', phase: 1, timestamp: new Date().toISOString(),
      });
      expect(gameState.getCurrentRoom()?.exits).toEqual({ south: 'port-b' });
    });

    it('emits roomStateChanged', () => {
      const handler = jest.fn();
      gameState.on('roomStateChanged', handler);
      hiveClient.emit('timeEventDetected', {
        type: 'timeEvent', roomPermlink: 'ferry-dock', currentBlock: 1100,
        eventType: 'ferry', phase: 1, timestamp: new Date().toISOString(),
      });
      expect(handler).toHaveBeenCalled();
    });

    it('is a no-op when current room permlink does not match', () => {
      setRoom(gameState, { ...mockRoom, permlink: 'other-room' });
      const before = getMessages(gameState).length;
      hiveClient.emit('timeEventDetected', {
        type: 'timeEvent', roomPermlink: 'ferry-dock', currentBlock: 1100,
        eventType: 'ferry', phase: 1, timestamp: new Date().toISOString(),
      });
      expect(getMessages(gameState).length).toBe(before);
    });

    it('is a no-op when the room permlink is not registered', () => {
      const before = getMessages(gameState).length;
      hiveClient.emit('timeEventDetected', {
        type: 'timeEvent', roomPermlink: 'unknown-room', currentBlock: 1100,
        eventType: 'ferry', phase: 0, timestamp: new Date().toISOString(),
      });
      expect(getMessages(gameState).length).toBe(before);
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('throws if username is empty', async () => {
      await expect(gameState.login('')).rejects.toThrow('Username is required');
    });

    it('throws if account is not found on Hive', async () => {
      hiveClient.database.call.mockResolvedValue([]);
      await expect(gameState.login('ghost')).rejects.toThrow("Account 'ghost' not found");
    });

    it('calls initialize if bulk data is not loaded', async () => {
      await gameState.login('alice');
      expect(hiveClient.loadAllGameData).toHaveBeenCalledTimes(1);
    });

    it('skips initialize if bulk data is already loaded', async () => {
      (gameState as any).isBulkDataLoaded = true;
      await gameState.login('alice');
      expect(hiveClient.loadAllGameData).not.toHaveBeenCalled();
    });

    it('creates player with correct username', async () => {
      await gameState.login('alice');
      expect(gameState.getPlayer()?.username).toBe('alice');
    });

    it('admin account gets null location', async () => {
      await gameState.login('hive-109456');
      expect(gameState.getPlayer()?.location).toBeNull();
      expect(gameState.getPlayer()?.isAdmin).toBe(true);
    });

    it('non-admin with no history falls back to startRoom', async () => {
      await gameState.login('alice');
      expect(gameState.getPlayer()?.location).toEqual({ author: 'start-author', permlink: 'start-room' });
    });

    it('uses the most recent move_to location from account history', async () => {
      hiveClient.database.getAccountHistory.mockResolvedValue([
        [0, { op: ['custom_json', { id: 'ego-death', json: JSON.stringify({ move_to: { Location: { author: 'auth', permlink: 'old-room' } } }) }], timestamp: '2024-01-01T00:00:00' }],
        [1, { op: ['custom_json', { id: 'ego-death', json: JSON.stringify({ move_to: { Location: { author: 'auth', permlink: 'new-room' } } }) }], timestamp: '2024-06-01T00:00:00' }],
      ]);
      await gameState.login('alice');
      expect(gameState.getPlayer()?.location?.permlink).toBe('new-room');
    });

    it('emits playerChanged', async () => {
      const handler = jest.fn();
      gameState.on('playerChanged', handler);
      await gameState.login('alice');
      expect(handler).toHaveBeenCalled();
    });

    it('calls startBlockStream after login', async () => {
      await gameState.login('alice');
      expect(hiveClient.startBlockStream).toHaveBeenCalled();
    });

    it('loads character description from posting_json_metadata', async () => {
      await gameState.login('alice');
      expect(gameState.getPlayer()?.characterDescription).toBe('A mysterious figure');
    });

    it('displays room after login for non-admin player with location', async () => {
      await gameState.login('alice');
      const msgs = getMessages(gameState);
      expect(msgs).toContain('The Cave');
    });

    it('falls back to startRoom if lastLocation room not found', async () => {
      hiveClient.database.getAccountHistory.mockResolvedValue([
        [0, { op: ['custom_json', { id: 'ego-death', json: JSON.stringify({ move_to: { Location: { author: 'auth', permlink: 'gone-room' } } }) }], timestamp: '2024-01-01T00:00:00' }],
      ]);
      // First getRoomData call returns null (gone-room), second returns mockRoom (start-room)
      hiveClient.getRoomData
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ ...mockRoom });
      await gameState.login('alice');
      expect(gameState.getPlayer()?.location).toEqual({ author: 'start-author', permlink: 'start-room' });
    });
  });

  // ─── loadRoom ───────────────────────────────────────────────────────────────

  describe('loadRoom()', () => {
    it('sets currentRoom from hiveClient', async () => {
      await gameState.loadRoom({ author: 'auth', permlink: 'cave-room' }, true);
      expect(gameState.getCurrentRoom()?.title).toBe('The Cave');
    });

    it('adds error message when getRoomData returns null', async () => {
      hiveClient.getRoomData.mockResolvedValue(null);
      await gameState.loadRoom({ author: 'auth', permlink: 'missing-room' }, true);
      expect(getMessages(gameState)).toContain('Room not found');
    });

    it('fetches details if room has none', async () => {
      hiveClient.getRoomData.mockResolvedValue({ ...mockRoom, details: undefined });
      await gameState.loadRoom({ author: 'auth', permlink: 'cave-room' }, true);
      expect(hiveClient.getRoomDetails).toHaveBeenCalledWith('auth', 'cave-room');
    });

    it('skips display when skipDisplay=true', async () => {
      await gameState.loadRoom({ author: 'auth', permlink: 'cave-room' }, true);
      expect(getMessages(gameState)).toHaveLength(0);
    });

    it('displays room when skipDisplay=false', async () => {
      await gameState.loadRoom({ author: 'auth', permlink: 'cave-room' }, false);
      expect(getMessages(gameState)).toContain('The Cave');
    });

    it('applies time-based exits from config', async () => {
      const teConfig: TimeEventConfig = {
        type: 'ferry', intervalBlocks: 100, startBlock: 1000, currentPhase: 1,
        phases: [
          { phase: 0, name: 'A', description: 'A.', exits: { north: 'port-a' } },
          { phase: 1, name: 'B', description: 'B.', exits: { south: 'port-b' } },
        ],
      };
      hiveClient.getTimeEventConfig.mockReturnValue(teConfig);
      await gameState.loadRoom({ author: 'auth', permlink: 'ferry-dock' }, true);
      expect(gameState.getCurrentRoom()?.exits).toEqual({ south: 'port-b' });
      expect(gameState.getCurrentRoom()?.isTimeBased).toBe(true);
    });

    it('adds error message on exception', async () => {
      hiveClient.getRoomData.mockRejectedValue(new Error('network'));
      await gameState.loadRoom({ author: 'auth', permlink: 'cave-room' }, true);
      expect(getMessages(gameState)).toContain('Failed to load room');
    });
  });

  // ─── displayRoom ────────────────────────────────────────────────────────────

  describe('displayRoom()', () => {
    it('is a no-op when there is no current room', () => {
      gameState.displayRoom();
      expect(getMessages(gameState)).toHaveLength(0);
    });

    it('is suppressed when isLoggingIn=true', () => {
      setRoom(gameState);
      (gameState as any).isLoggingIn = true;
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.displayRoom();
      expect(getMessages(gameState)).toHaveLength(0);
    });

    it('is suppressed when socket is connected but initial player list not yet received', () => {
      setRoom(gameState);
      socketManager.isConnected.mockReturnValue(true);
      (gameState as any).hasReceivedInitialPlayerList = false;
      gameState.displayRoom();
      expect(getMessages(gameState)).toHaveLength(0);
    });

    it('is suppressed when the same room state was already displayed', () => {
      setRoom(gameState);
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.displayRoom();
      const countAfterFirst = getMessages(gameState).length;
      gameState.displayRoom();
      expect(getMessages(gameState).length).toBe(countAfterFirst);
    });

    it('is suppressed when lastOptimisticRoomKey matches', () => {
      setRoom(gameState);
      (gameState as any).hasReceivedInitialPlayerList = true;
      const room = (gameState as any).currentRoom;
      const roomKey = `${room.author}/${room.permlink}-${JSON.stringify(room.players || [])}`;
      (gameState as any).lastOptimisticRoomKey = roomKey;
      gameState.displayRoom();
      expect(getMessages(gameState)).toHaveLength(0);
      expect((gameState as any).lastOptimisticRoomKey).toBeNull();
    });

    it('outputs title, description, and exits on normal path', () => {
      setRoom(gameState);
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.displayRoom();
      const msgs = getMessages(gameState);
      expect(msgs).toContain('The Cave');
      expect(msgs).toContain('A dark cave.');
      expect(msgs).toContain('\nExits:');
      expect(msgs).toContain('north');
    });

    it('lists other players present but not the current player', () => {
      setRoom(gameState, { ...mockRoom, players: ['alice', 'bob'] });
      setPlayer(gameState, { username: 'alice' });
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.displayRoom();
      const msgs = getMessages(gameState);
      expect(msgs.some(m => m.includes('bob'))).toBe(true);
      expect(msgs.some(m => m.includes('alice') && m.includes('Players'))).toBe(false);
    });

    it('omits the exits section when there are no exits', () => {
      setRoom(gameState, { ...mockRoom, exits: {} });
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.displayRoom();
      const msgs = getMessages(gameState);
      expect(msgs).not.toContain('\nExits:');
    });
  });

  // ─── move ───────────────────────────────────────────────────────────────────

  describe('move()', () => {
    it('outputs error when player is not logged in', async () => {
      await gameState.move('north');
      expect(getMessages(gameState)).toContain('You must be logged in to move.');
    });

    it('outputs error when direction is not in exits', async () => {
      setReadyState(gameState);
      await gameState.move('east');
      expect(getMessages(gameState)).toContain('You cannot go east.');
    });

    it('calls hiveClient.moveTo with the destination location', async () => {
      setReadyState(gameState);
      await gameState.move('north');
      expect(hiveClient.moveTo).toHaveBeenCalledWith('alice', { author: 'auth', permlink: 'forest-room' });
    });

    it('updates player location optimistically', async () => {
      setReadyState(gameState);
      await gameState.move('north');
      expect(gameState.getPlayer()?.location?.permlink).toBe('forest-room');
    });

    it('reverts player location on error and outputs error message', async () => {
      setReadyState(gameState);
      hiveClient.moveTo.mockRejectedValue(new Error('tx failed'));
      await gameState.move('north');
      expect(getMessages(gameState)).toContain('Failed to move.');
    });
  });

  // ─── look ───────────────────────────────────────────────────────────────────

  describe('look()', () => {
    it('outputs error when not in a room', async () => {
      await gameState.look();
      expect(getMessages(gameState)).toContain('You are not in a room.');
    });

    it('outputs title, description, and exits', async () => {
      setReadyState(gameState);
      await gameState.look();
      const msgs = getMessages(gameState);
      expect(msgs).toContain('The Cave');
      expect(msgs).toContain('A dark cave.');
      expect(msgs).toContain('\nExits:');
    });

    it('lists other players present but excludes self', async () => {
      setRoom(gameState, { ...mockRoom, players: ['alice', 'bob'] });
      setPlayer(gameState, { username: 'alice' });
      await gameState.look();
      const msgs = getMessages(gameState);
      expect(msgs.some(m => m.includes('bob'))).toBe(true);
    });

    it('omits exits section when there are no exits', async () => {
      setRoom(gameState, { ...mockRoom, exits: {} });
      setPlayer(gameState);
      await gameState.look();
      expect(getMessages(gameState)).not.toContain('\nExits:');
    });
  });

  // ─── lookAtSelf ─────────────────────────────────────────────────────────────

  describe('lookAtSelf()', () => {
    it('outputs error when not logged in', async () => {
      await gameState.lookAtSelf();
      expect(getMessages(gameState)).toContain('You are not logged in.');
    });

    it('outputs characterDescription when set', async () => {
      setPlayer(gameState);
      (gameState.getPlayer() as any).characterDescription = 'Tall and mysterious.';
      hiveClient.database.call.mockResolvedValue([{
        posting_json_metadata: JSON.stringify({ egodeathplayer: { Description: 'Tall and mysterious.' } }),
        json_metadata: '{}',
      }]);
      await gameState.lookAtSelf();
      const msgs = getMessages(gameState);
      expect(msgs).toContain('Your character description:');
      expect(msgs).toContain('Tall and mysterious.');
    });

    it('outputs prompt when no description is set', async () => {
      setPlayer(gameState);
      hiveClient.database.call.mockResolvedValue([{ posting_json_metadata: '{}', json_metadata: '{}' }]);
      await gameState.lookAtSelf();
      expect(getMessages(gameState)).toContain('You have not set a character description yet.');
    });
  });

  // ─── lookAtPlayer ────────────────────────────────────────────────────────────

  describe('lookAtPlayer()', () => {
    it('outputs error when not logged in', async () => {
      await gameState.lookAtPlayer('bob');
      expect(getMessages(gameState)).toContain('You are not logged in.');
    });

    it('outputs error when not in a room', async () => {
      setPlayer(gameState);
      await gameState.lookAtPlayer('bob');
      expect(getMessages(gameState)).toContain('You are not in a room.');
    });

    it('outputs error when target is not in room', async () => {
      setReadyState(gameState);
      setRoom(gameState, { ...mockRoom, players: [] });
      await gameState.lookAtPlayer('bob');
      expect(getMessages(gameState)).toContain('You don\'t see "bob" here.');
    });

    it('outputs error when looking at self', async () => {
      setRoom(gameState, { ...mockRoom, players: ['alice'] });
      setPlayer(gameState, { username: 'alice' });
      await gameState.lookAtPlayer('alice');
      expect(getMessages(gameState)).toContain('Use "look self" to view your own description.');
    });

    it('shows description when target has one', async () => {
      setRoom(gameState, { ...mockRoom, players: ['alice', 'bob'] });
      setPlayer(gameState, { username: 'alice' });
      hiveClient.database.call.mockResolvedValue([{
        posting_json_metadata: JSON.stringify({ egodeathplayer: { Description: 'Bob is tall.' } }),
        json_metadata: '{}',
      }]);
      await gameState.lookAtPlayer('bob');
      const msgs = getMessages(gameState);
      expect(msgs).toContain("bob's description:");
      expect(msgs).toContain('Bob is tall.');
    });

    it('outputs no-description message when target has none', async () => {
      setRoom(gameState, { ...mockRoom, players: ['alice', 'bob'] });
      setPlayer(gameState, { username: 'alice' });
      hiveClient.database.call.mockResolvedValue([{ posting_json_metadata: '{}', json_metadata: '{}' }]);
      await gameState.lookAtPlayer('bob');
      expect(getMessages(gameState)).toContain('bob has not set a description yet.');
    });

    it('outputs error message on API failure', async () => {
      setRoom(gameState, { ...mockRoom, players: ['alice', 'bob'] });
      setPlayer(gameState, { username: 'alice' });
      hiveClient.database.call.mockRejectedValue(new Error('db error'));
      await gameState.lookAtPlayer('bob');
      expect(getMessages(gameState)).toContain("Unable to load bob's description.");
    });
  });

  // ─── setDescription / setShortDescription ────────────────────────────────────

  describe('setDescription()', () => {
    it('outputs error when not logged in', async () => {
      await gameState.setDescription('tall figure');
      expect(getMessages(gameState)).toContain('You must be logged in to set your description.');
    });

    it('outputs error when description is blank', async () => {
      setPlayer(gameState);
      await gameState.setDescription('   ');
      expect(getMessages(gameState)).toContain('Please provide a description.');
    });

    it('calls hiveClient.setDescription on success', async () => {
      setPlayer(gameState);
      await gameState.setDescription('A tall hooded figure.');
      expect(hiveClient.setDescription).toHaveBeenCalledWith('alice', 'A tall hooded figure.');
    });

    it('outputs error message on hiveClient failure', async () => {
      setPlayer(gameState);
      hiveClient.setDescription.mockRejectedValue(new Error('fail'));
      await gameState.setDescription('A tall hooded figure.');
      expect(getMessages(gameState)).toContain('Failed to set description. Please try again.');
    });
  });

  describe('setShortDescription()', () => {
    it('outputs error when not logged in', async () => {
      await gameState.setShortDescription('mysterious');
      expect(getMessages(gameState)).toContain('You must be logged in to set your short description.');
    });

    it('outputs error when short description is blank', async () => {
      setPlayer(gameState);
      await gameState.setShortDescription('  ');
      expect(getMessages(gameState)).toContain('Please provide a short description.');
    });

    it('calls hiveClient.setShortDescription on success', async () => {
      setPlayer(gameState);
      await gameState.setShortDescription('mysterious');
      expect(hiveClient.setShortDescription).toHaveBeenCalledWith('alice', 'mysterious');
    });

    it('outputs error message on hiveClient failure', async () => {
      setPlayer(gameState);
      hiveClient.setShortDescription.mockRejectedValue(new Error('fail'));
      await gameState.setShortDescription('mysterious');
      expect(getMessages(gameState)).toContain('Failed to set short description. Please try again.');
    });
  });

  // ─── say / emote ─────────────────────────────────────────────────────────────

  describe('say()', () => {
    it('outputs error when not logged in', () => {
      gameState.say('hello');
      expect(getMessages(gameState)).toContain('You must be logged in to speak.');
    });

    it('outputs local "You say:" message', () => {
      setPlayer(gameState);
      gameState.say('hello world');
      expect(getMessages(gameState)).toContain('You say: "hello world"');
    });

    it('calls socketManager.sendChat', () => {
      setPlayer(gameState);
      gameState.say('hello');
      expect(socketManager.sendChat).toHaveBeenCalledWith('hello', 'alice');
    });

    it('emits the "say" event', () => {
      setPlayer(gameState);
      const handler = jest.fn();
      gameState.on('say', handler);
      gameState.say('hello');
      expect(handler).toHaveBeenCalledWith({ username: 'alice', message: 'hello' });
    });
  });

  describe('emote()', () => {
    it('outputs error when not logged in', () => {
      gameState.emote('waves');
      expect(getMessages(gameState)).toContain('You must be logged in to emote.');
    });

    it('outputs conjugated emote for sender ("waves" → "wave")', () => {
      setPlayer(gameState);
      gameState.emote('waves hello');
      expect(getMessages(gameState)).toContain('You wave hello');
    });

    it('calls socketManager.sendEmote', () => {
      setPlayer(gameState);
      gameState.emote('waves');
      expect(socketManager.sendEmote).toHaveBeenCalledWith('waves', 'alice');
    });

    it('emits the "emote" event', () => {
      setPlayer(gameState);
      const handler = jest.fn();
      gameState.on('emote', handler);
      gameState.emote('waves');
      expect(handler).toHaveBeenCalledWith({ username: 'alice', emote: 'waves' });
    });
  });

  // ─── help ───────────────────────────────────────────────────────────────────

  describe('help()', () => {
    it('outputs multiple help lines', () => {
      gameState.help();
      const msgs = getMessages(gameState);
      expect(msgs.some(m => m.includes('Available commands'))).toBe(true);
      expect(msgs.some(m => m.includes('say'))).toBe(true);
      expect(msgs.some(m => m.includes('emote'))).toBe(true);
      expect(msgs.some(m => m.includes('look'))).toBe(true);
      expect(msgs.some(m => m.includes('@describe'))).toBe(true);
    });
  });

  // ─── setBuilderStatus ────────────────────────────────────────────────────────

  describe('setBuilderStatus()', () => {
    it('sets isBuilder on the player and emits playerChanged', () => {
      setPlayer(gameState);
      const handler = jest.fn();
      gameState.on('playerChanged', handler);
      gameState.setBuilderStatus(true);
      expect(gameState.getPlayer()?.isBuilder).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('is a no-op when there is no player', () => {
      const handler = jest.fn();
      gameState.on('playerChanged', handler);
      gameState.setBuilderStatus(true);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── setSocketManager event listeners ────────────────────────────────────────

  describe('setSocketManager() event listeners', () => {
    let sm: MockSocketManager;

    beforeEach(() => {
      sm = new MockSocketManager();
      gameState.setSocketManager(sm as any);
    });

    it('chatUnavailable: outputs message and sets flag', () => {
      sm.emit('chatUnavailable', { message: 'Chat is offline' });
      expect(getMessages(gameState)).toContain('Chat is offline');
    });

    it('chatUnavailable: only outputs once (flag prevents repeat)', () => {
      sm.emit('chatUnavailable', { message: 'Chat is offline' });
      sm.emit('chatUnavailable', { message: 'Chat is offline' });
      const count = getMessages(gameState).filter(m => m === 'Chat is offline').length;
      expect(count).toBe(1);
    });

    it('builderGranted: sets player.isBuilder and emits playerChanged', () => {
      setPlayer(gameState, { username: 'alice', isBuilder: false });
      const handler = jest.fn();
      gameState.on('playerChanged', handler);
      sm.emit('builderGranted', { username: 'alice' });
      expect(gameState.getPlayer()?.isBuilder).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('builderGranted: no-op when username does not match current player', () => {
      setPlayer(gameState, { username: 'alice' });
      sm.emit('builderGranted', { username: 'bob' });
      expect(gameState.getPlayer()?.isBuilder).toBe(false);
    });

    it('connectionStatusChanged "failed": outputs unavailable message', () => {
      sm.emit('connectionStatusChanged', { status: 'failed' });
      expect(getMessages(gameState).some(m => m.includes('unavailable'))).toBe(true);
    });

    it('connectionStatusChanged "connected": outputs connected message and resets flag', () => {
      sm.emit('connectionStatusChanged', { status: 'failed' });
      gameState.clearOutputMessages();
      sm.emit('connectionStatusChanged', { status: 'connected' });
      const msgs = getMessages(gameState);
      expect(msgs.some(m => m.includes('connected'))).toBe(true);
    });

    it('connectionStatusChanged "disconnected": debounces message (5s)', () => {
      jest.useFakeTimers();
      sm.emit('connectionStatusChanged', { status: 'disconnected' });
      expect(getMessages(gameState)).toHaveLength(0);
      jest.advanceTimersByTime(5000);
      expect(getMessages(gameState).some(m => m.includes('disconnected'))).toBe(true);
      jest.useRealTimers();
    });
  });

  // ─── updateRoomPlayers ───────────────────────────────────────────────────────

  describe('updateRoomPlayers()', () => {
    it('is a no-op when there is no current room', () => {
      gameState.updateRoomPlayers(['alice', 'bob']);
      expect(gameState.getCurrentRoomPlayers()).toEqual([]);
    });

    it('updates the player list in currentRoom', () => {
      setRoom(gameState);
      gameState.updateRoomPlayers(['alice', 'bob']);
      expect(gameState.getCurrentRoomPlayers()).toEqual(['alice', 'bob']);
    });

    it('emits roomPlayersUpdated', () => {
      setRoom(gameState);
      const handler = jest.fn();
      gameState.on('roomPlayersUpdated', handler);
      gameState.updateRoomPlayers(['alice']);
      expect(handler).toHaveBeenCalledWith({ players: ['alice'] });
    });

    it('sets hasReceivedInitialPlayerList on first call', () => {
      setRoom(gameState);
      expect((gameState as any).hasReceivedInitialPlayerList).toBe(false);
      gameState.updateRoomPlayers(['alice']);
      expect((gameState as any).hasReceivedInitialPlayerList).toBe(true);
    });

    it('triggers refreshRoomDisplay when new players appear on subsequent calls', () => {
      setRoom(gameState, { ...mockRoom, players: ['alice'] });
      setPlayer(gameState, { username: 'alice' });
      (gameState as any).hasReceivedInitialPlayerList = true;
      const spy = jest.spyOn(gameState, 'refreshRoomDisplay');
      // Second call with a new player (bob) triggers refresh
      gameState.updateRoomPlayers(['alice', 'bob']);
      expect(spy).toHaveBeenCalled();
    });
  });

  // ─── notifyPlayerJoined / notifyPlayerLeft ───────────────────────────────────

  describe('notifyPlayerJoined() / notifyPlayerLeft()', () => {
    it('notifyPlayerJoined outputs message for other players', () => {
      setPlayer(gameState, { username: 'alice' });
      gameState.notifyPlayerJoined('bob');
      expect(getMessages(gameState)).toContain('bob has entered the room.');
    });

    it('notifyPlayerJoined is silent for the current player', () => {
      setPlayer(gameState, { username: 'alice' });
      gameState.notifyPlayerJoined('alice');
      expect(getMessages(gameState)).toHaveLength(0);
    });

    it('notifyPlayerLeft outputs message for other players', () => {
      setPlayer(gameState, { username: 'alice' });
      gameState.notifyPlayerLeft('bob');
      expect(getMessages(gameState)).toContain('bob has left the room.');
    });

    it('notifyPlayerLeft is silent for the current player', () => {
      setPlayer(gameState, { username: 'alice' });
      gameState.notifyPlayerLeft('alice');
      expect(getMessages(gameState)).toHaveLength(0);
    });
  });

  // ─── refreshRoomDisplay ──────────────────────────────────────────────────────

  describe('refreshRoomDisplay()', () => {
    it('clears lastDisplayedRoom and calls displayRoom', () => {
      setRoom(gameState);
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.displayRoom(); // first display sets lastDisplayedRoom
      const msgCountAfterFirst = getMessages(gameState).length;
      gameState.refreshRoomDisplay(); // should display again
      expect(getMessages(gameState).length).toBeGreaterThan(msgCountAfterFirst);
    });

    it('is a no-op when there is no current room', () => {
      gameState.refreshRoomDisplay();
      expect(getMessages(gameState)).toHaveLength(0);
    });
  });

  // ─── resetRoomDisplayTracking ────────────────────────────────────────────────

  describe('resetRoomDisplayTracking()', () => {
    it('resets lastDisplayedRoom and hasReceivedInitialPlayerList', () => {
      (gameState as any).lastDisplayedRoom = 'some-key';
      (gameState as any).hasReceivedInitialPlayerList = true;
      gameState.resetRoomDisplayTracking();
      expect((gameState as any).lastDisplayedRoom).toBeNull();
      expect((gameState as any).hasReceivedInitialPlayerList).toBe(false);
    });
  });

  // ─── destroy ────────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('calls stopMoveListener on hiveClient', () => {
      gameState.destroy();
      expect(hiveClient.stopMoveListener).toHaveBeenCalled();
    });

    it('calls destroy() on socketManager', () => {
      gameState.destroy();
      expect(socketManager.destroy).toHaveBeenCalled();
    });

    it('clears player, currentRoom, and output messages', () => {
      setReadyState(gameState);
      gameState.addOutputMessage('test');
      gameState.destroy();
      expect(gameState.getPlayer()).toBeNull();
      expect(gameState.getCurrentRoom()).toBeNull();
      expect(gameState.getOutputMessages()).toHaveLength(0);
    });

    it('cancels disconnect debounce timer', () => {
      jest.useFakeTimers();
      const sm = new MockSocketManager();
      gameState.setSocketManager(sm as any);
      sm.emit('connectionStatusChanged', { status: 'disconnected' });
      gameState.destroy();
      // Timer cancelled: no message should appear after 5s
      jest.advanceTimersByTime(5000);
      expect(getMessages(gameState)).toHaveLength(0);
      jest.useRealTimers();
    });
  });

  // ─── Getters and output helpers ─────────────────────────────────────────────

  describe('getters and output helpers', () => {
    it('getPlayer() returns null initially', () => {
      expect(gameState.getPlayer()).toBeNull();
    });

    it('getCurrentRoom() returns null initially', () => {
      expect(gameState.getCurrentRoom()).toBeNull();
    });

    it('getCurrentRoomIdentifier() returns null initially', () => {
      expect(gameState.getCurrentRoomIdentifier()).toBeNull();
    });

    it('getGameMap() returns current game map', () => {
      gameState.setGameMap({ 'auth/room': { author: 'auth', exits: {} } });
      expect(gameState.getGameMap()).toHaveProperty('auth/room');
    });

    it('getHiveClient() returns the injected hiveClient', () => {
      expect(gameState.getHiveClient()).toBe(hiveClient);
    });

    it('getSocketManager() returns the socket manager', () => {
      expect(gameState.getSocketManager()).toBe(socketManager);
    });

    it('getSocketManager() throws when socketManager is null', () => {
      (gameState as any).socketManager = null;
      expect(() => gameState.getSocketManager()).toThrow('SocketManager not initialized');
    });

    it('addOutputMessage pushes to array and emits "output"', () => {
      const handler = jest.fn();
      gameState.on('output', handler);
      gameState.addOutputMessage('hello', true);
      expect(handler).toHaveBeenCalledWith({ output: 'hello', bold: true });
      expect(gameState.getOutputMessages()).toHaveLength(1);
    });

    it('addOutput pushes a full GameOutputMessage', () => {
      gameState.addOutput({ output: 'world', bold: false });
      expect(gameState.getOutputMessages()[0]).toEqual({ output: 'world', bold: false });
    });

    it('clearOutputMessages empties the array', () => {
      gameState.addOutputMessage('one');
      gameState.addOutputMessage('two');
      gameState.clearOutputMessages();
      expect(gameState.getOutputMessages()).toHaveLength(0);
    });

    it('getIsProcessingMovement() returns false by default', () => {
      expect(gameState.getIsProcessingMovement()).toBe(false);
    });

    it('getIsLoggingIn() returns false by default', () => {
      expect(gameState.getIsLoggingIn()).toBe(false);
    });

    it('getCurrentRoomPlayers() returns [] when no room', () => {
      expect(gameState.getCurrentRoomPlayers()).toEqual([]);
    });

    it('getCurrentRoomPlayers() returns room players array', () => {
      setRoom(gameState, { ...mockRoom, players: ['alice', 'bob'] });
      expect(gameState.getCurrentRoomPlayers()).toEqual(['alice', 'bob']);
    });
  });
});
