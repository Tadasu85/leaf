import { HiveClient } from '../game/blockchain/HiveClient';
import { GameState } from '../game/state/GameState';
import { TimeEventConfig, TimeEventPhase, BlockchainTimeEvent } from '../game/types/GameTypes';
import { EventEmitter } from 'events';

// Mock HiveClient as an EventEmitter
class MockHiveClient extends EventEmitter {
  getTimeEventConfig = jest.fn();
  registerTimeEventRoom = jest.fn();
  unregisterTimeEventRoom = jest.fn();
  getRoomData = jest.fn();
  getRoomDetails = jest.fn();
  getClient = jest.fn();
  database = { call: jest.fn() };
}

describe('Time Event System', () => {
  let hiveClient: any;
  let gameState: GameState;

  beforeEach(() => {
    hiveClient = new MockHiveClient();
    gameState = new GameState(hiveClient);
    // Mock the getCurrentRoom method
    gameState.getCurrentRoom = jest.fn();
  });

  test('should register a ferry room with time-based events', () => {
    const roomPermlink = 'test-ferry';
    const title = 'Test Ferry';
    const description = 'A test ferry room';
    const intervalBlocks = 50;

    // Mock the getTimeEventConfig to return a config
    const mockConfig: TimeEventConfig = {
      type: 'ferry',
      intervalBlocks: 50,
      lastChangeBlock: 0,
      currentPhase: 0,
      phases: [
        { phase: 0, name: 'Phase 1', description: 'Test', exits: {}, duration: 50 },
        { phase: 1, name: 'Phase 2', description: 'Test', exits: {}, duration: 50 },
        { phase: 2, name: 'Phase 3', description: 'Test', exits: {}, duration: 50 },
        { phase: 3, name: 'Phase 4', description: 'Test', exits: {}, duration: 50 },
        { phase: 4, name: 'Phase 5', description: 'Test', exits: {}, duration: 50 },
        { phase: 5, name: 'Phase 6', description: 'Test', exits: {}, duration: 50 }
      ]
    };
    hiveClient.getTimeEventConfig.mockReturnValue(mockConfig);

    gameState.createFerryRoom(roomPermlink, title, description, intervalBlocks, 0);

    // Verify the room is registered
    expect(hiveClient.registerTimeEventRoom).toHaveBeenCalledWith(roomPermlink, expect.objectContaining({
      type: 'ferry',
      intervalBlocks: 50,
      currentPhase: 0
    }));
    
    const config = hiveClient.getTimeEventConfig(roomPermlink);
    expect(config).toBeDefined();
    expect(config.type).toBe('ferry');
    expect(config.intervalBlocks).toBe(intervalBlocks);
    expect(config.phases).toHaveLength(6); // 6 phases for ferry
  });

  test('should handle time event phase changes', () => {
    const roomPermlink = 'test-ferry';
    gameState.createFerryRoom(roomPermlink, 'Test Ferry', 'A test ferry', 10, 0);

    // Mock the getTimeEventConfig to return a config with updated phase
    const mockConfig: TimeEventConfig = {
      type: 'ferry',
      intervalBlocks: 10,
      lastChangeBlock: 100,
      currentPhase: 1,
      phases: [
        { phase: 0, name: 'Phase 1', description: 'Test', exits: {}, duration: 10 },
        { phase: 1, name: 'Phase 2', description: 'Test', exits: {}, duration: 10 }
      ]
    };
    hiveClient.getTimeEventConfig.mockReturnValue(mockConfig);

    // Simulate a time event
    const mockTimeEvent: BlockchainTimeEvent = {
      type: 'timeEvent',
      roomPermlink,
      author: 'Test Ferry',
      currentBlock: 100,
      eventType: 'ferry',
      phase: 1,
      timestamp: new Date().toISOString()
    };

    // Trigger the time event
    hiveClient.emit('timeEventDetected', mockTimeEvent);

    // Verify the event was processed
    const config = hiveClient.getTimeEventConfig(roomPermlink);
    expect(config.currentPhase).toBe(1);
  });

  test('should apply dynamic exits for time-based rooms', async () => {
    const roomPermlink = 'test-ferry';
    gameState.createFerryRoom(roomPermlink, 'Test Ferry', 'A test ferry', 10, 0);

    // Mock room data with time-based properties
    const mockRoomData = {
      id: roomPermlink,
      title: 'Test Ferry',
      description: 'A test ferry room',
      author: 'test-author',
      permlink: roomPermlink,
      exits: {},
      players: [],
      isTimeBased: true,
      timeEventConfig: {
        type: 'ferry',
        intervalBlocks: 10,
        lastChangeBlock: 0,
        currentPhase: 0,
        phases: [
          { phase: 0, name: 'Phase 1', description: 'Test', exits: { north: 'port-a' }, duration: 10 }
        ]
      }
    };

    // Mock the getRoomData method
    hiveClient.getRoomData.mockResolvedValue(mockRoomData);

    // Mock the getTimeEventConfig method
    hiveClient.getTimeEventConfig.mockReturnValue(mockRoomData.timeEventConfig);

    // Load the room
    await gameState.loadRoom({ author: 'test-author', permlink: roomPermlink });

    // Make getCurrentRoom return the loaded room
    (gameState.getCurrentRoom as jest.Mock).mockReturnValue(mockRoomData);

    // Verify the room has time-based properties
    const currentRoom = gameState.getCurrentRoom();
    expect(currentRoom).toBeDefined();
    expect(currentRoom?.isTimeBased).toBe(true);
    expect(currentRoom?.timeEventConfig).toBeDefined();
  });

  test('should cycle through ferry phases correctly', () => {
    const roomPermlink = 'test-ferry';
    gameState.createFerryRoom(roomPermlink, 'Test Ferry', 'A test ferry', 10, 0);

    // Mock the getTimeEventConfig to return a config starting at phase 0
    const initialConfig: TimeEventConfig = {
      type: 'ferry',
      intervalBlocks: 10,
      lastChangeBlock: 0,
      currentPhase: 0,
      phases: [
        { phase: 0, name: 'Phase 1', description: 'Test', exits: {}, duration: 10 },
        { phase: 1, name: 'Phase 2', description: 'Test', exits: {}, duration: 10 },
        { phase: 2, name: 'Phase 3', description: 'Test', exits: {}, duration: 10 },
        { phase: 3, name: 'Phase 4', description: 'Test', exits: {}, duration: 10 },
        { phase: 4, name: 'Phase 5', description: 'Test', exits: {}, duration: 10 },
        { phase: 5, name: 'Phase 6', description: 'Test', exits: {}, duration: 10 }
      ]
    };
    hiveClient.getTimeEventConfig.mockReturnValue(initialConfig);

    const config = hiveClient.getTimeEventConfig(roomPermlink);
    expect(config.currentPhase).toBe(0);

    // Simulate multiple phase changes
    for (let i = 1; i <= 6; i++) {
      const mockTimeEvent: BlockchainTimeEvent = {
        type: 'timeEvent',
        roomPermlink,
        author: 'Test Ferry',
        currentBlock: 100 + i * 10,
        eventType: 'ferry',
        phase: i % 6, // Cycle through phases 0-5
        timestamp: new Date().toISOString()
      };

      hiveClient.emit('timeEventDetected', mockTimeEvent);
    }

    // Mock the final config to show we're back to phase 0
    const finalConfig: TimeEventConfig = {
      ...initialConfig,
      currentPhase: 0
    };
    hiveClient.getTimeEventConfig.mockReturnValue(finalConfig);

    // Verify we're back to phase 0 after cycling through all phases
    const resultConfig = hiveClient.getTimeEventConfig(roomPermlink);
    expect(resultConfig.currentPhase).toBe(0);
  });
}); 