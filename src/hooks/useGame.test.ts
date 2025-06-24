import { renderHook, act } from '@testing-library/react';
import { useGame } from './useGame';
import { GameState } from '../game/state/GameState';
import { HiveClient } from '../game/blockchain/HiveClient';
import { Client } from '@hiveio/dhive';
import { KeychainSDK } from 'keychain-sdk';
import { EventEmitter } from 'events';

jest.mock('../game/state/GameState', () => {
  const { EventEmitter } = require('events');
  class MockGameState extends EventEmitter {
    constructor(hiveClient: any) {
      super();
      this.hiveClient = hiveClient;
    }
    login = jest.fn();
    getPlayer = jest.fn();
    getCurrentRoom = jest.fn();
    say = jest.fn();
    emote = jest.fn();
    look = jest.fn();
    help = jest.fn();
    move = jest.fn();
    addOutputMessage = jest.fn();
    addOutput = jest.fn();
    setGameMap = jest.fn();
  }
  return {
    GameState: MockGameState
  };
});

jest.mock('../game/blockchain/HiveClient', () => ({
  HiveClient: jest.fn().mockImplementation(() => ({
    getComments: jest.fn(),
    database: {
      call: jest.fn(),
      getAccountHistory: jest.fn()
    },
    moveTo: jest.fn()
  }))
}));

