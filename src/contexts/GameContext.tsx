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
import { useClients } from '../hooks/useClients';
import { useGame } from '../hooks/useGame';

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
  buildApprovalQueue: () => Promise<any[]>;
}

// Create context
const GameContext = createContext<GameContextType | undefined>(undefined);

// Provider component
interface GameProviderProps {
  children: ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  const { client, keychain } = useClients();
  const game = useGame(client, keychain);

  // Provide required context fields, using no-ops if not present in useGame
  const contextValue: GameContextType = {
    ...game,
    hasRoomDataChanged: (newData) => game.hasRoomDataChanged ? game.hasRoomDataChanged(newData, game.roomData) : false,
    initializeGame: async () => {},
    logout: () => {},
    clearError: () => {},
    isBulkDataLoaded: false,
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