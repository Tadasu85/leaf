import { BulkDataLoader } from './BulkDataLoader';
import { Client } from '@hiveio/dhive';
import { GameMap, Location } from '../types/GameTypes';

// Mock the Hive client
const mockClient = {
  database: {
    call: jest.fn()
  }
} as unknown as Client;

describe('BulkDataLoader', () => {
  let bulkLoader: BulkDataLoader;

  beforeEach(() => {
    bulkLoader = new BulkDataLoader(mockClient, {
      maxCacheSize: 10,
      enableCompression: true,
      loadRoomDetails: false,
      memoryLimitMB: 5
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultLoader = new BulkDataLoader(mockClient);
      expect(defaultLoader).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const customLoader = new BulkDataLoader(mockClient, {
        maxCacheSize: 500,
        enableCompression: false,
        loadRoomDetails: true,
        memoryLimitMB: 100
      });
      expect(customLoader).toBeDefined();
    });
  });

  describe('loadAllGameData', () => {
    it('should load game data successfully', async () => {
      const mockGameAccount = [{
        posting_json_metadata: JSON.stringify({
          egodeathgamedata: {
            rooms_authors_exits: {
              'room1': {
                author: 'testuser',
                permlink: 'room1',
                title: 'Test Room 1',
                description: 'A test room',
                exits: { north: 'room2' }
              },
              'room2': {
                author: 'testuser',
                permlink: 'room2',
                title: 'Test Room 2',
                description: 'Another test room',
                exits: { south: 'room1' }
              }
            }
          }
        })
      }];

      const mockRoomContent = {
        id: 1,
        title: 'Test Room',
        body: 'A test room description',
        author: 'testuser',
        permlink: 'room1'
      };

      (mockClient.database.call as jest.Mock)
        .mockResolvedValueOnce(mockGameAccount) // get_accounts call
        .mockResolvedValueOnce(mockRoomContent) // get_content call for room1
        .mockResolvedValueOnce(mockRoomContent); // get_content call for room2

      const result = await bulkLoader.loadAllGameData();

      expect(result).toEqual({
        'room1': {
          author: 'testuser',
          permlink: 'room1',
          title: 'Test Room 1',
          description: 'A test room',
          exits: { north: 'room2' }
        },
        'room2': {
          author: 'testuser',
          permlink: 'room2',
          title: 'Test Room 2',
          description: 'Another test room',
          exits: { south: 'room1' }
        }
      });
    });

    it('should handle missing game data gracefully', async () => {
      const mockGameAccount = [{
        posting_json_metadata: JSON.stringify({})
      }];

      (mockClient.database.call as jest.Mock).mockResolvedValueOnce(mockGameAccount);

      await expect(bulkLoader.loadAllGameData()).rejects.toThrow('No game map data found in profile JSON');
    });
  });

  describe('getRoomData', () => {
    it('should return cached room data', async () => {
      const location: Location = { author: 'testuser', permlink: 'room1' };
      
      // Mock the bulk loader to have data loaded
      (bulkLoader as any).gameMap = {
        'room1': {
          author: 'testuser',
          permlink: 'room1',
          title: 'Test Room',
          description: 'A test room',
          exits: {}
        }
      };
      (bulkLoader as any).isInitialized = true;

      const mockRoomContent = {
        id: 1,
        title: 'Test Room',
        body: 'A test room description',
        author: 'testuser',
        permlink: 'room1'
      };

      (mockClient.database.call as jest.Mock).mockResolvedValueOnce(mockRoomContent);

      const result = await bulkLoader.getRoomData(location);

      expect(result).toEqual({
        id: 'testuser/room1',
        title: 'Test Room',
        description: 'A test room description',
        author: 'testuser',
        permlink: 'room1',
        exits: {}
      });
    });

    it('should return null for non-existent room', async () => {
      const location: Location = { author: 'testuser', permlink: 'nonexistent' };
      
      (bulkLoader as any).gameMap = {};
      (bulkLoader as any).isInitialized = true;

      const result = await bulkLoader.getRoomData(location);

      expect(result).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should provide cache statistics', () => {
      const stats = bulkLoader.getCacheStats();
      
      expect(stats).toEqual({
        size: 0,
        maxSize: 10,
        memoryUsageMB: 0,
        hitRate: 0
      });
    });

    it('should clear cache', () => {
      bulkLoader.clearCache();
      const stats = bulkLoader.getCacheStats();
      
      expect(stats.size).toBe(0);
    });
  });

  describe('data loading status', () => {
    it('should report correct initialization status', () => {
      expect(bulkLoader.isDataLoaded()).toBe(false);
      
      (bulkLoader as any).isInitialized = true;
      expect(bulkLoader.isDataLoaded()).toBe(true);
    });
  });
}); 