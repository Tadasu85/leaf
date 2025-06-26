import { useEffect, useCallback, useRef, useState } from 'react';
import { GameState } from '../game/state/GameState';
import { SocketManager } from '../game/network/SocketManager';

interface PlayerEvent {
  username: string;
  players: string[];
  channelId: string;
}

export function useSocket(gameState: GameState | null) {
  const socketManagerRef = useRef<SocketManager | null>(null);
  const lastProcessedChannelState = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');

  // Debug effect that runs on every render
  // useEffect(() => {
  //   console.log('[useSocket Debug] Render effect - gameState:', gameState);
  //   console.log('[useSocket Debug] Render effect - socketManagerRef.current:', socketManagerRef.current);
  // });

  // Create SocketManager only once when gameState becomes available
  useEffect(() => {
    if (gameState) {
      if (!socketManagerRef.current) {
        socketManagerRef.current = new SocketManager(gameState);
      }
      
      // Always set the socket manager in the game state so it can send messages
      gameState.setSocketManager(socketManagerRef.current);
    } else if (socketManagerRef.current) {
      // Clean up when gameState becomes null
      socketManagerRef.current.disconnect();
      socketManagerRef.current = null;
    }
  }, [gameState]);

  const socketManager = socketManagerRef.current;

  useEffect(() => {
    if (!gameState || !socketManager) return;

    const handleConnectionStatusChanged = (data: { status: string; error?: string }) => {
      setConnectionStatus(data.status as any);
    };

    const handleChatChannelState = async (data: any) => {
      if (data && data.channelId) {
        const stateKey = `${data.channelId}-${JSON.stringify(data.players || [])}`;
        
        // Only process if this is a new channel state or player list has changed
        if (lastProcessedChannelState.current !== stateKey) {
          lastProcessedChannelState.current = stateKey;
          
          // Update player list in current room if it matches the channel
          const currentRoom = gameState.getCurrentRoom();
          if (currentRoom) {
            const currentChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
            if (currentChannelId === data.channelId && data.players) {
              // Update the room's player list with online players
              currentRoom.players = data.players;
              // Display the room with updated player list
              gameState.displayRoom();
            }
          }
        }
      }
    };

    // Use the same handler for both chatChannelState and chatChannelUpdate to prevent duplicates
    const handleChatChannelUpdate = handleChatChannelState;

    const handlePlayerJoined = (data: PlayerEvent) => {
      // Handle player joined event - update player list in current room
      const currentRoom = gameState.getCurrentRoom();
      if (currentRoom) {
        const currentChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
        if (currentChannelId === data.channelId && data.players) {
          currentRoom.players = data.players;
          gameState.displayRoom();
        }
      }
    };

    const handlePlayerLeft = (data: PlayerEvent) => {
      // Handle player left event - update player list in current room
      const currentRoom = gameState.getCurrentRoom();
      if (currentRoom) {
        const currentChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
        if (currentChannelId === data.channelId && data.players) {
          currentRoom.players = data.players;
          gameState.displayRoom();
        }
      }
    };

    const handleChat = (data: { username: string; message: string; channelId: string }) => {
      // Display chat message from other players
      if (gameState && data.username !== gameState.getPlayer()?.username) {
        gameState.addOutputMessage(`${data.username} says: "${data.message}"`, false);
      }
    };

    const handleEmote = (data: { username: string; emote: string; channelId: string }) => {
      // Display emote from other players
      if (gameState && data.username !== gameState.getPlayer()?.username) {
        gameState.addOutputMessage(`${data.username} ${data.emote}`, false);
      }
    };

    socketManager.on('connectionStatusChanged', handleConnectionStatusChanged);
    socketManager.on('chatChannelState', handleChatChannelState);
    socketManager.on('chatChannelUpdate', handleChatChannelUpdate);
    socketManager.on('playerJoined', handlePlayerJoined);
    socketManager.on('playerLeft', handlePlayerLeft);
    socketManager.on('chat', handleChat);
    socketManager.on('emote', handleEmote);

    return () => {
      if (socketManager) {
        socketManager.off('connectionStatusChanged', handleConnectionStatusChanged);
        socketManager.off('chatChannelState', handleChatChannelState);
        socketManager.off('chatChannelUpdate', handleChatChannelUpdate);
        socketManager.off('playerJoined', handlePlayerJoined);
        socketManager.off('playerLeft', handlePlayerLeft);
        socketManager.off('chat', handleChat);
        socketManager.off('emote', handleEmote);
      }
    };
  }, [gameState, socketManager]);

  const connect = useCallback((username: string, location: { author: string; permlink: string }) => {
    if (!socketManagerRef.current) return;
    socketManagerRef.current.connect(username, location);
  }, []);

  const disconnect = useCallback(() => {
    if (!socketManagerRef.current) return;
    socketManagerRef.current.disconnect();
  }, []);

  const joinChatChannel = useCallback((channelId: string) => {
    if (!socketManagerRef.current) return;
    socketManagerRef.current.joinChatChannel(channelId);
  }, []);

  const leaveChatChannel = useCallback((channelId: string, username: string) => {
    if (!socketManagerRef.current) return;
    socketManagerRef.current.leaveChatChannel(channelId, username);
  }, []);

  const sendMessage = useCallback((message: string) => {
    if (!socketManagerRef.current || !gameState?.getPlayer()) return;
    socketManagerRef.current.sendChat(message, gameState.getPlayer()!.username);
  }, [gameState]);

  const sendEmote = useCallback((emote: string) => {
    if (!socketManagerRef.current || !gameState?.getPlayer()) return;
    socketManagerRef.current.sendEmote(emote, gameState.getPlayer()!.username);
  }, [gameState]);

  const getCurrentChannelId = useCallback(() => {
    return socketManagerRef.current?.getCurrentChannelId() || null;
  }, []);

  const resetChannelStateTracking = useCallback(() => {
    lastProcessedChannelState.current = null;
    // Also reset the game state's room display tracking
    if (gameState) {
      gameState.resetRoomDisplayTracking();
    }
  }, [gameState]);

  const isConnected = useCallback(() => {
    return socketManagerRef.current?.isConnected() || false;
  }, []);

  return {
    connect,
    disconnect,
    joinChatChannel,
    leaveChatChannel,
    sendMessage,
    sendEmote,
    getCurrentChannelId,
    resetChannelStateTracking,
    connectionStatus,
    isConnected
  };
} 