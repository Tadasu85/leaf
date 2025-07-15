import { useState, useEffect, useCallback } from 'react';
import { Client } from '@hiveio/dhive';
import { GameState } from '../game/state/GameState';
import logger from '../utils/Logger';

export function useGameData(client: Client, gameState: GameState | null) {
  const [isLoadedGame, setIsLoadedGame] = useState(false);
  const [isBulkDataLoaded, setIsBulkDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize bulk data loading
  useEffect(() => {
    if (gameState && !isBulkDataLoaded) {
      const initializeBulkData = async () => {
        try {
          await gameState.initialize();
          setIsBulkDataLoaded(true);
          // Get cache stats for monitoring
        } catch (error) {
          logger.error('[useGameData] Error initializing bulk data:', error);
          setError('Failed to load game data. Please refresh the page.');
        }
      };

      initializeBulkData();
    }
  }, [gameState, isBulkDataLoaded, setError]);

  // Update game map when it changes (now handled by bulk loader)
  useEffect(() => {
    if (gameState && isBulkDataLoaded) {
      setIsLoadedGame(true);
    }
  }, [gameState, isBulkDataLoaded]);

  // Fetch game data (now simplified since bulk loader handles it)
  const fetchGameData = useCallback(async () => {
    try {
      setIsLoadedGame(false);
      setError(null);

      // Game map is now loaded by bulk loader, so we just need to get it
      if (gameState && isBulkDataLoaded) {
        setIsLoadedGame(true);
      }
    } catch (error) {
      logger.error('[useGameData] Error fetching game data:', error);
      setError('Failed to fetch game data from blockchain');
    }
  }, [gameState, isBulkDataLoaded, setError]);

  // Get game map
  const getGameMap = useCallback(() => {
    if (gameState && isBulkDataLoaded) {
      return gameState.getHiveClient().getGameMap();
    }
    return {};
  }, [gameState, isBulkDataLoaded]);

  return {
    // State
    isLoadedGame,
    isBulkDataLoaded,
    error,
    
    // Actions
    fetchGameData,
    getGameMap
  };
} 