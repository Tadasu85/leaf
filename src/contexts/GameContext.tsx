import React, { createContext, useContext, ReactNode } from 'react';
import { GameState } from '../game/state/GameState';
import { 
  Player, 
  RoomData, 
  LegacyRoomData, 
  GameJSON,
  UserProfileJSON 
} from '../game/types/GameTypes';
import { useClients } from '../hooks/useClients';
import { useGame } from '../hooks/useGame';
import { useBuildApprovalQueue } from '../hooks/useBuildApprovalQueue';
import { GuestIdentity } from '../game/guest/GuestSession';

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
  // Removed isBulkDataLoaded, not returned by useGame
  
  // User state
  userProfileJSON: UserProfileJSON;
  isBuilder: boolean;
  isAdmin: boolean;
}





// Context interface
interface GameContextType extends GameContextState {
  // Core actions
  initializeGame: () => Promise<void>;
  login: (username: string) => Promise<void>;
  loginAsGuest: (identity: GuestIdentity) => Promise<void>;
  logout: () => void;
  
  // Room actions
  updateRoomData: (data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => void;
  updateGameJSON: (gameJSON: GameJSON) => void;
  hasRoomDataChanged: (newData: LegacyRoomData) => boolean;
  
  // User actions
  updateUserProfile: (username: string | null) => Promise<void>;
  
  // Command handling
  handleCommand: (text: string) => Promise<void>;
  
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
  const { buildApprovalQueue } = useBuildApprovalQueue(client);

  // Provide all the expected context fields from useGame
  const contextValue: GameContextType = {
    // Core state
    gameState: game.gameState,
    isLoading: game.isLoading,
    error: game.error,
    
    // Player state
    player: game.player,
    currentRoom: game.currentRoom,
    isLoginComplete: game.isLoginComplete,
    
    // Room state
    roomData: game.roomData,
    gameJSON: game.gameJSON,
    isLoadedGame: game.isLoadedGame,
    
    // Game data state
    // Removed isBulkDataLoaded, not returned by useGame
    
    // User state
    userProfileJSON: game.userProfileJSON,
    isBuilder: game.isBuilder,
    isAdmin: game.isAdmin,
    
    // Core actions
    initializeGame: async () => {},
    login: game.login,
    loginAsGuest: game.loginAsGuest,
    logout: () => {},
    
    // Room actions
    updateRoomData: game.updateRoomData,
    updateGameJSON: game.updateGameJSON,
    hasRoomDataChanged: (newData) => game.hasRoomDataChanged ? game.hasRoomDataChanged(newData, game.roomData) : false,
    
    // User actions
    updateUserProfile: game.updateUserProfile,
    
    // Command handling
    handleCommand: game.handleCommand,
    
    // Utility actions
    clearError: () => {},
    buildApprovalQueue,
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