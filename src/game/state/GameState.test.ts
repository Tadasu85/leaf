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
  getRoomData: jest.fn(),
  getRoomDetails: jest.fn(),
  loadAllGameData: jest.fn(),
  getGameMap: jest.fn(),
  getCacheStats: jest.fn(),
  clearCache: jest.fn(),
  database: mockDatabase,
  moveTo: jest.fn(),
  getAccountHistory: jest.fn(),
  startMoveListener: jest.fn(),
  stopMoveListener: jest.fn(),
  setDescription: jest.fn(),
  setShortDescription: jest.fn(),
  getProfileImage: jest.fn(),
  getClient: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn()
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
      const mockLocation = {
        author: 'testuser',
        permlink: 'testroom'
      };

      const mockRoomData = {
        id: 'testuser/testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: { north: 'northroom' }
        // No details initially - this will trigger getRoomDetails call
      };

      const mockDetails = {
        'flock of gulls': 'White crested ocean birds flutter about.',
        'herd animals': 'They seem to be some form of bovine.'
      };

      // Mock the new bulk loading methods
      mockHiveClient.getRoomData.mockResolvedValue(mockRoomData);
      mockHiveClient.getRoomDetails.mockResolvedValue(mockDetails);

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

      // Listen for the 'roomStateChanged' event
      const roomChangedHandler = jest.fn();
      gameState.on('roomStateChanged', roomChangedHandler);

      await gameState.loadRoom(mockLocation);

      expect(mockHiveClient.getRoomData).toHaveBeenCalledWith(mockLocation);
      expect(mockHiveClient.getRoomDetails).toHaveBeenCalledWith('testuser', 'testroom');
      expect(roomChangedHandler).toHaveBeenCalledWith({
        id: 'testuser/testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: { north: 'northroom' },
        details: mockDetails
      });

      const currentRoom = gameState.getCurrentRoom();
      expect(currentRoom).toEqual({
        id: 'testuser/testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: { north: 'northroom' },
        details: mockDetails
      });
    });
  });
}); 