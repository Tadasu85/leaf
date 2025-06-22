import { useEffect, useCallback, useRef } from 'react';
import { GameState } from '../game/state/GameState';
import { SocketManager } from '../game/network/SocketManager';

interface PlayerEvent {
  username: string;
  players: string[];
  room: string;
}

export function useSocket(gameState: GameState | null) {
  const socketManagerRef = useRef<SocketManager | null>(null);
  const lastProcessedRoomState = useRef<string | null>(null);

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

    const handleRoomState = async (data: any) => {
      if (data && data.author && data.permlink) {
        const roomId = `${data.author}/${data.permlink}`;
        const stateKey = `${roomId}-${JSON.stringify(data.players || [])}`;
        
        // Only process if this is a new room state or player list has changed
        if (lastProcessedRoomState.current !== stateKey) {
          lastProcessedRoomState.current = stateKey;
          
          // Fetch full room details from blockchain/game map without displaying
          if (typeof gameState["loadRoom"] === "function") {
            await gameState.loadRoom({ author: data.author, permlink: data.permlink }, true);
            // After loading, merge in players from server and display once
            if (gameState.getCurrentRoom() && data.players) {
              // @ts-ignore: access private property
              gameState.currentRoom.players = data.players;
              gameState.displayRoom();
            }
          }
        }
      }
    };

    // Use the same handler for both roomState and roomUpdate to prevent duplicates
    const handleRoomUpdate = handleRoomState;

    const handlePlayerJoined = (data: PlayerEvent) => {
      // Handle player joined event
    };

    const handlePlayerLeft = (data: PlayerEvent) => {
      // Handle player left event
    };

    const handleChat = (data: { username: string; message: string; room: string }) => {
      // Display chat message from other players
      if (gameState && data.username !== gameState.getPlayer()?.username) {
        gameState.addOutputMessage(`${data.username} says: "${data.message}"`, false);
      }
    };

    const handleEmote = (data: { username: string; emote: string; room: string }) => {
      // Display emote from other players
      if (gameState && data.username !== gameState.getPlayer()?.username) {
        gameState.addOutputMessage(`${data.username} ${data.emote}`, false);
      }
    };

    socketManager.on('roomState', handleRoomState);
    socketManager.on('roomUpdate', handleRoomUpdate);
    socketManager.on('playerJoined', handlePlayerJoined);
    socketManager.on('playerLeft', handlePlayerLeft);
    socketManager.on('chat', handleChat);
    socketManager.on('emote', handleEmote);

    return () => {
      if (socketManager) {
        socketManager.off('roomState', handleRoomState);
        socketManager.off('roomUpdate', handleRoomUpdate);
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

  const joinRoom = useCallback((roomId: string) => {
    if (!socketManagerRef.current) return;
    socketManagerRef.current.joinRoom(roomId);
  }, []);

  const leaveRoom = useCallback((roomId: string, username: string) => {
    if (!socketManagerRef.current) return;
    socketManagerRef.current.leaveRoom(roomId, username);
  }, []);

  const sendMessage = useCallback((message: string) => {
    if (!socketManagerRef.current || !gameState?.getPlayer()) return;
    socketManagerRef.current.sendChat(message, gameState.getPlayer()!.username);
  }, [gameState]);

  const sendEmote = useCallback((emote: string) => {
    if (!socketManagerRef.current || !gameState?.getPlayer()) return;
    socketManagerRef.current.sendEmote(emote, gameState.getPlayer()!.username);
  }, [gameState]);

  const getCurrentRoomIdentifier = useCallback(() => {
    return socketManagerRef.current?.getCurrentRoomIdentifier() || null;
  }, []);

  const resetRoomStateTracking = useCallback(() => {
    lastProcessedRoomState.current = null;
    // Also reset the game state's room display tracking
    if (gameState) {
      gameState.resetRoomDisplayTracking();
    }
  }, [gameState]);

  return {
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendEmote,
    getCurrentRoomIdentifier,
    resetRoomStateTracking
  };
} 