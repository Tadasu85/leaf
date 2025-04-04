import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { KeychainSDK } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import { debounce } from 'lodash';

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

interface MockKeychain {
  isKeychainInstalled: jest.Mock;
  login: jest.Mock;
  broadcast: jest.Mock;
}

interface MockClient {
  database: {
    getAccounts: jest.Mock;
    getAccountHistory: jest.Mock;
    call: jest.Mock;
  };
  blockchain: {
    getOperationsStream: jest.Mock;
  };
  stream: {
    call: jest.Mock;
  };
}

describe('App Component', () => {
  let mockKeychain: MockKeychain;
  let mockClient: MockClient;

  const mockGameData = {
    "egodeathgamedata": {
      "rooms_authors_exits": {
        "genesis-scaffold-precipice": {
          "exits": {
            "north": "north-room",
            "south": "south-room"
          },
          "author": "raymonjohnstone"
        },
        "north-room": {
          "exits": {
            "south": "genesis-scaffold-precipice"
          },
          "author": "raymonjohnstone"
        }
      }
    }
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Setup KeychainSDK mock
    mockKeychain = {
      isKeychainInstalled: jest.fn().mockResolvedValue(true),
      login: jest.fn().mockResolvedValue(true),
      broadcast: jest.fn().mockResolvedValue({ result: { success: true, result: { id: '123' } } })
    };
    (KeychainSDK as jest.MockedClass<typeof KeychainSDK>).mockImplementation(() => mockKeychain as any);

    // Setup dhive Client mock
    mockClient = {
      database: {
        getAccounts: jest.fn().mockImplementation((accounts) => {
          if (accounts[0] === 'hive-109456') {
            return Promise.resolve([{ posting_json_metadata: JSON.stringify(mockGameData) }]);
          }
          return Promise.resolve([{ 
            posting_json_metadata: JSON.stringify({
              egodeathplayer: {
                Name: 'testuser',
                Description: 'A test user',
                ShortDesc: 'Testing'
              }
            })
          }]);
        }),
        getAccountHistory: jest.fn().mockResolvedValue([]),
        call: jest.fn().mockImplementation((method: string, params: string[]) => {
          if (method === 'get_content') {
            return Promise.resolve({
              title: 'Test Room',
              body: 'This is a test room.',
              json_metadata: JSON.stringify({
                rooms_authors_exits: {
                  exits: ['north', 'south']
                }
              })
            });
          }
          return Promise.resolve([]);
        })
      },
      blockchain: {
        getOperationsStream: jest.fn(() => ({
          on: jest.fn(),
          destroy: jest.fn()
        }))
      },
      stream: {
        call: jest.fn()
      }
    };
    (Client as unknown as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient as any);

    (window as any).hive_keychain = mockKeychain;
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
        return Promise.resolve({
          title: 'Test Room',
          body: 'This is a test room.',
          json_metadata: JSON.stringify({
            exits: { north: 'north-room', south: 'south-room' }
          })
        });
      }
      return Promise.resolve([]);
    });

    // Mock the keychain.broadcast response
    mockKeychain.broadcast.mockImplementation(() => {
      return Promise.resolve({
        success: true,
        result: {
          id: '123'
        }
      });
    });
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

      expect(mockKeychain.login).toHaveBeenCalledWith(expect.objectContaining({ username: 'testuser' }));
      
      await waitFor(() => {
        expect(mockClient.database.getAccounts).toHaveBeenCalledWith(['testuser']);
        expect(mockClient.database.getAccountHistory).toHaveBeenCalledWith('testuser', -1, 100);
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
      mockKeychain.login.mockResolvedValueOnce(false);

      await act(async () => {
        render(<App />);
      });

      const inputElement = screen.getByTestId('command-input');
      
      await act(async () => {
        fireEvent.change(inputElement, { target: { value: 'login testuser' } });
        fireEvent.keyDown(inputElement, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Login failed, keychain returned false/i)).toBeInTheDocument();
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
        }
      };

      // Mock both get_content and get_accounts responses
      mockClient.database.call.mockImplementation((method: string, params: any[]) => {
        if (method === 'get_content' && params[1] === 'genesis-scaffold-precipice') {
          return Promise.resolve({
            title: 'Test Room',
            body: 'This is a test room.',
            json_metadata: JSON.stringify({
              exits: { north: 'north-room', south: 'south-room' }
            })
          });
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

    test('look command displays room data', async () => {
      render(<App />);
      await loginUser();

      const input = screen.getByTestId('command-input');
      fireEvent.change(input, { target: { value: 'look' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Wait for the room data to be loaded and displayed
      await waitFor(() => {
        expect(screen.getByText(/Test Room/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Then check for the other elements
      expect(screen.getByText(/This is a test room/i)).toBeInTheDocument();
      expect(screen.getByText(/There is a way to leave/i)).toBeInTheDocument();
      expect(screen.getByText(/north/i)).toBeInTheDocument();
      expect(screen.getByText(/south/i)).toBeInTheDocument();
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
        expect(mockKeychain.broadcast).toHaveBeenCalledWith(
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
        expect(mockKeychain.broadcast).toHaveBeenCalledWith(
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
        expect(mockKeychain.broadcast).toHaveBeenCalledWith(
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

  describe('Stream Operations', () => {
    beforeEach(() => {
      // Mock the gameJSON state
      (window as any).gameJSON = {
        'genesis-scaffold-precipice': {
          author: 'raymonjohnstone',
          exits: { north: 'north-room' }
        },
        'north-room': {
          author: 'raymonjohnstone',
          exits: { south: 'genesis-scaffold-precipice' }
        }
      };

      // Mock the room data responses
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
              title: 'Test Room',
              body: 'This is a test room.',
              json_metadata: JSON.stringify({
                exits: { north: 'north-room' }
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

    test('handles new location updates from stream', async () => {
      render(<App />);
      await loginUser();

      // Set up the stream callback
      const streamCallback = mockClient.stream.call.mock.calls[0][1];
      expect(streamCallback).toBeDefined();

      // Create a location update
      const locationUpdate = {
        op: ['custom_json', {
          id: 'ego-death',
          required_posting_auths: ['testuser'],
          json: JSON.stringify({
            move_to: {
              Location: {
                permlink: 'north-room',
                author: 'raymonjohnstone'
              }
            }
          })
        }]
      };

      // Simulate receiving the location update
      await act(async () => {
        streamCallback([locationUpdate]);
      });

      // Wait for the room data to be fetched and displayed
      await waitFor(() => {
        expect(mockClient.database.call).toHaveBeenCalledWith(
          'get_content',
          ['raymonjohnstone', 'north-room']
        );
      });

      // Verify the new room data is displayed
      await waitFor(() => {
        expect(screen.getByText(/North Room/i)).toBeInTheDocument();
        expect(screen.getByText(/This is the north room/i)).toBeInTheDocument();
      });
    });
  });
});