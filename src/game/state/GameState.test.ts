import { EventEmitter } from 'events';

// Create a real EventEmitter for the mock
const eventEmitter = new EventEmitter();

// Mock the HiveClient
const mockDatabase = {
  call: jest.fn(),
  getAccountHistory: jest.fn()
};
const mockHiveClient = {
  getComments: jest.fn(),
  database: mockDatabase,
  moveTo: jest.fn(),
  getAccountHistory: jest.fn()
};
// Mock the HiveClient class AFTER defining the mockHiveClient
jest.mock('../blockchain/HiveClient', () => ({
  HiveClient: function () { return mockHiveClient; }
}));

// Mock the SocketManager
const mockSocketManager = {
  emit: jest.fn(),
  emitEvent: jest.fn().mockImplementation((...args) => {
    console.log('Mock emitEvent called with:', args);
  }),
  on: eventEmitter.on.bind(eventEmitter),
  off: eventEmitter.off.bind(eventEmitter)
};
jest.mock('../network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => mockSocketManager)
}));

import { GameState } from './GameState';
import { HiveClient } from '../blockchain/HiveClient';
import { RoomData, Player } from '../types/GameTypes';

describe('GameState', () => {
  let gameState: GameState;

  beforeEach(() => {
    jest.clearAllMocks();
    gameState = new GameState(new HiveClient());
    
    // Debug: Check what the HiveClient constructor returned
    console.log('Debug - mockHiveClient:', mockHiveClient);
    console.log('Debug - mockDatabase:', mockDatabase);
    console.log('Debug - GameState hiveClient:', gameState.getHiveClient());
    console.log('Debug - GameState hiveClient.database:', gameState.getHiveClient()?.database);
  });

  describe('loadRoom', () => {
    it('should load room with details from blockchain', async () => {
      const mockRoomData = {
        id: 'testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: { north: 'northroom' },
        details: {}
      };

      const mockContent = {
        id: 123,
        title: 'Test Room',
        body: 'A test room',
        json_metadata: '{}'
      };

      const mockComments = [
        {
          author: 'testuser',
          body: 'flock of gulls: White crested ocean birds flutter about.',
          created: '2025-06-22T16:46:09.804Z'
        },
        {
          author: 'testuser',
          body: 'herd animals: They seem to be some form of bovine.',
          created: '2025-06-22T16:46:10.804Z'
        },
        {
          author: 'otheruser',
          body: 'This is a comment by someone else',
          created: '2025-06-22T16:46:11.804Z'
        }
      ];

      mockDatabase.call.mockResolvedValue(mockContent);
      mockHiveClient.getComments.mockResolvedValue(mockComments);

      gameState.setSocketManager(mockSocketManager as any);

      // Set up game map with exits
      gameState.setGameMap({
        testroom: {
          author: 'testuser',
          permlink: 'testroom',
          title: 'Test Room',
          description: 'A test room',
          exits: { north: 'northroom' }
        }
      });

      // Debug: Check if socket manager is set
      console.log('Debug - Socket manager set:', gameState.getHiveClient());

      await gameState.loadRoom(mockRoomData);

      expect(mockHiveClient.getComments).toHaveBeenCalledWith('testuser', 'testroom');
      expect(mockSocketManager.emitEvent).toHaveBeenCalledWith('updateRoomData', {
        room: 'testuser/testroom',
        roomData: {
          title: 'Test Room',
          body: 'A test room',
          exits: { north: 'northroom' },
          author: 'testuser',
          permlink: 'testroom',
          details: {
            'flock of gulls': 'White crested ocean birds flutter about.',
            'herd animals': 'They seem to be some form of bovine.'
          }
        }
      });

      const currentRoom = gameState.getCurrentRoom();
      expect(currentRoom).toEqual({
        id: 'testuser/testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: { north: 'northroom' },
        details: {
          'flock of gulls': 'White crested ocean birds flutter about.',
          'herd animals': 'They seem to be some form of bovine.'
        }
      });
    });
  });
}); 