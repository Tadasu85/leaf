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

// Increase timeout for all tests
jest.setTimeout(10000);

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

  // Factory for a fresh mock socket
  function createMockSocket() {
    return {
      on: jest.fn(),
      off: jest.fn(),
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

    // Mock dhive Client with minimal implementation
    mockClient = {
      database: {
        getAccounts: jest.fn().mockResolvedValue([{
          name: 'testuser',
          posting_json_metadata: JSON.stringify({
            egodeathplayer: {
              Name: 'testuser',
              Description: 'A test player',
              ShortDesc: 'A test player'
            }
          })
        }]),
        getDynamicGlobalProperties: jest.fn().mockResolvedValue({ head_block_number: 1000 }),
        call: jest.fn().mockImplementation((method: string, params: any[]) => {
          if (method === 'get_content') {
            return Promise.resolve({
              title: 'Start Room',
              body: 'This is the start room',
              json_metadata: JSON.stringify({
                exits: { north: 'north-room' }
              })
            });
          }
          if (method === 'get_content_replies') {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        }),
        getAccountHistory: jest.fn().mockResolvedValue([])
      },
      blockchain: {
        getOperationsStream: jest.fn().mockReturnValue({
          on: jest.fn(),
          once: jest.fn(),
          removeListener: jest.fn(),
          removeAllListeners: jest.fn(),
          destroy: jest.fn()
        })
      }
    };

    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    // Restore original console methods
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  // Test UI rendering
  test('renders initial game greeting', () => {
    render(<App />);
    expect(screen.getByText(/If you've arrived here by accident/i)).toBeInTheDocument();
  });

  // Test login functionality
  test('handles login command', async () => {
    render(<App />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'login testuser{enter}');
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });
  });

  // Test look command
  test('handles look command', async () => {
    render(<App />);
    const input = screen.getByRole('textbox');
    
    // First login
    await userEvent.type(input, 'login testuser{enter}');
    
    // Wait for login to complete
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });

    // Wait for initial room data to load
    await waitFor(() => {
      expect(screen.getByText('No other players are currently in this room.')).toBeInTheDocument();
    });

    // Then look
    await userEvent.type(input, 'look{enter}');
    
    // Verify room details are displayed
    await waitFor(() => {
      // Get all room titles and verify the second one exists
      const roomTitles = screen.getAllByText('Start Room', { selector: 'b' });
      expect(roomTitles[1]).toBeInTheDocument();
      
      // Get all room descriptions and verify the second one exists
      const roomDescriptions = screen.getAllByText('This is the start room');
      expect(roomDescriptions[1]).toBeInTheDocument();
      
      // Get all no players messages and verify the second one exists
      const noPlayersMessages = screen.getAllByText('No other players are currently in this room.');
      expect(noPlayersMessages[1]).toBeInTheDocument();
    });
  });

  // Test chat functionality
  test('handles chat command', async () => {
    render(<App />);
    const input = screen.getByRole('textbox');
    
    // First login
    await userEvent.type(input, 'login testuser{enter}');
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });

    // Then chat
    await userEvent.type(input, 'say Hello, world!{enter}');
    await waitFor(() => {
      expect(screen.getByText(/You say: Hello, world!/i)).toBeInTheDocument();
    });
  });

  // Test emote functionality
  test('handles emote command', async () => {
    render(<App />);
    const input = screen.getByRole('textbox');
    
    // First login
    await userEvent.type(input, 'login testuser{enter}');
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });

    // Then emote
    await userEvent.type(input, 'emote waves{enter}');
    await waitFor(() => {
      expect(screen.getByText(/You waves/i)).toBeInTheDocument();
    });
  });
});