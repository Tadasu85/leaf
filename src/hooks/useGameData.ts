import { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from '@hiveio/dhive';
import { GameState } from '../game/state/GameState';
import config from '../config';

export function useGameData(client: Client, gameState: GameState | null) {
  const [isLoadedGame, setIsLoadedGame] = useState(false);
  const [isBulkDataLoaded, setIsBulkDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const buildersList = useRef<string[]>([]);

  // Initialize bulk data loading
  useEffect(() => {
    if (gameState && !isBulkDataLoaded) {
      const initializeBulkData = async () => {
        try {
          console.log('[useGameData] Initializing bulk data loading...');
          await gameState.initialize();
          setIsBulkDataLoaded(true);
          
          // Get cache stats for monitoring
          const stats = gameState.getHiveClient().getCacheStats();
          console.log('[useGameData] Bulk data loaded. Cache stats:', stats);
        } catch (error) {
          console.error('[useGameData] Error initializing bulk data:', error);
          setError('Failed to load game data. Please refresh the page.');
        }
      };

      initializeBulkData();
    }
  }, [gameState, isBulkDataLoaded]);

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
      
      const communityDetailsArray = await client.hivemind.getCommunity({ 
        name: config.game.account, 
        observer: ''
      });
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;
      if (communityDetails && communityDetails.team) {
        const builders = communityDetails.team
          .filter(member => member[2] === "Builder")
          .map(member => member[0]);
        buildersList.current = builders;
      } else {
        buildersList.current = [];
      }

      // Game map is now loaded by bulk loader, so we just need to get it
      if (gameState && isBulkDataLoaded) {
        setIsLoadedGame(true);
      }
    } catch (error) {
      console.error('[useGameData] Error fetching game data:', error);
      setError('Failed to fetch game data from blockchain');
    }
  }, [client, gameState, isBulkDataLoaded]);

  // Check if user is builder
  const checkIfUserIsBuilder = useCallback((username: string) => {
    const isUserBuilder = buildersList.current.includes(username);
    return isUserBuilder;
  }, []);

  // Get game map
  const getGameMap = useCallback(() => {
    if (gameState && isBulkDataLoaded) {
      return gameState.getHiveClient().getGameMap();
    }
    return {};
  }, [gameState, isBulkDataLoaded]);

  // Get builders list
  const getBuildersList = useCallback(() => {
    return buildersList.current;
  }, []);

  return {
    // State
    isLoadedGame,
    isBulkDataLoaded,
    error,
    
    // Actions
    fetchGameData,
    checkIfUserIsBuilder,
    getGameMap,
    getBuildersList
  };
} 