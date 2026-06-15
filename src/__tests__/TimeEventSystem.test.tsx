import { GameState } from '../game/state/GameState';
import { TimeEventConfig, BlockchainTimeEvent } from '../game/types/GameTypes';
import { EventEmitter } from 'events';

class MockHiveClient extends EventEmitter {
  getTimeEventConfig = jest.fn();
  registerTimeEventRoom = jest.fn();
  unregisterTimeEventRoom = jest.fn();
  getRoomData = jest.fn();
  getRoomDetails = jest.fn();
  getClient = jest.fn();
  database = { call: jest.fn() };
}

const makeConfig = (overrides: Partial<TimeEventConfig> = {}): TimeEventConfig => ({
  type: 'ferry',
  intervalBlocks: 10,
  startBlock: 1000,
  currentPhase: 0,
  phases: [
    { phase: 0, name: 'Phase A', description: 'Test', exits: { north: 'port-a' } },
    { phase: 1, name: 'Phase B', description: 'Test', exits: {} },
    { phase: 2, name: 'Phase C', description: 'Test', exits: { south: 'port-b' } }
  ],
  ...overrides
});

describe('Time Event System', () => {
  let hiveClient: any;
  let gameState: GameState;

  beforeEach(() => {
    hiveClient = new MockHiveClient();
    gameState = new GameState(hiveClient);
    gameState.getCurrentRoom = jest.fn();
  });

  test('registerTimeEventRoom delegates to hiveClient', () => {
    const config = makeConfig();
    gameState.registerTimeEventRoom('test-room', config);
    expect(hiveClient.registerTimeEventRoom).toHaveBeenCalledWith('test-room', config);
  });

  test('unregisterTimeEventRoom delegates to hiveClient', () => {
    gameState.unregisterTimeEventRoom('test-room');
    expect(hiveClient.unregisterTimeEventRoom).toHaveBeenCalledWith('test-room');
  });

  test('handles timeEventDetected when player is in the affected room', () => {
    const roomPermlink = 'ferry-dock';
    const config = makeConfig({ currentPhase: 1 });
    hiveClient.getTimeEventConfig.mockReturnValue(config);
    // Populate GameState's own timeEventRooms map so handleTimeEvent can find the config
    gameState.registerTimeEventRoom(roomPermlink, config);

    const mockRoom = {
      id: roomPermlink,
      title: 'Ferry Dock',
      description: 'The dock.',
      author: 'test-author',
      permlink: roomPermlink,
      exits: {},
      players: []
    };
    (gameState.getCurrentRoom as jest.Mock).mockReturnValue(mockRoom);
    // Wire the internal currentRoom so handleTimeEvent can find it
    (gameState as any).currentRoom = mockRoom;

    const outputMessages: string[] = [];
    gameState.on('output', (msg: any) => outputMessages.push(msg.output));

    const timeEvent: BlockchainTimeEvent = {
      type: 'timeEvent',
      roomPermlink,
      currentBlock: 1010,
      eventType: 'ferry',
      phase: 1,
      timestamp: new Date().toISOString()
    };

    hiveClient.emit('timeEventDetected', timeEvent);

    // Should have output the phase name as a bold header (prefixed with newline)
    expect(outputMessages).toContain('\nPhase B');
  });

  test('ignores timeEventDetected for a room the player is not in', () => {
    const config = makeConfig({ currentPhase: 1 });
    hiveClient.getTimeEventConfig.mockReturnValue(config);

    // Player is in a different room
    (gameState as any).currentRoom = {
      permlink: 'some-other-room',
      author: 'test-author',
      title: 'Other Room',
      description: 'Not the ferry.',
      exits: {},
      players: []
    };

    const outputMessages: string[] = [];
    gameState.on('output', (msg: any) => outputMessages.push(msg.output));

    const timeEvent: BlockchainTimeEvent = {
      type: 'timeEvent',
      roomPermlink: 'ferry-dock',
      currentBlock: 1010,
      eventType: 'ferry',
      phase: 1,
      timestamp: new Date().toISOString()
    };

    hiveClient.emit('timeEventDetected', timeEvent);
    expect(outputMessages).toHaveLength(0);
  });

  test('loadRoom applies exits from the current time-event phase', async () => {
    const roomPermlink = 'ferry-dock';
    const config = makeConfig({ currentPhase: 2 }); // Phase C has south exit

    const mockRoomData = {
      id: roomPermlink,
      title: 'Ferry Dock',
      description: 'The dock.',
      author: 'test-author',
      permlink: roomPermlink,
      exits: {}
    };

    hiveClient.getRoomData.mockResolvedValue(mockRoomData);
    hiveClient.getTimeEventConfig.mockReturnValue(config);
    hiveClient.getRoomDetails = jest.fn().mockResolvedValue({});

    await gameState.loadRoom({ author: 'test-author', permlink: roomPermlink }, true);

    const room = (gameState as any).currentRoom;
    expect(room.isTimeBased).toBe(true);
    expect(room.exits).toEqual({ south: 'port-b' });
  });

  test('phase 0 is used when block is before startBlock', async () => {
    const roomPermlink = 'ferry-dock';
    // currentPhase 0 — block stream has not reached startBlock yet
    const config = makeConfig({ currentPhase: 0 });

    const mockRoomData = {
      id: roomPermlink,
      title: 'Ferry Dock',
      description: 'The dock.',
      author: 'test-author',
      permlink: roomPermlink,
      exits: {}
    };

    hiveClient.getRoomData.mockResolvedValue(mockRoomData);
    hiveClient.getTimeEventConfig.mockReturnValue(config);
    hiveClient.getRoomDetails = jest.fn().mockResolvedValue({});

    await gameState.loadRoom({ author: 'test-author', permlink: roomPermlink }, true);

    const room = (gameState as any).currentRoom;
    expect(room.exits).toEqual({ north: 'port-a' }); // Phase A exits
  });
});
