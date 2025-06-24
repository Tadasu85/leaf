import { HiveClient } from './HiveClient';
import { Client } from '@hiveio/dhive';

// Mock the keychain-sdk and KeychainKeyTypes before importing HiveClient
const createMockKeychain = () => ({
  broadcast: jest.fn(),
  post: jest.fn()
});

jest.mock('keychain-sdk', () => {
  return {
    KeychainSDK: jest.fn().mockImplementation(() => createMockKeychain()),
    KeychainKeyTypes: { posting: 'posting' }
  };
});

// Mock the @hiveio/dhive Client
const createMockDatabase = () => ({
  call: jest.fn(),
  getAccountHistory: jest.fn()
});
const createMockClient = () => ({
  database: createMockDatabase()
});
jest.mock('@hiveio/dhive', () => ({
  Client: jest.fn().mockImplementation(() => createMockClient())
}));

describe('HiveClient', () => {
  let hiveClient: HiveClient;
  let mockDatabase: any;
  let mockKeychain: any;
  let mockClient: any;

  beforeEach(() => {
    mockDatabase = createMockDatabase();
    mockKeychain = createMockKeychain();
    mockClient = { database: mockDatabase };
    (require('@hiveio/dhive').Client as jest.Mock).mockImplementation(() => mockClient);
    (require('keychain-sdk').KeychainSDK as jest.Mock).mockImplementation(() => mockKeychain);
    hiveClient = new HiveClient();
  });

  describe('getComments', () => {
    it('should fetch comments successfully', async () => {
      const mockComments = [
        {
          author: 'testuser',
          body: 'flock of gulls: White crested ocean birds flutter about.',
          created: '2025-06-22T16:46:09.804Z',
          permlink: 're-testuser-sx4mjj'
        },
        {
          author: 'testuser',
          body: 'herd animals: They seem to be some form of bovine.',
          created: '2025-06-22T16:46:10.804Z',
          permlink: 're-testuser-sx6e21'
        }
      ];

      mockDatabase.call.mockResolvedValue(mockComments);

      const result = await hiveClient.getComments('testuser', 'testroom');

      expect(mockDatabase.call).toHaveBeenCalledWith('get_content_replies', [
        'testuser',
        'testroom'
      ]);
      expect(result).toEqual(mockComments);
    });

    it('should handle empty comments response', async () => {
      mockDatabase.call.mockResolvedValue([]);

      const result = await hiveClient.getComments('testuser', 'testroom');

      expect(result).toEqual([]);
    });

    it('should handle null comments response', async () => {
      mockDatabase.call.mockResolvedValue(null);

      const result = await hiveClient.getComments('testuser', 'testroom');

      expect(result).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDatabase.call.mockRejectedValue(new Error('API Error'));

      const result = await hiveClient.getComments('testuser', 'testroom');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HiveClient Debug] Error fetching comments:',
        expect.any(Error)
      );
      expect(result).toEqual([]);
      
      consoleSpy.mockRestore();
    });

    it('should log debug information', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.call.mockResolvedValue([]);

      await hiveClient.getComments('testuser', 'testroom');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HiveClient Debug] Fetching comments for testuser/testroom'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[HiveClient Debug] Found 0 comments'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('moveTo', () => {
    it('should create correct move operation', async () => {
      mockKeychain.broadcast.mockResolvedValue({ success: true });

      const location = { author: 'testuser', permlink: 'testroom' };
      await hiveClient.moveTo('testuser', location);

      expect(mockKeychain.broadcast).toHaveBeenCalledWith({
        username: 'testuser',
        operations: [
          [
            'custom_json',
            {
              required_auths: [],
              required_posting_auths: ['testuser'],
              id: expect.any(String),
              json: JSON.stringify({
                move_to: {
                  Location: {
                    author: 'testuser',
                    permlink: 'testroom'
                  }
                }
              })
            }
          ]
        ],
        method: expect.any(String)
      });
    });
  });

  describe('database access', () => {
    it('should provide access to database client', () => {
      const database = hiveClient.database;
      expect(database).toBe(mockDatabase);
    });

    it('should provide access to client', () => {
      const client = hiveClient.getClient();
      expect(client).toBe(mockClient);
    });
  });
}); 