import { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from '@hiveio/dhive';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
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
import config from '../config';
import logger from '../utils/Logger';

export function useGame(client: Client, keychain: KeychainSDK) {
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

  // Command handler logic
  const commandParser = useRef(new CommandParser()).current;

  // Initialize GameState with bulk data loading
  useEffect(() => {
    const hiveClient = new HiveClient();
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
  }, []);

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
      roomState.updateGameJSON(gameMap);
      roomState.setLoadedGame(true);
    }
  }, [gameState, gameData.isBulkDataLoaded, roomState]);

  // Fetch game data - now handled by useGameData hook
  const fetchGameData = useCallback(async () => {
    try {
      roomState.setLoadedGame(false);
      
      // Game map is now loaded by bulk loader, so we just need to get it
      if (gameState && gameData.isBulkDataLoaded) {
        const hiveClient = gameState.getHiveClient();
        const gameMap = hiveClient.getGameMap();
        roomState.updateGameJSON(gameMap);
        roomState.setLoadedGame(true);
      }
    } catch (error) {
      logger.error('Error fetching game data:', error);
    }
  }, [gameState, gameData.isBulkDataLoaded, roomState]);

  // Check if user is builder - now handled by useUserProfile hook
  const checkIfUserIsBuilder = useCallback((username: string) => {
    return userProfile.checkIfUserIsBuilder(username);
  }, [userProfile]);

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

  // Update room data - now handled by useRoomState hook
  const updateRoomData = useCallback((data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => {
    roomState.updateRoomData(data);
  }, [roomState]);

  // Update game JSON - now handled by useRoomState hook
  const updateGameJSON = useCallback((data: GameJSON) => {
    roomState.updateGameJSON(data);
  }, [roomState]);

  // Update user profile - now handled by useUserProfile hook
  const updateUserProfile = useCallback(async (username: string | null) => {
    await userProfile.updateUserProfile(username);
  }, [userProfile]);

  // Check if room data has changed - now handled by useRoomState hook
  const hasRoomDataChanged = useCallback((newData: LegacyRoomData, oldData: LegacyRoomData | null): boolean => {
    return roomState.hasRoomDataChanged(newData);
  }, [roomState]);

  // Build approval queue from blockchain data
  const buildApprovalQueue = useCallback(async (): Promise<any[]> => {
    try {
      logger.info('[Build Queue] Starting queue build...');
      
      // Get current game data
      const gameAccount = await client.database.getAccounts([config.game.account]);
      if (!gameAccount || !gameAccount[0]) {
        logger.error('[Build Queue] Failed to fetch game account data');
        return [];
      }

      const currentMetadata = JSON.parse(gameAccount[0].posting_json_metadata);
      const existingRooms = currentMetadata.egodeathgamedata?.rooms_authors_exits || {};
      logger.debug('[Build Queue] Existing rooms:', Object.keys(existingRooms));
      
      // Get builders list from community
      const communityDetailsArray = await client.hivemind.getCommunity({ 
        name: config.game.account, 
        observer: ''
      });
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;
      
      if (!communityDetails || !communityDetails.team) {
        logger.error('[Build Queue] Failed to fetch community team data');
        return [];
      }

      const builders = communityDetails.team
        .filter(member => member[2] === "Builder")
        .map(member => member[0]);

      logger.debug('[Build Queue] Found builders:', builders);

      // Get recent posts from builders
      const pendingRooms = [];
      
      for (const builder of builders) {
        try {
          logger.debug(`[Build Queue] Checking posts for builder: ${builder}`);
          
          // Get recent account history for this builder to find their posts
          const accountHistory = await client.database.getAccountHistory(builder, -1, 50);
          
          // Filter for recent posts (not comments)
          const recentPosts = accountHistory
            .filter(([, op]) => op.op[0] === 'comment' && !op.op[1].parent_author)
            .slice(0, 20); // Get the 20 most recent posts
          
          logger.debug(`[Build Queue] Found ${recentPosts.length} recent posts for ${builder}`);
          
          // Get full post content for each post
          for (const [, op] of recentPosts) {
            try {
              const postData = op.op[1];
              const content = await client.database.call('get_content', [
                postData.author,
                postData.permlink
              ]);
              
              if (content && content.json_metadata) {
                try {
                  const metadata = JSON.parse(content.json_metadata);
                                logger.debug(`[Build Queue] Checking post: ${content.permlink}`);
              logger.debug(`[Build Queue] Metadata app: ${metadata.app}, type: ${metadata.type}`);
              logger.debug(`[Build Queue] Already in game: ${!!existingRooms[content.permlink]}`);
                  
                  if ((metadata.app === config.game.idName || metadata.app === 'leaf') && 
                      (!metadata.type || metadata.type === 'room') && 
                      !existingRooms[content.permlink]) {
                    
                    // Check if this room has been rejected by looking for rejection comments
                    let isRejected = false;
                    let rejectionReason = '';
                    
                    try {
                      const comments = await client.database.call('get_content_replies', [builder, content.permlink]);
                      const adminComments = comments?.filter((comment: any) => comment.author === config.game.account) || [];
                      
                      for (const comment of adminComments) {
                        if (comment.body.startsWith('Rejected:')) {
                          isRejected = true;
                          rejectionReason = comment.body.substring(9).trim(); // Remove "Rejected: " prefix
                          logger.debug(`[Build Queue] Room ${content.permlink} has been rejected: ${rejectionReason}`);
                          break;
                        }
                      }
                    } catch (error) {
                      logger.error('[Build Queue] Error checking rejection comments:', error);
                    }
                    
                    if (!isRejected) {
                      logger.debug(`[Build Queue] Adding to queue: ${content.permlink}`);
                      
                      // Extract connection information from metadata
                      const connection = metadata.connection || {};
                      
                      pendingRooms.push({
                        id: `${builder}-${content.permlink}-${content.created}`,
                        username: builder,
                        room: connection.fromRoom || {
                          author: builder,
                          permlink: content.permlink
                        },
                        newRoom: {
                          author: builder,
                          permlink: content.permlink
                        },
                        title: content.title,
                        body: content.body,
                        timestamp: new Date(content.created).getTime(),
                        status: 'pending',
                        exits: {
                          fromNewRoom: connection.exitFromNewRoom ? { [connection.exitFromNewRoom]: connection.fromRoom?.permlink || '' } : {},
                          fromCurrentRoom: connection.exitToNewRoom ? { [connection.exitToNewRoom]: content.permlink } : {}
                        }
                      });
                    } else {
                      logger.debug(`[Build Queue] Skipping rejected room ${content.permlink}: ${rejectionReason}`);
                    }
                  } else {
                    logger.debug(`[Build Queue] Skipping post ${content.permlink}: app=${metadata.app}, type=${metadata.type}, inGame=${!!existingRooms[content.permlink]}`);
                  }
                        } catch (error) {
          logger.error('[Build Queue] Error parsing post metadata:', error);
        }
              }
            } catch (error) {
              logger.error('[Build Queue] Error fetching post content:', error);
            }
          }
        } catch (error) {
          logger.error(`[Build Queue] Error fetching posts for builder ${builder}:`, error);
        }
      }

      logger.debug('[Build Queue] Final pending rooms:', pendingRooms);
      return pendingRooms;
    } catch (error) {
      logger.error('[Build Queue] Error building approval queue:', error);
      return [];
    }
  }, [client]);

  // Move player logic (blockchain move)
  const movePlayer = useCallback(async (options?: {
    newlocation?: {
      permlink: string,
      author: string
    }
  }) => {
    if (!player?.username) {
      if (gameState) gameState.addOutputMessage('You must be logged in to move.', true);
      return;
    }
    
    logger.debug('Starting move operation:', {
      player: player.username,
      currentLocation: player.location,
      newLocation: options?.newlocation
    });
    
    try {
      // Admin users don't have a location, so they can't move
      if (!player.location) {
        if (gameState) gameState.addOutputMessage('Admin users cannot move to locations.', true);
        return;
      }
      
      let movedPlayer = {
        "Location": options?.newlocation ?? { "permlink": "genesis-scaffold-precipice", "author": player.location.author }
      };
      
      // Optimistic UI update: update local player location and room immediately
      if (gameState) {
        const optimisticLocation = movedPlayer.Location;
        // Update player location
        if (gameState.getPlayer()) {
          gameState.getPlayer()!.location = optimisticLocation;
        }
        // Get cached room data and update current room
        const cachedRoom = await gameState.getHiveClient().getRoomData(optimisticLocation);
        if (cachedRoom) {
          // Set as current room and display immediately
          (gameState as any).setCurrentRoom(cachedRoom); // setCurrentRoom is private, so we use a cast
          // Set the lastOptimisticRoomKey to suppress the second display
          (gameState as any).lastOptimisticRoomKey = `${cachedRoom.author}/${cachedRoom.permlink}-${JSON.stringify(cachedRoom.players || [])}`;
          gameState.displayRoom();
          // Immediately join the chat channel for the new room
          if (typeof window !== 'undefined' && (window as any).joinChatChannel) {
            (window as any).joinChatChannel(`${cachedRoom.author}/${cachedRoom.permlink}`);
          }
        }
      }
      
      logger.debug('Prepared move data:', movedPlayer);
      
      const broadcastData = {
        "username": player.username,
        "operations": [
          [
            "custom_json",
            {
              "required_auths": [],
              "required_posting_auths": [player.username],
              "id": config.game.idName,
              "json": JSON.stringify({
                "move_to": movedPlayer
              })
            }
          ]
        ],
        'method': KeychainKeyTypes.posting
      } as unknown as Broadcast;
      
      logger.debug('Broadcasting move operation...');
      const result = await keychain.broadcast(broadcastData);
      
      if (!result || !result.success || !result.result || !result.result.id) {
        logger.warn('Broadcast failed:', result);
        if (gameState) gameState.addOutputMessage('Move failed. Please check your Keychain and try again.', true);
        return;
      }
      
      logger.debug('Broadcast successful, blockchain listener will handle the move completion');
      
      // The blockchain listener will handle the move completion automatically
      // No need for loading state since data is already cached
      
    } catch (error) {
      logger.error('Move operation failed:', error);
      if (gameState) gameState.addOutputMessage('Move failed. Please check your Keychain and try again.', true);
    }
  }, [player, keychain, gameState]);

  // Command handler logic
  const handleCommand = useCallback(async (text: string) => {
    logger.debug('handleCommand called with:', text);
    
    if (!gameState) {
      throw new Error('Cannot handle command: gameState is null');
    }
    
    // Get current room exits for command validation
    // Admin users don't have a location, so they can't use movement commands
    const currentRoomPermlink = player?.location?.permlink;
    const currentRoomExits = currentRoom?.exits;
    
    const command = commandParser.parse(text, currentRoomExits);
    if (!command) {
      gameState.addOutputMessage('Invalid command. Type "help" for a list of commands.', true);
      return;
    }
    
    logger.debug('Parsed command:', command);
    
    switch (command.type) {
      case 'move':
        logger.debug('Processing move command');
        const direction = command.args[0];
        
        logger.debug('Attempting to move:', {
          direction,
          currentRoomPermlink,
          playerLocation: player?.location,
          currentRoomExits
        });
        
        if (!currentRoomPermlink) {
          gameState.addOutputMessage('Cannot determine current location.', true);
          return;
        }
        
        // Look up the exit in the current room
        if (!currentRoomExits || !currentRoomExits[direction]) {
          logger.debug('Exit not found:', {
            currentRoomPermlink,
            direction,
            availableExits: currentRoomExits ? Object.keys(currentRoomExits) : 'none'
          });
          gameState.addOutputMessage(`You cannot go ${direction}.`, true);
          return;
        }
        
        const targetPermlink = currentRoomExits[direction];
        logger.debug('Found exit, moving to:', {
          direction,
          targetPermlink,
          currentAuthor: player?.location?.author
        });
        
        // Use the gameState's move method (same as App.tsx version)
        gameState.move(direction);
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
        await gameState.setShortDescription(command.args[0]);
        break;
      case 'describeshort':
        logger.debug('Processing describeshort command');
        await gameState.setShortDescription(command.args[0]);
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
    movePlayer,
    buildApprovalQueue
  };
} 