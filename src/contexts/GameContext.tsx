import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react';
import { GameState } from '../game/state/GameState';
import { HiveClient } from '../game/blockchain/HiveClient';
import { 
  Player, 
  RoomData, 
  LegacyRoomData, 
  GameJSON,
  UserProfileJSON 
} from '../game/types/GameTypes';
import logger from '../utils/Logger';
import config from '../config';

// Game state types
interface GameContextState {
  // Core state
  gameState: GameState | null;
  isLoading: boolean;
  error: string | null;
  
  // Player state
  player: Player | null;
  currentRoom: RoomData | null;
  isLoginComplete: boolean;
  
  // Room state
  roomData: LegacyRoomData;
  gameJSON: GameJSON;
  isLoadedGame: boolean;
  
  // Game data state
  isBulkDataLoaded: boolean;
  
  // User state
  userProfileJSON: UserProfileJSON;
  isBuilder: boolean;
  isAdmin: boolean;
}

// Action types
type GameAction =
  // Core actions
  | { type: 'SET_GAME_STATE'; payload: GameState | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  
  // Player actions
  | { type: 'SET_PLAYER'; payload: Player | null }
  | { type: 'SET_CURRENT_ROOM'; payload: RoomData | null }
  | { type: 'SET_LOGIN_COMPLETE'; payload: boolean }
  
  // Room actions
  | { type: 'SET_ROOM_DATA'; payload: LegacyRoomData }
  | { type: 'SET_GAME_JSON'; payload: GameJSON }
  | { type: 'SET_LOADED_GAME'; payload: boolean }
  | { type: 'UPDATE_ROOM_DATA'; payload: Partial<LegacyRoomData> }
  
  // Game data actions
  | { type: 'SET_BULK_DATA_LOADED'; payload: boolean }
  
  // User actions
  | { type: 'SET_USER_PROFILE'; payload: UserProfileJSON }
  | { type: 'SET_BUILDER_STATUS'; payload: boolean }
  | { type: 'SET_ADMIN_STATUS'; payload: boolean }
  
  // Reset actions
  | { type: 'RESET_STATE' };

// Initial state
const initialState: GameContextState = {
  // Core state
  gameState: null,
  isLoading: true,
  error: null,
  
  // Player state
  player: null,
  currentRoom: null,
  isLoginComplete: false,
  
  // Room state
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
  
  // Game data state
  isBulkDataLoaded: false,
  
  // User state
  userProfileJSON: {},
  isBuilder: false,
  isAdmin: false,
};

// Reducer function
function gameReducer(state: GameContextState, action: GameAction): GameContextState {
  switch (action.type) {
    // Core actions
    case 'SET_GAME_STATE':
      return { ...state, gameState: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    // Player actions
    case 'SET_PLAYER':
      return { ...state, player: action.payload };
    case 'SET_CURRENT_ROOM':
      return { ...state, currentRoom: action.payload };
    case 'SET_LOGIN_COMPLETE':
      return { ...state, isLoginComplete: action.payload };
    
    // Room actions
    case 'SET_ROOM_DATA':
      return {
        ...state,
        roomData: {
          ...action.payload,
          exits: state.gameJSON[action.payload.permlink]?.exits || {}
        }
      };
    case 'SET_GAME_JSON':
      return {
        ...state,
        gameJSON: action.payload,
        roomData: {
          ...state.roomData,
          exits: action.payload[state.roomData.permlink]?.exits || {}
        }
      };
    case 'SET_LOADED_GAME':
      return { ...state, isLoadedGame: action.payload };
    case 'UPDATE_ROOM_DATA':
      return {
        ...state,
        roomData: {
          ...state.roomData,
          ...action.payload,
          exits: state.gameJSON[state.roomData.permlink]?.exits || {}
        }
      };
    
    // Game data actions
    case 'SET_BULK_DATA_LOADED':
      return { ...state, isBulkDataLoaded: action.payload };
    
    // User actions
    case 'SET_USER_PROFILE':
      return { ...state, userProfileJSON: action.payload };
    case 'SET_BUILDER_STATUS':
      return { ...state, isBuilder: action.payload };
    case 'SET_ADMIN_STATUS':
      return { ...state, isAdmin: action.payload };
    
    // Reset actions
    case 'RESET_STATE':
      return initialState;
    
    default:
      return state;
  }
}

// Context interface
interface GameContextType extends GameContextState {
  // Core actions
  initializeGame: () => Promise<void>;
  login: (username: string) => Promise<void>;
  logout: () => void;
  
  // Room actions
  updateRoomData: (data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => void;
  updateGameJSON: (gameJSON: GameJSON) => void;
  hasRoomDataChanged: (newData: LegacyRoomData) => boolean;
  
  // User actions
  updateUserProfile: (username: string | null) => Promise<void>;
  
  // Utility actions
  clearError: () => void;
}

// Create context
const GameContext = createContext<GameContextType | undefined>(undefined);

// Provider component
interface GameProviderProps {
  children: ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Initialize game state
  const initializeGame = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const hiveClient = new HiveClient();
      const gameState = new GameState(hiveClient);
      
      dispatch({ type: 'SET_GAME_STATE', payload: gameState });
      
      // Set up event listeners
      const handlePlayerChanged = (newPlayer: Player | null) => {
        dispatch({ type: 'SET_PLAYER', payload: newPlayer });
      };

      const handleRoomChanged = (room: RoomData | null) => {
        dispatch({ type: 'SET_CURRENT_ROOM', payload: room });
      };

      gameState.on('playerChanged', handlePlayerChanged);
      gameState.on('roomStateChanged', handleRoomChanged);
      
      // Initialize bulk data loading
      await gameState.initialize();
      dispatch({ type: 'SET_BULK_DATA_LOADED', payload: true });
      
      // Get game map
      const gameMap = gameState.getHiveClient().getGameMap();
      dispatch({ type: 'SET_GAME_JSON', payload: gameMap });
      dispatch({ type: 'SET_LOADED_GAME', payload: true });
      
      dispatch({ type: 'SET_LOADING', payload: false });
      
      logger.debug('Game initialized successfully');
    } catch (error) {
      logger.error('Error initializing game:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize game' });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Login function
  const login = useCallback(async (username: string) => {
    if (!state.gameState) return;
    
    try {
      dispatch({ type: 'SET_LOGIN_COMPLETE', payload: false });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await state.gameState.login(username);
      dispatch({ type: 'SET_LOGIN_COMPLETE', payload: true });
      
      logger.debug('Login successful for user:', username);
    } catch (error) {
      dispatch({ type: 'SET_LOGIN_COMPLETE', payload: false });
      const errorMessage = error instanceof Error ? error.message : 'Failed to login';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      logger.error('Login failed:', error);
    }
  }, [state.gameState]);

  // Logout function
  const logout = useCallback(() => {
    dispatch({ type: 'SET_PLAYER', payload: null });
    dispatch({ type: 'SET_CURRENT_ROOM', payload: null });
    dispatch({ type: 'SET_LOGIN_COMPLETE', payload: false });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_USER_PROFILE', payload: {} });
    dispatch({ type: 'SET_BUILDER_STATUS', payload: false });
    dispatch({ type: 'SET_ADMIN_STATUS', payload: false });
    
    // Stop blockchain listener and clear pending movements
    if (state.gameState) {
      const hiveClient = state.gameState.getHiveClient();
      if (typeof hiveClient.stopMoveListener === 'function') {
        hiveClient.stopMoveListener();
      }
      // Disconnect socket for chat
      state.gameState.getSocketManager().disconnect();
    }
    
    logger.debug('Logout completed');
  }, [state.gameState]);

  // Room actions
  const updateRoomData = useCallback((data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => {
    if (typeof data === 'function') {
      dispatch({ type: 'UPDATE_ROOM_DATA', payload: data(state.roomData) });
    } else {
      dispatch({ type: 'SET_ROOM_DATA', payload: data });
    }
  }, [state.roomData]);

  const updateGameJSON = useCallback((gameJSON: GameJSON) => {
    dispatch({ type: 'SET_GAME_JSON', payload: gameJSON });
  }, []);

  const hasRoomDataChanged = useCallback((newData: LegacyRoomData) => {
    return JSON.stringify(newData) !== JSON.stringify(state.roomData);
  }, [state.roomData]);

  // User actions
  const updateUserProfile = useCallback(async (username: string | null) => {
    if (!username) {
      dispatch({ type: 'SET_USER_PROFILE', payload: {} });
      dispatch({ type: 'SET_BUILDER_STATUS', payload: false });
      dispatch({ type: 'SET_ADMIN_STATUS', payload: false });
      return;
    }

    try {
      // Check if user is admin account
      const isUserAdmin = username === config.game.account;
      const isUserBuilder = config.builders.includes(username);
      
      dispatch({ type: 'SET_BUILDER_STATUS', payload: isUserBuilder });
      dispatch({ type: 'SET_ADMIN_STATUS', payload: isUserAdmin });

      // Update game state if available
      if (state.gameState) {
        state.gameState.setBuilderStatus(isUserBuilder);
      }

      // Fetch Hive profile data
      const hiveClient = new HiveClient();
      const profileImage = await hiveClient.getProfileImage(username);
      
      // Get full account data to access json_metadata
      const client = new (await import('@hiveio/dhive')).Client(config.hive.nodes);
      const accounts = await client.database.call('get_accounts', [[username]]);
      let playerData = {};
      
      if (accounts && accounts[0] && accounts[0].json_metadata) {
        try {
          const metadata = JSON.parse(accounts[0].json_metadata);
          if (metadata.egodeathplayer) {
            playerData = metadata.egodeathplayer;
          }
        } catch (error) {
          logger.error('Error parsing account metadata:', error);
        }
      }
      
      dispatch({ type: 'SET_USER_PROFILE', payload: { 
        profile_image: profileImage || undefined,
        egodeathplayer: playerData
      }});
      
      logger.debug('User profile updated for:', username);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      dispatch({ type: 'SET_USER_PROFILE', payload: { profile_image: undefined } });
    }
  }, [state.gameState]);

  // Utility actions
  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // Initialize game on mount
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.gameState) {
        const hiveClient = state.gameState.getHiveClient();
        if (typeof hiveClient.stopMoveListener === 'function') {
          hiveClient.stopMoveListener();
        }
      }
    };
  }, [state.gameState]);

  const contextValue: GameContextType = {
    ...state,
    initializeGame,
    login,
    logout,
    updateRoomData,
    updateGameJSON,
    hasRoomDataChanged,
    updateUserProfile,
    clearError,
  };

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
}

// Custom hook to use the game context
export function useGameContext() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
} 