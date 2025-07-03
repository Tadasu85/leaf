import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../../hooks/useSocket';

// Mock GameState
jest.mock('../../game/state/GameState');

describe('useSocket Hook', () => {
  let mockGameState: any;
  let mockSocketManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSocketManager = {
      on: jest.fn(),
      off: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      joinChatChannel: jest.fn(),
      leaveChatChannel: jest.fn(),
      sendChat: jest.fn(),
      sendEmote: jest.fn(),
      getCurrentChannelId: jest.fn(),
      isConnected: jest.fn(),
    };

    mockGameState = {
      getSocketManager: jest.fn(() => mockSocketManager),
      getCurrentRoom: jest.fn(),
      getPlayer: jest.fn(),
      updateRoomPlayers: jest.fn(),
      notifyPlayerJoined: jest.fn(),
      notifyPlayerLeft: jest.fn(),
      addOutputMessage: jest.fn(),
      getIsProcessingMovement: jest.fn(),
      getIsLoggingIn: jest.fn(),
      resetRoomDisplayTracking: jest.fn(),
    };
  });

  it('initializes with disconnected status', () => {
    const { result } = renderHook(() => useSocket(null));
    
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('sets up event listeners when gameState is provided', () => {
    renderHook(() => useSocket(mockGameState));
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.on).toHaveBeenCalled();
  });

  it('does not set up event listeners when gameState is null', () => {
    renderHook(() => useSocket(null));
    
    expect(mockGameState.getSocketManager).not.toHaveBeenCalled();
    expect(mockSocketManager.on).not.toHaveBeenCalled();
  });

  it('cleans up event listeners on unmount', () => {
    const { unmount } = renderHook(() => useSocket(mockGameState));
    
    expect(mockSocketManager.on).toHaveBeenCalled();
    
    unmount();
    
    expect(mockSocketManager.off).toHaveBeenCalled();
  });

  it('handles connection status changes', () => {
    const { result } = renderHook(() => useSocket(mockGameState));
    
    // Simulate connection status change
    const connectionStatusHandler = mockSocketManager.on.mock.calls.find(
      (call: any) => call[0] === 'connectionStatusChanged'
    )?.[1];
    
    if (connectionStatusHandler) {
      act(() => {
        connectionStatusHandler({ status: 'connected' });
      });
      
      expect(result.current.connectionStatus).toBe('connected');
    }
  });

  it('connects to socket when connect is called', () => {
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.connect('testuser', { author: 'testauthor', permlink: 'testroom' });
    });
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.connect).toHaveBeenCalledWith('testuser', {
      author: 'testauthor',
      permlink: 'testroom',
    });
  });

  it('disconnects from socket when disconnect is called', () => {
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.disconnect();
    });
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.disconnect).toHaveBeenCalled();
  });

  it('joins chat channel when joinChatChannel is called', () => {
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.joinChatChannel('testauthor/testroom');
    });
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.joinChatChannel).toHaveBeenCalledWith('testauthor/testroom');
  });

  it('leaves chat channel when leaveChatChannel is called', () => {
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.leaveChatChannel('testauthor/testroom', 'testuser');
    });
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.leaveChatChannel).toHaveBeenCalledWith('testauthor/testroom', 'testuser');
  });

  it('sends chat message when sendMessage is called', () => {
    const mockPlayer = { username: 'testuser' };
    mockGameState.getPlayer.mockReturnValue(mockPlayer);
    
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.sendMessage('Hello everyone!');
    });
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.sendChat).toHaveBeenCalledWith('Hello everyone!', 'testuser');
  });

  it('sends emote when sendEmote is called', () => {
    const mockPlayer = { username: 'testuser' };
    mockGameState.getPlayer.mockReturnValue(mockPlayer);
    
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.sendEmote('waves hello');
    });
    
    expect(mockGameState.getSocketManager).toHaveBeenCalled();
    expect(mockSocketManager.sendEmote).toHaveBeenCalledWith('waves hello', 'testuser');
  });

  it('returns current channel ID', () => {
    mockSocketManager.getCurrentChannelId.mockReturnValue('testauthor/testroom');
    
    const { result } = renderHook(() => useSocket(mockGameState));
    
    expect(result.current.getCurrentChannelId()).toBe('testauthor/testroom');
  });

  it('returns connection status', () => {
    mockSocketManager.isConnected.mockReturnValue(true);
    
    const { result } = renderHook(() => useSocket(mockGameState));
    
    expect(result.current.isConnected()).toBe(true);
  });

  it('resets channel state tracking', () => {
    mockGameState.getIsProcessingMovement.mockReturnValue(false);
    mockGameState.getIsLoggingIn.mockReturnValue(false);
    
    const { result } = renderHook(() => useSocket(mockGameState));
    
    act(() => {
      result.current.resetChannelStateTracking();
    });
    
    expect(mockGameState.resetRoomDisplayTracking).toHaveBeenCalled();
  });

  it('handles chat messages from other players', () => {
    const mockPlayer = { username: 'currentplayer' };
    mockGameState.getPlayer.mockReturnValue(mockPlayer);
    
    renderHook(() => useSocket(mockGameState));
    
    const chatHandler = mockSocketManager.on.mock.calls.find(
      (call: any) => call[0] === 'chat'
    )?.[1];
    
    if (chatHandler) {
      act(() => {
        chatHandler({
          username: 'otherplayer',
          message: 'Hello everyone!',
          channelId: 'testauthor/testroom',
        });
      });
      
      expect(mockGameState.addOutputMessage).toHaveBeenCalledWith(
        'otherplayer says: "Hello everyone!"',
        false
      );
    }
  });

  it('does not display chat messages from current player', () => {
    const mockPlayer = { username: 'currentplayer' };
    mockGameState.getPlayer.mockReturnValue(mockPlayer);
    
    renderHook(() => useSocket(mockGameState));
    
    const chatHandler = mockSocketManager.on.mock.calls.find(
      (call: any) => call[0] === 'chat'
    )?.[1];
    
    if (chatHandler) {
      act(() => {
        chatHandler({
          username: 'currentplayer',
          message: 'My own message',
          channelId: 'testauthor/testroom',
        });
      });
      
      expect(mockGameState.addOutputMessage).not.toHaveBeenCalled();
    }
  });

  it('handles player joined events', () => {
    const mockRoom = {
      author: 'testauthor',
      permlink: 'testroom',
    };
    
    mockGameState.getCurrentRoom.mockReturnValue(mockRoom);
    
    renderHook(() => useSocket(mockGameState));
    
    const playerJoinedHandler = mockSocketManager.on.mock.calls.find(
      (call: any) => call[0] === 'playerJoined'
    )?.[1];
    
    if (playerJoinedHandler) {
      act(() => {
        playerJoinedHandler({
          username: 'newplayer',
          channelId: 'testauthor/testroom',
          players: ['player1', 'newplayer'],
        });
      });
      
      expect(mockGameState.updateRoomPlayers).toHaveBeenCalledWith(['player1', 'newplayer']);
      expect(mockGameState.notifyPlayerJoined).toHaveBeenCalledWith('newplayer');
    }
  });

  it('handles player left events', () => {
    const mockRoom = {
      author: 'testauthor',
      permlink: 'testroom',
    };
    
    mockGameState.getCurrentRoom.mockReturnValue(mockRoom);
    
    renderHook(() => useSocket(mockGameState));
    
    const playerLeftHandler = mockSocketManager.on.mock.calls.find(
      (call: any) => call[0] === 'playerLeft'
    )?.[1];
    
    if (playerLeftHandler) {
      act(() => {
        playerLeftHandler({
          username: 'leavingplayer',
          channelId: 'testauthor/testroom',
          players: ['player1'],
        });
      });
      
      expect(mockGameState.updateRoomPlayers).toHaveBeenCalledWith(['player1']);
      expect(mockGameState.notifyPlayerLeft).toHaveBeenCalledWith('leavingplayer');
    }
  });
}); 