import { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from '@hiveio/dhive';
import { GameState } from '../game/state/GameState';
import { HiveClient } from '../game/blockchain/HiveClient';
import { CommandParser } from '../game/commands/CommandParser';
import { 
  Player, 
  GameOutputMessage, 
  RoomData,
  LegacyRoomData,
  GameJSON
} from '../game/types/GameTypes';
import { useUserProfile } from './useUserProfile';
import { useRoomState } from './useRoomState';
import { useGameData } from './useGameData';
import logger from '../utils/Logger';
import { GuestIdentity } from '../game/guest/GuestSession';

export function useGame(client: Client, keychain: any) {
  // Game State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);
  const [isLoginComplete, setIsLoginComplete] = useState(false);

  // Use specialized hooks instead of duplicating functionality
  const gameData = useGameData(client, gameState);
  const roomState = useRoomState();
  const userProfile = useUserProfile(gameState, player, client);

  // Create refs to access current state without causing re-renders
  const roomStateRef = useRef(roomState);
  const userProfileRef = useRef(userProfile);
  
  // Update refs when state changes
  roomStateRef.current = roomState;
  userProfileRef.current = userProfile;

  // Command handler logic
  const commandParser = useRef(new CommandParser()).current;

  // Initialize GameState with bulk data loading
  useEffect(() => {
    const hiveClient = new HiveClient(keychain);
    const state = new GameState(hiveClient);
    
    setGameState(state);
    setIsLoading(false);

    const handleOutput = (message: GameOutputMessage) => {
      // Output is handled by useGameOutput hook
    };

    const handlePlayerChanged = (newPlayer: Player | null) => {
      setPlayer(newPlayer);
    };

    const handleRoomChanged = (room: RoomData | null) => {
      setCurrentRoom(room);
    };

    state.on('output', handleOutput);
    state.on('playerChanged', handlePlayerChanged);
    state.on('roomStateChanged', handleRoomChanged);

    return () => {
      state.off('output', handleOutput);
      state.off('playerChanged', handlePlayerChanged);
      state.off('roomStateChanged', handleRoomChanged);
      // Stop the blockchain listener when component unmounts
      if (hiveClient && typeof hiveClient.stopMoveListener === 'function') {
        hiveClient.stopMoveListener();
      }
    };
  }, [keychain]);

  // Initialize bulk data loading - now handled by useGameData hook
  useEffect(() => {
    if (gameState && !gameData.isBulkDataLoaded) {
      const initializeBulkData = async () => {
        try {
          logger.debug('Initializing bulk data loading...');
          await gameState.initialize();
          
          // Get cache stats for monitoring
          const stats = gameState.getHiveClient().getCacheStats();
          logger.debug('Bulk data loaded. Cache stats:', stats);
        } catch (error) {
          logger.error('Error initializing bulk data:', error);
        }
      };

      initializeBulkData();
    }
  }, [gameState, gameData.isBulkDataLoaded]);

  // Cleanup blockchain listener when player changes
  useEffect(() => {
    if (gameState && player) {
      // The listener is started in GameState.login()
      return () => {
        // Stop the listener when player changes or component unmounts
        const hiveClient = gameState.getHiveClient();
        if (hiveClient && typeof hiveClient.stopMoveListener === 'function') {
          hiveClient.stopMoveListener();
        }
      };
    }
  }, [gameState, player]);

  // Update game map when it changes - now handled by useGameData hook
  useEffect(() => {
    if (gameState && gameData.isBulkDataLoaded) {
      const hiveClient = gameState.getHiveClient();
      const gameMap = hiveClient.getGameMap();
      roomStateRef.current.updateGameJSON(gameMap);
      roomStateRef.current.setLoadedGame(true);
    }
  }, [gameState, gameData.isBulkDataLoaded]);

  // Fetch game data - now handled by useGameData hook
  const fetchGameData = useCallback(async () => {
    try {
      roomStateRef.current.setLoadedGame(false);
      
      // Game map is now loaded by bulk loader, so we just need to get it
      if (gameState && gameData.isBulkDataLoaded) {
        const hiveClient = gameState.getHiveClient();
        const gameMap = hiveClient.getGameMap();
        roomStateRef.current.updateGameJSON(gameMap);
        roomStateRef.current.setLoadedGame(true);
      }
    } catch (error) {
      logger.error('Error fetching game data:', error);
    }
  }, [gameState, gameData.isBulkDataLoaded]);

  // Check if user is builder - now handled by useUserProfile hook
  const checkIfUserIsBuilder = useCallback((username: string) => {
    return userProfileRef.current.checkIfUserIsBuilder(username);
  }, []);

  // Login function
  const login = useCallback(async (username: string) => {
    if (!gameState) return;
    try {
      setIsLoginComplete(false);
      await gameState.login(username);
      setIsLoginComplete(true);
    } catch (error) {
      setIsLoginComplete(false);
      // Error handling is now done by the calling component
      throw error;
    }
  }, [gameState]);

  // Guest login (no Hive account)
  const loginAsGuest = useCallback(async (identity: GuestIdentity) => {
    if (!gameState) return;
    try {
      setIsLoginComplete(false);
      await gameState.loginAsGuest(identity);
      setIsLoginComplete(true);
    } catch (error) {
      setIsLoginComplete(false);
      throw error;
    }
  }, [gameState]);

  // Update room data - now handled by useRoomState hook
  const updateRoomData = useCallback((data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => {
    roomStateRef.current.updateRoomData(data);
  }, []);

  // Update game JSON - now handled by useRoomState hook
  const updateGameJSON = useCallback((data: GameJSON) => {
    roomStateRef.current.updateGameJSON(data);
  }, []);

  // Update user profile - now handled by useUserProfile hook
  const updateUserProfile = useCallback(async (username: string | null) => {
    await userProfileRef.current.updateUserProfile(username);
  }, []);

  // Check if room data has changed - now handled by useRoomState hook
  const hasRoomDataChanged = useCallback((newData: LegacyRoomData, oldData: LegacyRoomData | null): boolean => {
    return roomStateRef.current.hasRoomDataChanged(newData);
  }, []);


  // Command handler logic
  const handleCommand = useCallback(async (text: string) => {
    logger.debug('handleCommand called with:', text);
    
    if (!gameState) {
      throw new Error('Cannot handle command: gameState is null');
    }
    
    // Get current room exits for command validation
    // Admin users don't have a location, so they can't use movement commands
    const currentRoomExits = currentRoom?.exits;
    
    const command = commandParser.parse(text, currentRoomExits);
    if (!command) {
      gameState.addOutputMessage('Invalid command. Type "help" for a list of commands.', true);
      return;
    }
    
    logger.debug('Parsed command:', command);
    
    switch (command.type) {
      case 'move':
        gameState.move(command.args[0]);
        break;
      case 'say':
        logger.debug('Processing say command');
        gameState.say(command.args[0]);
        break;
      case 'emote':
        logger.debug('Processing emote command');
        gameState.emote(command.args[0]);
        break;
      case 'look':
        logger.debug('Processing look command');
        await gameState.look();
        break;
      case 'help':
        logger.debug('Processing help command');
        gameState.help();
        break;
      case 'describe':
        logger.debug('Processing describe command');
        await gameState.setDescription(command.args[0]);
        break;
      case 'describeshort':
        logger.debug('Processing describeshort command');
        await gameState.setShortDescription(command.args[0]);
        break;
      case 'mute':
        await gameState.mute(command.args[0]);
        break;
      case 'unmute':
        await gameState.unmute(command.args[0]);
        break;
      case 'muted':
        await gameState.listMuted();
        break;
      case 'lookAt':
        logger.debug('Processing lookAt command');
        const target = command.args[0];

        // 1. Special case for "look self" or "look me"
        if (['self', 'me'].includes(target.toLowerCase())) {
          await gameState.lookAtSelf();
          break;
        }

        const currentRoom = gameState.getCurrentRoom();
        if (!currentRoom) {
          gameState.addOutputMessage('No current room found', true);
          break;
        }

        // 2. Check if the target is a player in the room
        const roomPlayers = currentRoom.players || [];
        const isPlayerInRoom = roomPlayers.some(player => player.toLowerCase() === target.toLowerCase());
        if (isPlayerInRoom) {
          await gameState.lookAtPlayer(target);
          break;
        }

        // 3. Check if the detail exists in the room
        const roomDetails = (currentRoom as any).details || {};
        let detailKey = Object.keys(roomDetails).find(key => key.toLowerCase() === target.toLowerCase());
        if (!detailKey) {
          detailKey = Object.keys(roomDetails).find(key =>
            key.toLowerCase().includes(target.toLowerCase()) ||
            target.toLowerCase().includes(key.toLowerCase())
          );
        }
        if (detailKey) {
          gameState.addOutputMessage(detailKey, true);
          gameState.addOutputMessage(roomDetails[detailKey], false);
        } else {
          gameState.addOutputMessage(`You don't see "${target}" here.`, true);
        }
        break;
      default:
        logger.debug('Processing default case, command type:', command.type);
        gameState.addOutputMessage('Unknown command. Type "help" for a list of commands.', true);
    }
  }, [gameState, player, currentRoom, commandParser]);

  return {
    // Game State
    gameState,
    isLoading,
    error: gameData.error,
    player,
    currentRoom,
    login,
    loginAsGuest,
    isLoginComplete,
    
    // Room State - from useRoomState hook
    roomData: roomState.roomData,
    gameJSON: roomState.gameJSON,
    isLoadedGame: roomState.isLoadedGame,
    updateRoomData,
    updateGameJSON,
    hasRoomDataChanged,
    
    // Game Data - from useGameData hook
    fetchGameData,
    checkIfUserIsBuilder,
    
    // User State - from useUserProfile hook
    userProfileJSON: userProfile.userProfileJSON,
    setUserProfileJSON: () => {}, // Deprecated, use updateUserProfile instead
    isBuilder: userProfile.isBuilder,
    isAdmin: userProfile.isAdmin,
    updateUserProfile,
    
    // Command handling
    handleCommand,
  };
} 