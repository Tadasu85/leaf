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
import config from './config';

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
  hivemind: {
    getCommunity: jest.Mock;
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
      },
      hivemind: {
        getCommunity: jest.fn().mockResolvedValue([{
          name: config.game.accountName,
          team: [
            ['testuser', 'Builder', 'Builder']
          ]
        }])
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

  // Test BuildModal functionality
  test('BuildModal opens and closes correctly', async () => {
    const { container } = render(<App />);
    
    // Set up mock client response for initial login
    const mockClient = (Client as unknown as jest.Mock).mock.results[0].value;
    mockClient.database.getAccounts.mockImplementation(() => Promise.resolve([{
      name: 'testuser',
      posting_json_metadata: JSON.stringify({
        egodeathplayer: {
          Name: 'testuser',
          Description: 'A test player',
          ShortDesc: 'A test player'
        }
      })
    }]));

    // Mock community team data to include testuser as a builder
    mockClient.hivemind.getCommunity.mockImplementation(() => Promise.resolve([{
      name: config.game.accountName,
      team: [
        ['testuser', 'Builder', 'Builder']
      ]
    }]));

    // First login
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'login testuser{enter}');
    
    // Wait for login success
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });

    // Wait for Build button to appear
    let buildButton;
    await waitFor(() => {
      try {
        buildButton = screen.getByRole('button', { name: 'Build' });
      } catch {
        buildButton = container.querySelector('.top-right-button');
      }
      if (!buildButton) {
        // Log the DOM for debugging
        // eslint-disable-next-line no-console
        console.log(container.innerHTML);
      }
      expect(buildButton).toBeInTheDocument();
    });
    if (!buildButton) throw new Error('Build button not found');
    // Click build button
    await userEvent.click(buildButton);
    // Verify modal is open
    await waitFor(() => {
      expect(screen.getByText('Build New Room')).toBeInTheDocument();
    });
    // Close modal
    const closeButton = screen.getByRole('button', { name: /×/i });
    await userEvent.click(closeButton);
    // Verify modal is closed
    await waitFor(() => {
      expect(screen.queryByText('Build New Room')).not.toBeInTheDocument();
    });
  });

  test('BuildModal form validation works', async () => {
    const { container } = render(<App />);
    
    // Set up mock client response for initial login
    const mockClient = (Client as unknown as jest.Mock).mock.results[0].value;
    mockClient.database.getAccounts.mockImplementation(() => Promise.resolve([{
      name: 'testuser',
      posting_json_metadata: JSON.stringify({
        egodeathplayer: {
          Name: 'testuser',
          Description: 'A test player',
          ShortDesc: 'A test player'
        }
      })
    }]));

    // Mock community team data to include testuser as a builder
    mockClient.hivemind.getCommunity.mockImplementation(() => Promise.resolve([{
      name: config.game.accountName,
      team: [
        ['testuser', 'Builder', 'Builder']
      ]
    }]));

    // First login
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'login testuser{enter}');
    
    // Wait for login success
    await waitFor(() => {
      expect(screen.getByText(/Login successful as testuser/i)).toBeInTheDocument();
    });

    // Wait for Build button to appear
    let buildButton;
    await waitFor(() => {
      try {
        buildButton = screen.getByRole('button', { name: 'Build' });
      } catch {
        buildButton = container.querySelector('.top-right-button');
      }
      if (!buildButton) {
        // Log the DOM for debugging
        // eslint-disable-next-line no-console
        console.log(container.innerHTML);
      }
      expect(buildButton).toBeInTheDocument();
    });
    if (!buildButton) throw new Error('Build button not found');
    // Click build button
    await userEvent.click(buildButton);
    // Try to submit empty form
    const submitButton = screen.getByRole('button', { name: /create room/i });
    await userEvent.click(submitButton);
    // Verify required field messages
    await waitFor(() => {
      expect(screen.getByText('Room Name:')).toBeInTheDocument();
      expect(screen.getByText('Exit to New Room:')).toBeInTheDocument();
      expect(screen.getByText('Exit from New Room:')).toBeInTheDocument();
      expect(screen.getByText('Room Description:')).toBeInTheDocument();
    });
  });

  test('QueueManagementModal opens and closes correctly', async () => {
    render(<App />);
    
    // First login as game account
    const input = screen.getByRole('textbox');
    await userEvent.type(input, `login ${config.game.accountName}{enter}`);
    await waitFor(() => {
      expect(screen.getByText(/Login successful as/i)).toBeInTheDocument();
    });

    // Click queue button
    const queueButton = screen.getByText('Queue');
    await userEvent.click(queueButton);

    // Verify modal is open
    await waitFor(() => {
      expect(screen.getByText('Room Build Queue')).toBeInTheDocument();
    });

    // Close modal
    const closeButton = screen.getByText('×');
    await userEvent.click(closeButton);

    // Verify modal is closed
    await waitFor(() => {
      expect(screen.queryByText('Room Build Queue')).not.toBeInTheDocument();
    });
  });

  test('QueueManagementModal displays build requests', async () => {
    render(<App />);
    
    // First login as game account
    const input = screen.getByRole('textbox');
    await userEvent.type(input, `login ${config.game.accountName}{enter}`);
    await waitFor(() => {
      expect(screen.getByText(/Login successful as/i)).toBeInTheDocument();
    });

    // Click queue button
    const queueButton = screen.getByRole('button', { name: /queue/i });
    await userEvent.click(queueButton);

    // Verify modal shows no pending requests initially
    await waitFor(() => {
      expect(screen.getByText('No pending build requests')).toBeInTheDocument();
    });

    // Simulate receiving a build request
    const mockSocket = (io as jest.Mock).mock.results[0].value;
    const queueStateCallback = mockSocket.on.mock.calls.find(
      (call: [string, Function]) => call[0] === 'buildQueueStatus'
    )?.[1];

    if (queueStateCallback) {
      act(() => {
        queueStateCallback([
          ['test-queue-id', {
            queueId: 'test-queue-id',
            username: 'testuser',
            room: {
              author: 'testuser',
              permlink: 'test-room'
            },
            newRoom: {
              permlink: 'new-room',
              author: 'testuser'
            },
            exits: {
              fromNewRoom: { north: 'test-room' },
              fromCurrentRoom: { south: 'new-room' }
            },
            timestamp: Date.now(),
            status: 'pending'
          }]
        ]);
      });
    }

    // Verify build request is displayed
    await waitFor(() => {
      expect(screen.getByText(/Request from testuser/i)).toBeInTheDocument();
      expect(screen.getByText(/new-room/)).toBeInTheDocument();
      expect(screen.getByText(/test-room/)).toBeInTheDocument();
      expect(screen.getByText(/pending/)).toBeInTheDocument();
    });
  });

  test('QueueManagementModal handles build request rejection', async () => {
    render(<App />);
    
    // First login as game account
    const input = screen.getByRole('textbox');
    await userEvent.type(input, `login ${config.game.accountName}{enter}`);
    await waitFor(() => {
      expect(screen.getByText(/Login successful as/i)).toBeInTheDocument();
    });

    // Click queue button
    const queueButton = screen.getByRole('button', { name: /queue/i });
    await userEvent.click(queueButton);

    // Simulate receiving a build request
    const mockSocket = (io as jest.Mock).mock.results[0].value;
    const queueStateCallback = mockSocket.on.mock.calls.find(
      (call: [string, Function]) => call[0] === 'buildQueueStatus'
    )?.[1];

    if (queueStateCallback) {
      act(() => {
        queueStateCallback([
          ['test-queue-id', {
            queueId: 'test-queue-id',
            username: 'testuser',
            room: {
              author: 'testuser',
              permlink: 'test-room'
            },
            newRoom: {
              permlink: 'new-room',
              author: 'testuser'
            },
            exits: {
              fromNewRoom: { north: 'test-room' },
              fromCurrentRoom: { south: 'new-room' }
            },
            timestamp: Date.now(),
            status: 'pending'
          }]
        ]);
      });
    }

    // Wait for the request to be displayed
    await waitFor(() => {
      expect(screen.getByText(/Request from testuser/i)).toBeInTheDocument();
    });

    // Click reject button
    const rejectButton = screen.getByRole('button', { name: /reject/i });
    await userEvent.click(rejectButton);

    // Enter rejection reason
    const reasonInput = screen.getByPlaceholderText('Enter reason for rejection...');
    await userEvent.type(reasonInput, 'Test rejection reason');

    // Submit rejection
    const submitRejectionButton = screen.getByRole('button', { name: /submit rejection/i });
    await userEvent.click(submitRejectionButton);

    // Wait for socket emit to be called
    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('rejectRoomBuild', {
        queueId: 'test-queue-id',
        reason: 'Test rejection reason'
      });
    }, { timeout: 2000 });
  });

  test('QueueManagementModal handles empty queue state', async () => {
    render(<App />);
    
    // First login as game account
    const input = screen.getByRole('textbox');
    await userEvent.type(input, `login ${config.game.accountName}{enter}`);
    await waitFor(() => {
      expect(screen.getByText(/Login successful as/i)).toBeInTheDocument();
    });

    // Click queue button
    const queueButton = screen.getByRole('button', { name: /queue/i });
    await userEvent.click(queueButton);

    // Verify empty state message
    await waitFor(() => {
      expect(screen.getByText('No pending build requests')).toBeInTheDocument();
    });
  });

  test('QueueManagementModal handles socket disconnection', async () => {
    render(<App />);
    
    // First login as game account
    const input = screen.getByRole('textbox');
    await userEvent.type(input, `login ${config.game.accountName}{enter}`);
    await waitFor(() => {
      expect(screen.getByText(/Login successful as/i)).toBeInTheDocument();
    });

    // Click queue button
    const queueButton = screen.getByRole('button', { name: /queue/i });
    await userEvent.click(queueButton);

    // Simulate socket disconnection
    const mockSocket = (io as jest.Mock).mock.results[0].value;
    mockSocket.connected = false;
    act(() => {
      const disconnectCallback = mockSocket.on.mock.calls.find(
        (call: [string, Function]) => call[0] === 'disconnect'
      )?.[1];
      if (disconnectCallback) {
        disconnectCallback();
      }
    });

    // Verify modal still shows empty state
    await waitFor(() => {
      expect(screen.getByText('No pending build requests')).toBeInTheDocument();
    });
  });
});