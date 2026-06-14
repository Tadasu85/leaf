import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock all the complex hooks and dependencies to prevent infinite loops
jest.mock('../hooks/useClients', () => ({
  useClients: () => ({
    client: {
      database: {
        getAccounts: jest.fn().mockResolvedValue([]),
        getDynamicGlobalProperties: jest.fn(),
        call: jest.fn().mockResolvedValue({}),
      },
    },
    keychain: {
      requestSignBuffer: jest.fn(),
      requestTransfer: jest.fn(),
      login: jest.fn().mockResolvedValue({ success: true }),
    },
  })
}));

jest.mock('../hooks/useSocket', () => ({
  useSocket: () => ({
    connect: jest.fn(),
    joinChatChannel: jest.fn(),
    leaveChatChannel: jest.fn(),
    getCurrentChannelId: jest.fn(),
    resetChannelStateTracking: jest.fn(),
    connectionStatus: 'disconnected',
    isConnected: jest.fn(() => false),
  })
}));

jest.mock('../hooks/useModalState', () => ({
  useModalState: () => ({
    isBuildModalOpen: false,
    isQueueModalOpen: false,
    toggleBuildModal: jest.fn(),
    toggleQueueModal: jest.fn(),
  })
}));

jest.mock('../hooks/useGameOutput', () => ({
  useGameOutput: () => ({
    messages: [],
    addErrorMessage: jest.fn(),
    addSuccessMessage: jest.fn(),
    addInfoMessage: jest.fn(),
  })
}));

jest.mock('../contexts/GameContext', () => ({
  GameProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="game-provider">{children}</div>,
  useGameContext: () => ({
    gameState: {
      initialize: jest.fn().mockResolvedValue(undefined),
      login: jest.fn().mockResolvedValue(undefined),
      move: jest.fn(),
      say: jest.fn(),
      emote: jest.fn(),
      look: jest.fn(),
      help: jest.fn(),
      setDescription: jest.fn(),
      setShortDescription: jest.fn(),
      lookAtSelf: jest.fn(),
      lookAtPlayer: jest.fn(),
      setBuilderStatus: jest.fn(),
      getCurrentRoom: jest.fn().mockReturnValue(null),
      getHiveClient: jest.fn().mockReturnValue({
        getGameMap: jest.fn().mockReturnValue({}),
        stopMoveListener: jest.fn(),
      }),
      getSocketManager: jest.fn().mockReturnValue({
        disconnect: jest.fn(),
      }),
      on: jest.fn(),
      off: jest.fn(),
    },
    isLoading: false,
    error: null,
    player: null,
    currentRoom: null,
    isLoginComplete: false,
    roomData: {
      body: '',
      title: '',
      players: [],
      details: {},
      exits: {},
      author: '',
      permlink: '',
    },
    gameJSON: {},
    isLoadedGame: false,
    userProfileJSON: {},
    isBuilder: false,
    isAdmin: false,
    initializeGame: jest.fn().mockResolvedValue(undefined),
    login: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn(),
    updateRoomData: jest.fn(),
    updateGameJSON: jest.fn(),
    hasRoomDataChanged: jest.fn().mockReturnValue(false),
    updateUserProfile: jest.fn().mockResolvedValue(undefined),
    clearError: jest.fn(),
    handleCommand: jest.fn().mockResolvedValue(undefined),
    buildApprovalQueue: jest.fn().mockResolvedValue([]),
  })
}));

// Mock all the complex dependencies
jest.mock('@hiveio/dhive', () => ({
  Client: jest.fn().mockImplementation(() => ({
    database: {
      getAccounts: jest.fn().mockResolvedValue([]),
      getDynamicGlobalProperties: jest.fn(),
      call: jest.fn().mockResolvedValue({}),
    },
  })),
}));

jest.mock('keychain-sdk', () => ({
  KeychainSDK: jest.fn().mockImplementation(() => ({
    requestSignBuffer: jest.fn(),
    requestTransfer: jest.fn(),
  })),
  KeychainKeyTypes: {
    POSTING: 'posting',
    ACTIVE: 'active',
    MEMO: 'memo',
  },
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

// Mock all the game-related modules
jest.mock('../game/state/GameState');
jest.mock('../game/blockchain/HiveClient');
jest.mock('../game/blockchain/BulkDataLoader');
jest.mock('../game/commands/CommandParser');
jest.mock('../game/network/SocketManager');

// Create a test wrapper with providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock process for browser environment
Object.defineProperty(window, 'process', {
  value: {
    env: {
      NODE_ENV: 'test'
    }
  },
  writable: true,
});

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    // Import App dynamically to avoid issues with the complex component
    const App = require('../App').default;
    
    render(
      <TestWrapper>
        <App />
      </TestWrapper>
    );
    
    // Check that the component renders without throwing by looking for actual elements
    expect(screen.getByTestId('game-output')).toBeInTheDocument();
    expect(screen.getByTestId('command-input')).toBeInTheDocument();
  });

  it('shows basic app structure', () => {
    const App = require('../App').default;
    
    render(
      <TestWrapper>
        <App />
      </TestWrapper>
    );
    
    // Check for basic app elements that actually exist
    expect(screen.getByTestId('game-output')).toBeInTheDocument();
    expect(screen.getByTestId('command-input')).toBeInTheDocument();
    expect(screen.getByAltText('Ego Death Banner')).toBeInTheDocument();
  });
}); 