describe('useGame', () => {
  let mockClient: jest.Mocked<Client>;
  let mockKeychain: jest.Mocked<KeychainSDK>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      hivemind: {
        getCommunity: jest.fn()
      },
      database: {
        call: jest.fn(),
        getAccountHistory: jest.fn()
      }
    } as any;
    
    mockKeychain = {
      broadcast: jest.fn()
    } as any;
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));

      expect(result.current.player).toBeNull();
      expect(result.current.currentRoom).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('login', () => {
    it('should handle successful login', async () => {
      const mockPlayer = {
        username: 'testuser',
        location: { author: 'testuser', permlink: 'testroom' },
        isAdmin: false,
        isBuilder: false,
        characterDescription: ''
      };

      const { result } = renderHook(() => useGame(mockClient, mockKeychain));

      // Wait for the hook to initialize and create the GameState
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Set up mocks on the actual GameState instance
      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.login as any).mockImplementation(async () => {
          // Simulate async login
          await Promise.resolve();
          gameState.emit('playerChanged', mockPlayer);
        });
        (gameState.getPlayer as any).mockReturnValue(mockPlayer);
      }

      await act(async () => {
        await result.current.login('testuser');
      });

      // Wait for state update
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(gameState?.login).toHaveBeenCalledWith('testuser');
      expect(result.current.player).toEqual(mockPlayer);
    });

    it('should handle login errors', async () => {
      const error = new Error('Login failed');

      const { result } = renderHook(() => useGame(mockClient, mockKeychain));

      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Set up mocks on the actual GameState instance
      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.login as any).mockRejectedValue(error);
      }

      await act(async () => {
        await result.current.login('testuser');
      });

      expect(result.current.error).toBe('Login failed');
    });
  });

  describe('handleCommand', () => {
    it('should handle say command', async () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
      }

      await act(async () => {
        await result.current.handleCommand('say Hello, world!');
      });

      expect(gameState?.say).toHaveBeenCalledWith('Hello, world!');
    });

    it('should handle emote command', async () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
      }

      await act(async () => {
        await result.current.handleCommand('emote waves hello');
      });

      expect(gameState?.emote).toHaveBeenCalledWith('waves hello');
    });

    it('should handle look command', async () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
      }

      await act(async () => {
        await result.current.handleCommand('look');
      });

      expect(gameState?.look).toHaveBeenCalled();
    });

    it('should handle lookAt command with exact match', async () => {
      const mockRoom = {
        id: 'testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: {},
        details: {
          'flock of gulls': 'White crested ocean birds flutter about.'
        }
      };

      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
        (gameState.getCurrentRoom as any).mockReturnValue(mockRoom);
      }

      await act(async () => {
        await result.current.handleCommand('look flock of gulls');
      });

      expect(gameState?.addOutputMessage).toHaveBeenCalledWith('flock of gulls', true);
      expect(gameState?.addOutputMessage).toHaveBeenCalledWith('White crested ocean birds flutter about.', false);
    });

    it('should handle lookAt command with partial match', async () => {
      const mockRoom = {
        id: 'testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: {},
        details: {
          'flock of gulls': 'White crested ocean birds flutter about.'
        }
      };

      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
        (gameState.getCurrentRoom as any).mockReturnValue(mockRoom);
      }

      await act(async () => {
        await result.current.handleCommand('look gulls');
      });

      expect(gameState?.addOutputMessage).toHaveBeenCalledWith('flock of gulls', true);
    });

    it('should handle lookAt command with no match', async () => {
      const mockRoom = {
        id: 'testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: {},
        details: {
          'flock of gulls': 'White crested ocean birds flutter about.'
        }
      };

      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
        (gameState.getCurrentRoom as any).mockReturnValue(mockRoom);
      }

      await act(async () => {
        await result.current.handleCommand('look nonexistent');
      });

      expect(gameState?.addOutputMessage).toHaveBeenCalledWith('You don\'t see "nonexistent" here.', true);
    });

    it('should handle help command', async () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
      }

      await act(async () => {
        await result.current.handleCommand('help');
      });

      expect(gameState?.help).toHaveBeenCalled();
    });

    it('should handle move command', async () => {
      const mockRoom = {
        id: 'testroom',
        title: 'Test Room',
        description: 'A test room',
        author: 'testuser',
        permlink: 'testroom',
        exits: { north: 'northroom' },
        details: {}
      };
      const mockGameJSON = {
        testroom: {
          author: 'testuser',
          permlink: 'testroom',
          title: 'Test Room',
          description: 'A test room',
          exits: { north: 'northroom' }
        }
      };
      const mockPlayer = {
        username: 'testuser',
        location: { author: 'testuser', permlink: 'testroom' },
        isAdmin: false,
        isBuilder: false,
        characterDescription: ''
      };

      // Mock keychain broadcast to succeed (move this before renderHook)
      mockKeychain.broadcast = jest.fn().mockResolvedValue({
        success: true,
        result: { id: 'mock-transaction-id' }
      });

      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Set up game map and mocks
      await act(async () => {
        result.current.updateGameJSON(mockGameJSON);
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue(mockPlayer);
        (gameState.getCurrentRoom as any).mockReturnValue(mockRoom);
        
        // Trigger playerChanged event to update hook's internal player state
        await act(async () => {
          gameState.emit('playerChanged', mockPlayer);
        });
      }

      // Wait for state update
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Debug: Log the current state before the command
      console.log('Debug - Player state:', result.current.player);
      console.log('Debug - GameJSON state:', result.current.gameJSON);
      console.log('Debug - GameState player:', gameState?.getPlayer());

      await act(async () => {
        await result.current.handleCommand('north');
      });

      // Flush any effects
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Check that the keychain broadcast was called (indicating move was attempted)
      expect(mockKeychain.broadcast).toHaveBeenCalled();
    });

    it('should handle unknown commands', async () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue({
          username: 'testuser',
          location: { author: 'testuser', permlink: 'testroom' },
          isAdmin: false,
          isBuilder: false,
          characterDescription: ''
        });
      }

      await act(async () => {
        await result.current.handleCommand('unknowncommand');
      });

      expect(gameState?.addOutputMessage).toHaveBeenCalledWith('Invalid command. Type "help" for a list of commands.');
    });

    it('should reject commands when player is not logged in', async () => {
      const { result } = renderHook(() => useGame(mockClient, mockKeychain));
      
      // Wait for the hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const gameState = result.current.gameState;
      if (gameState) {
        (gameState.getPlayer as any).mockReturnValue(null);
      }

      await act(async () => {
        await result.current.handleCommand('move north');
      });

      expect(gameState?.addOutputMessage).toHaveBeenCalledWith('Invalid command. Type "help" for a list of commands.');
      expect(gameState?.move).not.toHaveBeenCalled();
    });
  });
}); 