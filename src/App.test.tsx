import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';
import { KeychainSDK } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import { debounce } from 'lodash';
import userEvent from '@testing-library/user-event';
import { io, Socket } from 'socket.io-client';
import Peer, { SignalData } from 'simple-peer';

// Mock external dependencies
jest.mock('keychain-sdk');
jest.mock('@hiveio/dhive');
jest.mock('lodash', () => ({
  debounce: jest.fn((fn) => {
    const debouncedFn = (...args: any[]) => fn(...args);
    debouncedFn.cancel = jest.fn();
    return debouncedFn;
  })
}));
jest.mock('socket.io-client');
jest.mock('simple-peer');

// Add type declaration for window.hive_keychain
declare global {
  interface Window {
    hive_keychain: {
      requestHandshake: () => Promise<boolean>;
      requestSignBuffer: () => Promise<{ success: boolean }>;
      requestTransfer: () => Promise<{ success: boolean }>;
    };
  }
}

// Mock interfaces
interface MockKeychain {
  login: jest.Mock;
  requestSignBuffer: jest.Mock;
  requestTransfer: jest.Mock;
}

interface MockStream {
  on: (event: string, callback: (data: any) => void) => void;
  once: (event: string, callback: (data: any) => void) => void;
  removeListener: (event: string, callback: (data: any) => void) => void;
  removeAllListeners: (event?: string) => void;
  destroy: () => void;
}

interface MockClient {
  database: {
    getAccounts: jest.Mock;
    getDynamicGlobalProperties: jest.Mock;
    getAccountHistory: jest.Mock;
    call: jest.Mock;
  };
  broadcast: {
    sendOperations: jest.Mock;
  };
  blockchain: {
    getOperationsStream: jest.Mock;
  };
}

interface MockSocket extends Partial<Socket> {
  connected: boolean;
  connect: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
  emit: jest.Mock;
}

