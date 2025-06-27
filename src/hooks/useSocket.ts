import { useEffect, useCallback, useRef, useState } from 'react';
import { GameState } from '../game/state/GameState';
import { SocketManager } from '../game/network/SocketManager';

interface PlayerEvent {
  username: string;
  players: string[];
  channelId: string;
}

export function useSocket(gameState: GameState | null) {
  const lastProcessedChannelState = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');

  // Always point to the latest gameState
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Use the SocketManager from GameState
  const socketManager = gameState ? gameState.getSocketManager() : null;

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
              // Only display room if not currently processing movement or logging in
              // Movement and login updates are handled by the blockchain listener
              if (!gameState.getIsProcessingMovement() && !gameState.getIsLoggingIn()) {
                gameState.displayRoom();
              }
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
          // Only display room if not currently processing movement or logging in
          if (!gameState.getIsProcessingMovement() && !gameState.getIsLoggingIn()) {
            gameState.displayRoom();
          }
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
          // Only display room if not currently processing movement or logging in
          if (!gameState.getIsProcessingMovement() && !gameState.getIsLoggingIn()) {
            gameState.displayRoom();
          }
        }
      }
    };

    const handleChat = (data: { username: string; message: string; channelId: string }) => {
      console.log('[useSocket Debug] handleChat called with:', data);
      const currentUser = gameStateRef.current?.getPlayer()?.username;
      if (gameStateRef.current && data.username !== currentUser) {
        gameStateRef.current.addOutputMessage(`${data.username} says: "${data.message}"`, false);
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
      socketManager.off('connectionStatusChanged', handleConnectionStatusChanged);
      socketManager.off('chatChannelState', handleChatChannelState);
      socketManager.off('chatChannelUpdate', handleChatChannelUpdate);
      socketManager.off('playerJoined', handlePlayerJoined);
      socketManager.off('playerLeft', handlePlayerLeft);
      socketManager.off('chat', handleChat);
      socketManager.off('emote', handleEmote);
    };
  }, [gameState, socketManager]);

  const connect = useCallback((username: string, location: { author: string; permlink: string }) => {
    if (!gameState) return;
    gameState.getSocketManager().connect(username, location);
  }, [gameState]);

  const disconnect = useCallback(() => {
    if (!gameState) return;
    gameState.getSocketManager().disconnect();
  }, [gameState]);

  const joinChatChannel = useCallback((channelId: string) => {
    if (!gameState) return;
    gameState.getSocketManager().joinChatChannel(channelId);
  }, [gameState]);

  const leaveChatChannel = useCallback((channelId: string, username: string) => {
    if (!gameState) return;
    gameState.getSocketManager().leaveChatChannel(channelId, username);
  }, [gameState]);

  const sendMessage = useCallback((message: string) => {
    if (!gameState?.getPlayer()) return;
    gameState.getSocketManager().sendChat(message, gameState.getPlayer()!.username);
  }, [gameState]);

  const sendEmote = useCallback((emote: string) => {
    if (!gameState?.getPlayer()) return;
    gameState.getSocketManager().sendEmote(emote, gameState.getPlayer()!.username);
  }, [gameState]);

  const getCurrentChannelId = useCallback(() => {
    return gameState ? gameState.getSocketManager().getCurrentChannelId() : null;
  }, [gameState]);

  const resetChannelStateTracking = useCallback(() => {
    lastProcessedChannelState.current = null;
    if (gameState && !gameState.getIsProcessingMovement() && !gameState.getIsLoggingIn()) {
      gameState.resetRoomDisplayTracking();
    }
  }, [gameState]);

  const isConnected = useCallback(() => {
    return gameState ? gameState.getSocketManager().isConnected() : false;
  }, [gameState]);

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