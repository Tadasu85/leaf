import { useState, useEffect, useCallback } from 'react';
import { GameState } from '../game/state/GameState';
import { HiveClient } from '../game/blockchain/HiveClient';
import { Player, RoomData } from '../game/types/GameTypes';

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);
  const [isLoginComplete, setIsLoginComplete] = useState(false);

  // Initialize GameState
  useEffect(() => {
    const hiveClient = new HiveClient();
    const state = new GameState(hiveClient);
    
    setGameState(state);
    setIsLoading(false);

    const handlePlayerChanged = (newPlayer: Player | null) => {
      setPlayer(newPlayer);
    };

    const handleRoomChanged = (room: RoomData | null) => {
      setCurrentRoom(room);
    };

    state.on('playerChanged', handlePlayerChanged);
    state.on('roomStateChanged', handleRoomChanged);

    return () => {
      state.off('playerChanged', handlePlayerChanged);
      state.off('roomStateChanged', handleRoomChanged);
      // Stop the blockchain listener when component unmounts
      if (hiveClient && typeof hiveClient.stopMoveListener === 'function') {
        hiveClient.stopMoveListener();
      }
    };
  }, []);

  // Login function
  const login = useCallback(async (username: string) => {
    if (!gameState) return;
    try {
      setIsLoginComplete(false);
      setError(null);
      await gameState.login(username);
      setIsLoginComplete(true);
    } catch (error) {
      setIsLoginComplete(false);
      setError(error instanceof Error ? error.message : 'Failed to login');
    }
  }, [gameState]);

  // Logout function
  const logout = useCallback(() => {
    if (!gameState) return;
    setPlayer(null);
    setCurrentRoom(null);
    setIsLoginComplete(false);
    setError(null);
  }, [gameState]);

  return {
    // Core GameState
    gameState,
    isLoading,
    error,
    
    // Player State
    player,
    currentRoom,
    login,
    logout,
    isLoginComplete
  };
} 