describe('App Component', () => {
  let mockKeychain: MockKeychain;
  let mockClient: MockClient;
  let mockSocket: any;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let isSettingUpSocket: boolean = false;

  const mockGameData = {
    egodeathplayer: {
      Name: 'testuser',
      Description: 'A test user',
      ShortDesc: 'Testing'
    }
  };

  // Factory for a fresh mock socket
  function createMockSocket() {
    return {
      on: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      removeAllListeners: jest.fn(),
      id: 'test-socket-id',
      connected: true,
      rooms: new Set(['test-room'])
    };
  }

  beforeEach(() => {
    // Save original console methods and mock them
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    console.warn = jest.fn();
    console.error = jest.fn();

    jest.clearAllMocks();
    isSettingUpSocket = false;

    // Mock KeychainSDK
    (KeychainSDK as jest.Mock).mockImplementation(() => ({
      login: jest.fn().mockResolvedValue({ success: true }),
      requestSignBuffer: jest.fn().mockResolvedValue({ success: true }),
      requestTransfer: jest.fn().mockResolvedValue({ success: true })
    }));

    // Mock window.hive_keychain
    window.hive_keychain = {
      requestHandshake: jest.fn().mockResolvedValue(true),
      requestSignBuffer: jest.fn().mockResolvedValue({ success: true }),
      requestTransfer: jest.fn().mockResolvedValue({ success: true })
    } as any;

    // Create fresh mock socket for each test
    mockSocket = createMockSocket();
    mockSocket.connected = true;
    (io as jest.Mock).mockReturnValue(mockSocket);

    // Setup socket event handlers for signaling server
    mockSocket.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'connect') {
        setTimeout(() => callback(), 0);
      } else if (event === 'roomState') {
        setTimeout(() => callback({
          title: 'Start Room',
          body: 'This is the start room',
          players: [],
          details: {},
          exits: { north: 'north-room' },
          author: 'testuser',
          permlink: 'start'
        }), 0);
      } else if (event === 'roomUpdate') {
        setTimeout(() => callback({
          title: 'North Room',
          body: 'This is the north room',
          players: ['testuser'],
          details: {},
          exits: { south: 'start' },
          author: 'testuser',
          permlink: 'north-room'
        }), 0);
      } else if (event === 'roomJoined') {
        setTimeout(() => callback({
          username: 'testuser',
          room: 'north-room'
        }), 0);
      } else if (event === 'playerLeft') {
        setTimeout(() => callback({
          username: 'testuser'
        }), 0);
      } else if (event === 'chat') {
        setTimeout(() => callback({
          username: 'testuser',
          message: 'Hello world!'
        }), 0);
      } else if (event === 'emote') {
        setTimeout(() => callback({
          username: 'testuser',
          emote: 'waves'
        }), 0);
      }
    });

    // Mock socket emit for signaling server
    mockSocket.emit.mockImplementation((event: string, data: any) => {
      if (event === 'joinRoom') {
        // Simulate room join acknowledgment
        setTimeout(() => {
          const roomStateCallback = mockSocket.on.mock.calls.find(
            (call: [string, Function]) => call[0] === 'roomState'
          )?.[1];
          if (roomStateCallback) {
            roomStateCallback({
              title: 'North Room',
              body: 'This is the north room',
              players: ['testuser'],
              details: {},
              exits: { south: 'start' },
              author: 'testuser',
              permlink: 'north-room'
            });
          }
        }, 0);
      } else if (event === 'leaveRoom') {
        // Simulate room leave acknowledgment
        setTimeout(() => {
          const playerLeftCallback = mockSocket.on.mock.calls.find(
            (call: [string, Function]) => call[0] === 'playerLeft'
          )?.[1];
          if (playerLeftCallback) {
            playerLeftCallback({
              username: 'testuser'
            });
          }
        }, 0);
      }
    });

    // Mock dhive Client
    mockClient = {
      database: {
        getAccounts: jest.fn().mockResolvedValue([{
          name: 'testuser',
          json_metadata: JSON.stringify({
            game: {
              location: 'start',
              description: 'A test player',
              shortDescription: 'A test player'
            }
          })
        }]),
        getDynamicGlobalProperties: jest.fn().mockResolvedValue({ head_block_number: 1000 }),
        getBlock: jest.fn().mockResolvedValue({ timestamp: '2024-01-01T00:00:00' }),
        call: jest.fn().mockImplementation((method: string, params: any[]) => {
          if (method === 'get_content') {
            if (params[1] === 'north-room') {
              return Promise.resolve({
                title: 'North Room',
                body: 'This is the north room',
                json_metadata: JSON.stringify({
                  exits: { south: 'start' }
                })
              });
            }
            return Promise.resolve({
              title: 'Start Room',
              body: 'This is the start room',
              json_metadata: JSON.stringify({
                exits: { north: 'north-room' }
              })
            });
          }
          return Promise.resolve([]);
        }),
        getAccountHistory: jest.fn().mockResolvedValue([])
      },
      broadcast: {
        sendOperations: jest.fn().mockResolvedValue({ id: 'test-tx-id' })
      },
      blockchain: {
        getOperationsStream: jest.fn().mockReturnValue({
          on: (event: string, callback: (data: any) => void) => {
            if (event === 'data') {
              // Simulate receiving a blockchain operation after a short delay
              setTimeout(() => {
                callback({
                  op: ['custom_json', {
                    required_auths: ['testuser'],
                    id: 'leaf',
                    json: JSON.stringify({
                      type: 'move',
                      data: { direction: 'north' }
                    })
                  }],
                  trx_id: 'test-tx-id'
                });
              }, 100);
            }
          },
          once: (event: string, callback: (data: any) => void) => {
            if (event === 'data') {
              setTimeout(() => {
                callback({
                  op: ['custom_json', {
                    required_auths: ['testuser'],
                    id: 'leaf',
                    json: JSON.stringify({
                      type: 'move',
                      data: { direction: 'north' }
                    })
                  }],
                  trx_id: 'test-tx-id'
                });
              }, 100);
            }
          },
          removeListener: (event: string, callback: (data: any) => void) => {},
          removeAllListeners: (event?: string) => {},
          destroy: () => {}
        })
      }
    } as unknown as MockClient;
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);

    // Mock socket.io client
    mockSocket = {
      connected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        } else if (event === 'roomState') {
          setTimeout(() => callback({
            title: 'Start Room',
            body: 'This is the start room',
            players: [],
            details: {},
            exits: { north: 'north-room' },
            author: 'testuser',
            permlink: 'start'
          }), 0);
        } else if (event === 'roomUpdate') {
          setTimeout(() => callback({
            title: 'North Room',
            body: 'This is the north room',
            players: ['testuser'],
            details: {},
            exits: { south: 'start' },
            author: 'testuser',
            permlink: 'north-room'
          }), 0);
        } else if (event === 'roomJoined') {
          setTimeout(() => callback({
            username: 'testuser',
            room: 'north-room'
          }), 0);
        } else if (event === 'playerLeft') {
          setTimeout(() => callback({
            username: 'testuser'
          }), 0);
        } else if (event === 'chat') {
          setTimeout(() => callback({
            username: 'testuser',
            message: 'Hello world!'
          }), 0);
        } else if (event === 'emote') {
          setTimeout(() => callback({
            username: 'testuser',
            emote: 'waves'
          }), 0);
        }
      }),
      emit: jest.fn((event, data, callback) => {
        if (event === 'joinRoom') {
          setTimeout(() => callback?.(null, { success: true }), 0);
        } else if (event === 'leaveRoom') {
          setTimeout(() => callback?.(null, { success: true }), 0);
        }
      }),
      removeAllListeners: jest.fn()
    } as unknown as MockSocket;
    (io as unknown as jest.Mock).mockReturnValue(mockSocket);

    // Mock the gameJSON state
    (window as any).gameJSON = {
      'test-room': {
        author: 'testuser',
        exits: { north: 'north-room' }
      },
      'north-room': {
        author: 'testuser',
        exits: { south: 'test-room' }
      }
    };

    // Mock the client.database.call response
    mockClient.database.call.mockImplementation((method: string, params: any[]) => {
      if (method === 'get_content') {
        if (params[1] === 'north-room') {
          return Promise.resolve({
            title: 'North Room',
            body: 'This is the north room.',
            json_metadata: JSON.stringify({
              exits: { south: 'genesis-scaffold-precipice' }
            })
          });
        }
        if (params[1] === 'genesis-scaffold-precipice') {
          return Promise.resolve({
            title: 'Genesis Scaffold Precipice',
            body: 'You stand at the edge of a vast precipice, the ground beneath your feet crumbling away into the abyss below. The air is thick with the scent of ozone and the distant sound of thunder echoes through the void.',
            json_metadata: JSON.stringify({
              exits: { north: 'north-room', south: 'south-room' }
            })
          });
        }
      }
      if (method === 'get_accounts') {
        return Promise.resolve([{
          posting_json_metadata: JSON.stringify({
            egodeathplayer: {
              Name: 'testuser',
              Description: 'A test user',
              ShortDesc: 'Testing'
            }
          })
        }]);
      }
      return Promise.resolve([]);
    });

    // Mock the keychain.broadcast response
    mockClient.broadcast.sendOperations.mockImplementation(() => {
      return Promise.resolve({});
    });

    // Mock Hive client
    mockClient.blockchain.getOperationsStream.mockResolvedValue({
      on: jest.fn((event: string, callback: Function) => {
        if (event === 'data') {
          // Simulate blockchain operation for movement
          setTimeout(() => callback({
            op: ['custom_json', {
              id: 'egodeathgame',
              json: JSON.stringify({
                command: 'move',
                data: {
                  username: 'testuser',
                  destination: 'north-room'
                }
              })
            }]
          }), 0);
        }
      }),
      destroy: jest.fn()
    });
  });

  afterEach(() => {
    // Restore original console methods
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    
    // Clean up socket
    if (mockSocket) {
      mockSocket.removeAllListeners();
      mockSocket.disconnect();
    }
    isSettingUpSocket = false;
  });

  afterAll(() => {
    // Clean up any remaining socket connections
    if (mockSocket) {
      mockSocket.removeAllListeners();
      mockSocket.disconnect();
    }
    // Clean up any remaining peer connections
    if (Peer.prototype.destroy) {
      Peer.prototype.destroy();
    }
  });

  test('renders the game title', () => {
    render(<App />);
    expect(screen.getByText(/E̴̙̣̦̩̱̮͇̋̐̏̕G/i)).toBeInTheDocument();
  });

  const loginUser = async () => {
    const inputElement = screen.getByTestId('command-input');
    fireEvent.change(inputElement, { target: { value: 'login testuser' } });
    fireEvent.keyDown(inputElement, { key: 'Enter' });
    
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });
  };

  describe('handleTextEntered - Login Command', () => {
    test('successful login calls keychain.login and fetches player data', async () => {
      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');
      
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login testuser' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      expect(mockClient.database.getAccounts).toHaveBeenCalledWith(['testuser']);
      
      await waitFor(() => {
        expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
      });
    });

    test('login without username shows error', async () => {
      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');
      
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/You must follow your login\/connect command with your hive username/i)).toBeInTheDocument();
      });
    });

    test('failed login shows error message', async () => {
      mockClient.database.getAccounts.mockRejectedValue(new Error('Login failed'));

      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');
      
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login testuser' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Error fetching player data: Login failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('handleTextEntered - Look Command', () => {
    beforeEach(() => {
      // Mock the gameJSON state
      (window as any).gameJSON = {
        'genesis-scaffold-precipice': {
          author: 'raymonjohnstone',
          exits: { north: 'north-room', south: 'south-room' }
        },
        'north-room': {
          author: 'raymonjohnstone',
          exits: { south: 'genesis-scaffold-precipice' }
        }
      };

      // Mock both get_content and get_accounts responses
      mockClient.database.call.mockImplementation((method: string, params: any[]) => {
        if (method === 'get_content') {
          if (params[1] === 'north-room') {
            return Promise.resolve({
              title: 'North Room',
              body: 'This is the north room.',
              json_metadata: JSON.stringify({
                exits: { south: 'genesis-scaffold-precipice' }
              })
            });
          }
          if (params[1] === 'genesis-scaffold-precipice') {
            return Promise.resolve({
              title: 'Genesis Scaffold Precipice',
              body: 'You stand at the edge of a vast precipice, the ground beneath your feet crumbling away into the abyss below. The air is thick with the scent of ozone and the distant sound of thunder echoes through the void.',
              json_metadata: JSON.stringify({
                exits: { north: 'north-room', south: 'south-room' }
              })
            });
          }
        }
        if (method === 'get_accounts') {
          return Promise.resolve([{
            posting_json_metadata: JSON.stringify({
              egodeathplayer: {
                Name: 'testuser',
                Description: 'A test user',
                ShortDesc: 'Testing'
              }
            })
          }]);
        }
        return Promise.resolve([]);
      });
    });

    test('new user sees welcome message after login', async () => {
      // Mock getAccountHistory to return empty (new user)
      mockClient.database.getAccountHistory.mockResolvedValueOnce([]);

      render(<App />);
      await loginUser();

      // Verify welcome message is displayed
      await waitFor(() => {
        const welcomeMessage = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'b' && 
                 content.includes('Welcome to the game! You don\'t seem to have a location yet, so you start at the beginning.');
        });
        expect(welcomeMessage).toBeInTheDocument();
      });
    });

    test('existing user sees room data immediately after login', async () => {
      // Mock getAccountHistory to return a move_to operation
      mockClient.database.getAccountHistory.mockResolvedValueOnce([{
        op: ['custom_json', {
          id: 'ego-death',
          required_posting_auths: ['testuser'],
          json: JSON.stringify({
            move_to: {
              Location: {
                author: 'raymonjohnstone',
                permlink: 'north-room'
              }
            }
          })
        }]
      }]);

      render(<App />);
      await loginUser();

      // Issue look command
      const input = screen.getByTestId('command-input');
      fireEvent.change(input, { target: { value: 'look' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Verify room data is displayed after look command
      await waitFor(() => {
        const lookCommand = screen.getByText('Executing command: look');
        expect(lookCommand).toBeInTheDocument();

        // Find all room titles
        const roomTitles = screen.getAllByText('Genesis Scaffold Precipice', { selector: 'b' });
        expect(roomTitles.length).toBeGreaterThan(0);

        // The last room title should be after the look command
        const lastRoomTitle = roomTitles[roomTitles.length - 1];
        const lastRoomTitleParent = lastRoomTitle.parentElement;
        const lookCommandParent = lookCommand.parentElement;
        
        // Verify that the last room title appears after the look command
        if (lastRoomTitleParent && lookCommandParent) {
          expect(lastRoomTitleParent.compareDocumentPosition(lookCommandParent)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
        } else {
          fail('Could not find parent elements for comparison');
        }
      });
    });

    test('look command displays room data for new user', async () => {
      // Mock getAccountHistory to return empty (new user)
      mockClient.database.getAccountHistory.mockResolvedValueOnce([]);

      render(<App />);
      await loginUser();

      // Issue look command
      const input = screen.getByTestId('command-input');
      fireEvent.change(input, { target: { value: 'look' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Verify room data is displayed after look command
      await waitFor(() => {
        const lookCommand = screen.getByText('Executing command: look');
        expect(lookCommand).toBeInTheDocument();

        // Find all room titles
        const roomTitles = screen.getAllByText('Genesis Scaffold Precipice', { selector: 'b' });
        expect(roomTitles.length).toBeGreaterThan(0);

        // The last room title should be after the look command
        const lastRoomTitle = roomTitles[roomTitles.length - 1];
        const lastRoomTitleParent = lastRoomTitle.parentElement;
        const lookCommandParent = lookCommand.parentElement;
        
        // Verify that the last room title appears after the look command
        if (lastRoomTitleParent && lookCommandParent) {
          expect(lastRoomTitleParent.compareDocumentPosition(lookCommandParent)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
        } else {
          fail('Could not find parent elements for comparison');
        }
      });
    });

    test('look self displays player description', async () => {
      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');

      // Login first
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login testuser' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      // Look self
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'look self' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/You see yourself. A test user/i)).toBeInTheDocument();
        expect(screen.getByText(/Short description: Testing/i)).toBeInTheDocument();
      });
    });
  });

  describe('handleTextEntered - Movement Commands', () => {
    test('successful movement updates location', async () => {
      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');

      // Login first
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login testuser' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      // Move north
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'north' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(mockClient.broadcast.sendOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: expect.arrayContaining([
              expect.arrayContaining([
                'custom_json',
                expect.objectContaining({
                  json: expect.stringContaining('north-room')
                })
              ])
            ])
          })
        );
        expect(screen.getByText(/You traipse off towards north/i)).toBeInTheDocument();
      });
    });

    test('invalid movement shows error', async () => {
      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');

      // Login first
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login testuser' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      // Try invalid direction
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'east' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Error: Invalid destination/i)).toBeInTheDocument();
      });
    });
  });

  describe('handleTextEntered - Description Commands', () => {
    test('@describe updates player description', async () => {
      render(<App />);
      await loginUser();
      
      const input = screen.getByTestId('command-input');
      fireEvent.change(input, { target: { value: '@describe a brave adventurer' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockClient.broadcast.sendOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: expect.arrayContaining([
              expect.arrayContaining([
                'account_update2',
                expect.objectContaining({
                  posting_json_metadata: expect.stringContaining('a brave adventurer')
                })
              ])
            ])
          })
        );
        expect(screen.getByText(/Your description has been updated./i)).toBeInTheDocument();
      });
    });

    test('@describeshort updates player short description', async () => {
      render(<App />);
      await loginUser();
      
      const input = screen.getByTestId('command-input');
      fireEvent.change(input, { target: { value: '@describeshort brave' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockClient.broadcast.sendOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: expect.arrayContaining([
              expect.arrayContaining([
                'account_update2',
                expect.objectContaining({
                  posting_json_metadata: expect.stringContaining('brave')
                })
              ])
            ])
          })
        );
        expect(screen.getByText(/Your short description has been updated./i)).toBeInTheDocument();
      });
    });
  });

  describe('Login Flow', () => {
    it('should handle successful login', async () => {
      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      // Wait for socket to be initialized
      await waitFor(() => {
        expect(mockSocket.connect).toHaveBeenCalled();
      }, { timeout: 1000 });

      // Wait for login to complete
      await waitFor(() => {
        expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify socket events are registered
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('roomState', expect.any(Function));
    });

    it('should handle failed login', async () => {
      mockClient.database.getAccounts.mockRejectedValue(new Error('Login failed'));

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      // Wait for socket to be initialized
      await waitFor(() => {
        expect(mockSocket.connect).toHaveBeenCalled();
      }, { timeout: 1000 });

      await waitFor(() => {
        expect(screen.getByText(/Error fetching player data: Login failed/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Room State', () => {
    beforeEach(async () => {
      // Setup successful login
      mockClient.database.getAccounts.mockResolvedValue([{
        name: 'testuser',
        posting: {
          key_auths: [['STM8...', 1]]
        }
      }]);
      mockClient.broadcast.sendOperations.mockResolvedValue({});

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      // Wait for socket to be initialized
      await waitFor(() => {
        expect(mockSocket.connect).toHaveBeenCalled();
      }, { timeout: 1000 });

      // Wait for login to complete
      await waitFor(() => {
        expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
      }, { timeout: 1000 });

      // Wait for room state to be received from signaling server
      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('roomState', expect.any(Function));
      }, { timeout: 1000 });
    });

    it('should handle look command', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'look{enter}');

      await waitFor(() => {
        expect(screen.getByText(/You are in Test Room/i)).toBeInTheDocument();
        expect(screen.getByText(/This is a test room/i)).toBeInTheDocument();
        expect(screen.getByText(/Exits: north/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle movement commands', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'north{enter}');

      // Verify blockchain operation was sent
      await waitFor(() => {
        expect(mockClient.broadcast.sendOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                type: 'custom_json',
                id: 'egodeathgame',
                json: expect.stringContaining('"command":"move"')
              })
            ])
          })
        );
      }, { timeout: 1000 });

      // Verify room update was received from signaling server
      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('roomUpdate', expect.any(Function));
      }, { timeout: 1000 });
    });

    it('should handle invalid movement command', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'invalid{enter}');

      await waitFor(() => {
        expect(screen.getByText(/Error: Invalid destination/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('P2P Communication', () => {
    beforeEach(async () => {
      // Setup successful login
      mockClient.database.getAccounts.mockResolvedValue([{
        name: 'testuser',
        posting: {
          key_auths: [['STM8...', 1]]
        }
      }]);
      mockClient.broadcast.sendOperations.mockResolvedValue({});

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      await waitFor(() => {
        expect(screen.getByText('Login successful as testuser')).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle chat messages', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'say Hello, world!{enter}');

      await waitFor(() => {
        expect(screen.getByText('You say: Hello, world!')).toBeInTheDocument();
      }, { timeout: 1000 });

      // Simulate receiving a chat message
      const chatHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'chat')![1];
      await act(async () => {
        chatHandler({ username: 'otheruser', message: 'Hi there!' });
      });

      await waitFor(() => {
        expect(screen.getByText('[otheruser]: Hi there!')).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle emotes', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'emote waves{enter}');

      await waitFor(() => {
        expect(screen.getByText('You waves')).toBeInTheDocument();
      }, { timeout: 1000 });

      // Simulate receiving an emote
      const emoteHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'emote')![1];
      await act(async () => {
        emoteHandler({ username: 'otheruser', emote: 'dances' });
      });

      await waitFor(() => {
        expect(screen.getByText('[P2P] otheruser dances')).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Room State Management', () => {
    beforeEach(async () => {
      // Setup successful login
      mockClient.database.getAccounts.mockResolvedValue([{
        name: 'testuser',
        posting: {
          key_auths: [['STM8...', 1]]
        }
      }]);
      mockClient.broadcast.sendOperations.mockResolvedValue({});

      // Mock the gameJSON state
      (window as any).gameJSON = {
        'test-room': {
          author: 'testuser',
          exits: { north: 'north-room' }
        },
        'north-room': {
          author: 'testuser',
          exits: { south: 'test-room' }
        }
      };

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      // Wait for login to complete
      await waitFor(() => {
        expect(screen.getByText('Login successful as testuser')).toBeInTheDocument();
      }, { timeout: 1000 });

      // Wait for socket to be ready and handlers to be registered
      await waitFor(() => {
        expect(mockSocket.connected).toBe(true);
        const registeredEvents = mockSocket.on.mock.calls.map((call: [string, Function]) => call[0]);
        expect(registeredEvents).toContain('roomState');
        expect(registeredEvents).toContain('roomJoined');
        expect(registeredEvents).toContain('roomUpdate');
        expect(registeredEvents).toContain('playerJoined');
      }, { timeout: 1000 });
    });

    it('should handle player joining room', async () => {
      // Simulate player joining
      await act(async () => {
        const playerJoinedHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'playerJoined')![1];
        await playerJoinedHandler({
          room: 'test-room',
          username: 'newplayer',
          players: ['testuser', 'newplayer']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(screen.getByText('newplayer has entered the room.')).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle room state updates with other players', async () => {
      // First set up initial room data
      await act(async () => {
        // First emit roomState to set initial state
        const roomStateHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'roomState')![1];
        await roomStateHandler({
          room: 'test-room',
          players: ['testuser']
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Then emit roomJoined to ensure room is properly joined
        const roomJoinedHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'roomJoined')![1];
        await roomJoinedHandler({
          room: 'test-room',
          username: 'testuser',
          players: ['testuser']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Now simulate room state update
      await act(async () => {
        const roomUpdateHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'roomUpdate')![1];
        await roomUpdateHandler({
          room: 'test-room',
          players: ['testuser', 'player1', 'player2']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Wait for the room data to be updated and rendered
      await waitFor(() => {
        const presentPlayersText = screen.getByText('Present players:');
        expect(presentPlayersText).toBeInTheDocument();
        
        // Check for player entries
        const player1Text = screen.getByText('- player1');
        const player2Text = screen.getByText('- player2');
        expect(player1Text).toBeInTheDocument();
        expect(player2Text).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle room state updates with no other players', async () => {
      // First set up initial room data
      await act(async () => {
        // First emit roomState to set initial state
        const roomStateHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'roomState')![1];
        await roomStateHandler({
          room: 'test-room',
          players: ['testuser']
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Then emit roomJoined to ensure room is properly joined
        const roomJoinedHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'roomJoined')![1];
        await roomJoinedHandler({
          room: 'test-room',
          username: 'testuser',
          players: ['testuser']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Now simulate room state update with no other players
      await act(async () => {
        const roomUpdateHandler = (mockSocket.on as jest.Mock).mock.calls.find((call: [string, Function]) => call[0] === 'roomUpdate')![1];
        await roomUpdateHandler({
          room: 'test-room',
          players: ['testuser']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Wait for the room data to be updated and rendered
      await waitFor(() => {
        expect(screen.getByText('No other players are currently in this room.')).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Error Handling', () => {
    it('should handle blockchain errors', async () => {
      mockClient.database.getAccounts.mockRejectedValue(new Error('Blockchain error'));

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      await waitFor(() => {
        expect(screen.getByText(/Error fetching player data: Blockchain error/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle socket connection errors', async () => {
      // Create a new mock socket for this test
      const errorSocket = createMockSocket();
      errorSocket.connected = false;
      (io as jest.Mock).mockReturnValue(errorSocket);

      // Mock the connect_error event
      errorSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          callback(new Error('Connection error'));
        }
      });

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      // Wait for socket to be initialized
      await waitFor(() => {
        expect(errorSocket.connect).toHaveBeenCalled();
      }, { timeout: 1000 });

      // Verify error handling
      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(expect.any(Error));
      }, { timeout: 1000 });
    });
  });

  describe('Chat and Emotes', () => {
    beforeEach(async () => {
      // Setup successful login
      mockClient.database.getAccounts.mockResolvedValue([{
        name: 'testuser',
        posting: {
          key_auths: [['STM8...', 1]]
        }
      }]);
      mockClient.broadcast.sendOperations.mockResolvedValue({});

      render(<App />);
      
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'login testuser{enter}');

      // Wait for socket to be initialized
      await waitFor(() => {
        expect(mockSocket.connect).toHaveBeenCalled();
      }, { timeout: 1000 });

      // Wait for login to complete
      await waitFor(() => {
        expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should handle chat messages', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'say Hello, world!{enter}');

      await waitFor(() => {
        expect(mockClient.broadcast.sendOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                type: 'custom_json',
                id: 'egodeathgame',
                json: expect.stringContaining('"command":"say"')
              })
            ])
          })
        );
      }, { timeout: 1000 });
    });

    it('should handle emotes', async () => {
      const input = screen.getByTestId('command-input');
      await userEvent.type(input, 'emote waves{enter}');

      await waitFor(() => {
        expect(mockClient.broadcast.sendOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                type: 'custom_json',
                id: 'egodeathgame',
                json: expect.stringContaining('"command":"emote"')
              })
            ])
          })
        );
      }, { timeout: 1000 });
    });
  });
});