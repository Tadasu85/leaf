import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { GameState } from '../game/state/GameState';
import logger from '../utils/Logger';

interface PlayerEvent {
  username: string;
  players: string[];
  channelId: string;
}

export function useSocket(gameState: GameState | null) {
  const lastProcessedChannelState = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');

  // Store cleanup function ref to ensure proper cleanup
  const cleanupRef = useRef<(() => void) | null>(null);

  // Track if we've already set up listeners for this gameState
  const setupRef = useRef<boolean>(false);
  const gameStateRef = useRef<GameState | null>(null);

  // Always point to the latest gameState
  gameStateRef.current = gameState;
  
  useEffect(() => {
    logger.debug('[useSocket] Setting up event listeners for gameState:', !!gameState);
    if (!gameState) return;

    // Only set up listeners once per gameState instance
    if (setupRef.current && gameStateRef.current === gameState) {
      logger.debug('[useSocket] Listeners already set up for this gameState, skipping');
      return;
    }
    
    // Reset setup flag if gameState has changed
    if (gameStateRef.current !== gameState) {
      setupRef.current = false;
      gameStateRef.current = gameState;
    }
    
    setupRef.current = true;

    // Clean up any existing listeners first
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const handleConnectionStatusChanged = (data: { status: string; error?: string }) => {
      setConnectionStatus(data.status as any);
    };

    const handleChatChannelState = async (data: any) => {
      logger.debug('[useSocket] handleChatChannelState received:', data);
      if (data && data.channelId) {
        const stateKey = `${data.channelId}-${JSON.stringify(data.players || [])}`;
        
        // Only process if this is a new channel state or player list has changed
        if (lastProcessedChannelState.current !== stateKey) {
          lastProcessedChannelState.current = stateKey;
          logger.debug('[useSocket] Processing new chatChannelState:', data);
          
          // Update player list in current room if it matches the channel
          const currentRoom = gameStateRef.current?.getCurrentRoom();
          if (currentRoom) {
            const currentChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
            logger.debug('[useSocket] Comparing channel IDs:', { currentChannelId, receivedChannelId: data.channelId });
            if (currentChannelId === data.channelId && data.players) {
              logger.debug('[useSocket] Updating room players:', data.players);
              // Update the room's player list with online players
              gameStateRef.current?.updateRoomPlayers(data.players);
              // DO NOT display room - this should only come from blockchain movement
              // The signaling server is only for chat and player presence
            }
          }
        } else {
          logger.debug('[useSocket] Ignoring duplicate chatChannelState');
        }
      }
    };

    // Use the same handler for both chatChannelState and chatChannelUpdate to prevent duplicates
    const handleChatChannelUpdate = handleChatChannelState;

    const handlePlayerJoined = (data: PlayerEvent) => {
      logger.debug('[useSocket] handlePlayerJoined received:', data);
      // Handle player joined event - update player list in current room
      const currentRoom = gameStateRef.current?.getCurrentRoom();
      if (currentRoom) {
        const currentChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
        logger.debug('[useSocket] Comparing channel IDs for playerJoined:', { currentChannelId, receivedChannelId: data.channelId });
        if (currentChannelId === data.channelId && data.players) {
          logger.debug('[useSocket] Processing playerJoined:', data);
          // Update the room's player list with online players
          gameStateRef.current?.updateRoomPlayers(data.players);
          
          // Display join notification
          gameStateRef.current?.notifyPlayerJoined(data.username);
          
          // DO NOT display room - this should only come from blockchain movement
          // The signaling server is only for chat and player presence
        }
      }
    };

    const handlePlayerLeft = (data: PlayerEvent) => {
      // Handle player left event - update player list in current room
      const currentRoom = gameStateRef.current?.getCurrentRoom();
      if (currentRoom) {
        const currentChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
        if (currentChannelId === data.channelId && data.players) {
          // Update the room's player list with online players
          gameStateRef.current?.updateRoomPlayers(data.players);
          
          // Display leave notification
          gameStateRef.current?.notifyPlayerLeft(data.username);
          
          // DO NOT display room - this should only come from blockchain movement
          // The signaling server is only for chat and player presence
        }
      }
    };

    const handleChat = (data: { username: string; message: string; channelId: string }) => {
      logger.debug('[useSocket Debug] handleChat called with:', data);
      const currentUser = gameStateRef.current?.getPlayer()?.username;
      if (gameStateRef.current && data.username !== currentUser) {
        gameStateRef.current.addOutputMessage(`${data.username} says: "${data.message}"`, false);
      }
    };

    const handleChatMessage = (data: { username: string; message: string; channelId: string }) => {
      // Handle new chat message format
      const currentUser = gameStateRef.current?.getPlayer()?.username;
      if (gameStateRef.current && data.username !== currentUser) {
        gameStateRef.current.addOutputMessage(`${data.username} says: "${data.message}"`, false);
      }
    };

    const handleEmote = (data: { username: string; emote: string; channelId: string }) => {
      // Display emote from other players
      const currentUser = gameStateRef.current?.getPlayer()?.username;
      if (gameStateRef.current && data.username !== currentUser) {
        gameStateRef.current.addOutputMessage(`${data.username} ${data.emote}`, false);
      }
    };

    const handleRoomUpdate = (data: any) => {
      // Handle room update from RoomService
      const currentRoom = gameStateRef.current?.getCurrentRoom();
      if (currentRoom && data.room === `${currentRoom.author}/${currentRoom.permlink}` && data.players) {
        // Update the room's player list with online players
        gameStateRef.current?.updateRoomPlayers(data.players);
      }
    };

    const handleRoomState = (data: any) => {
      // Handle room state response from RoomService
      const currentRoom = gameStateRef.current?.getCurrentRoom();
      if (currentRoom && data.room === `${currentRoom.author}/${currentRoom.permlink}` && data.players) {
        // Update the room's player list with online players
        gameStateRef.current?.updateRoomPlayers(data.players);
      }
    };

    const handleRoomPlayerLeft = (data: any) => {
      // Handle player left event from RoomService
      const currentRoom = gameStateRef.current?.getCurrentRoom();
      if (currentRoom && data.room === `${currentRoom.author}/${currentRoom.permlink}` && data.players) {
        // Update the room's player list with online players
        gameStateRef.current?.updateRoomPlayers(data.players);
        
        // Display leave notification
        gameStateRef.current?.notifyPlayerLeft(data.username);
      }
    };

    const handleKeepalive = () => {
      logger.debug('[useSocket] Received keepalive event');
      // The SocketManager will automatically respond to keepalive
      // This handler is for any additional client-side logic if needed
    };

    const socketManager = gameState.getSocketManager();
    
    logger.debug('[useSocket] Registering event listeners with socket manager');
    socketManager.on('connectionStatusChanged', handleConnectionStatusChanged);
    socketManager.on('chatChannelState', handleChatChannelState);
    socketManager.on('chatChannelUpdate', handleChatChannelUpdate);
    socketManager.on('playerJoined', handlePlayerJoined);
    socketManager.on('playerLeft', handlePlayerLeft);
    socketManager.on('chat', handleChat);
    socketManager.on('chatMessage', handleChatMessage);
    socketManager.on('emote', handleEmote);
    socketManager.on('roomUpdate', handleRoomUpdate);
    socketManager.on('roomState', handleRoomState);
    socketManager.on('roomPlayerLeft', handleRoomPlayerLeft);
    socketManager.on('keepalive', handleKeepalive);
    logger.debug('[useSocket] Event listeners registered');

    // Store cleanup function
    const cleanup = () => {
      logger.debug('[useSocket] Cleaning up event listeners');
      socketManager.off('connectionStatusChanged', handleConnectionStatusChanged);
      socketManager.off('chatChannelState', handleChatChannelState);
      socketManager.off('chatChannelUpdate', handleChatChannelUpdate);
      socketManager.off('playerJoined', handlePlayerJoined);
      socketManager.off('playerLeft', handlePlayerLeft);
      socketManager.off('chat', handleChat);
      socketManager.off('chatMessage', handleChatMessage);
      socketManager.off('emote', handleEmote);
      socketManager.off('roomUpdate', handleRoomUpdate);
      socketManager.off('roomState', handleRoomState);
      socketManager.off('roomPlayerLeft', handleRoomPlayerLeft);
      socketManager.off('keepalive', handleKeepalive);
    };

    cleanupRef.current = cleanup;

    return cleanup;
  }, [gameState]); // Add gameState as dependency to properly track changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const connect = useCallback((username: string, location: { author: string; permlink: string }) => {
    if (!gameStateRef.current) return;
    gameStateRef.current.getSocketManager().connect(username, location);
  }, []);

  const disconnect = useCallback(() => {
    if (!gameStateRef.current) return;
    gameStateRef.current.getSocketManager().disconnect();
  }, []);

  const joinChatChannel = useCallback((channelId: string) => {
    logger.debug('[useSocket] joinChatChannel called with:', channelId);
    if (!gameStateRef.current) {
      logger.debug('[useSocket] No gameState available, cannot join channel');
      return;
    }
    logger.debug('[useSocket] Calling gameState.getSocketManager().joinChatChannel');
    gameStateRef.current.getSocketManager().joinChatChannel(channelId);
  }, []);

  const leaveChatChannel = useCallback((channelId: string, username: string) => {
    if (!gameStateRef.current) return;
    gameStateRef.current.getSocketManager().leaveChatChannel(channelId, username);
  }, []);

  const sendMessage = useCallback((message: string) => {
    if (!gameStateRef.current?.getPlayer()) return;
    gameStateRef.current.getSocketManager().sendChat(message, gameStateRef.current.getPlayer()!.username);
  }, []);

  const sendEmote = useCallback((emote: string) => {
    if (!gameStateRef.current?.getPlayer()) return;
    gameStateRef.current.getSocketManager().sendEmote(emote, gameStateRef.current.getPlayer()!.username);
  }, []);

  const getCurrentChannelId = useCallback(() => {
    return gameStateRef.current ? gameStateRef.current.getSocketManager().getCurrentChannelId() : null;
  }, []);

  const resetChannelStateTracking = useCallback(() => {
    lastProcessedChannelState.current = null;
    if (gameStateRef.current && !gameStateRef.current.getIsProcessingMovement() && !gameStateRef.current.getIsLoggingIn()) {
      gameStateRef.current.resetRoomDisplayTracking();
    }
  }, []);

  const isConnected = useCallback(() => {
    return gameStateRef.current ? gameStateRef.current.getSocketManager().isConnected() : false;
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