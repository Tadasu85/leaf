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
  GameJSON,
  UserProfileJSON
} from '../game/types/GameTypes';
import config from '../config';
import logger from '../utils/Logger';

export function useGame(client: Client, keychain: KeychainSDK) {
  // Game State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);
  const [isLoginComplete, setIsLoginComplete] = useState(false);
  const [isBulkDataLoaded, setIsBulkDataLoaded] = useState(false);

  // Room State
  const [roomData, setRoomData] = useState<LegacyRoomData>({
    body: '',
    title: '',
    players: [],
    details: {},
    exits: {},
    author: '',
    permlink: '',
  });
  const [gameJSON, setGameJSON] = useState<GameJSON>({});
  const [isLoadedGame, setIsLoadedGame] = useState(false);

  // User State
  const [userProfileJSON, setUserProfileJSON] = useState<UserProfileJSON>({});
  const [isBuilder, setIsBuilder] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Refs
  const buildersList = useRef<string[]>([]);

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

  // Initialize bulk data loading
  useEffect(() => {
    if (gameState && !isBulkDataLoaded) {
      const initializeBulkData = async () => {
        try {
          logger.debug('Initializing bulk data loading...');
          await gameState.initialize();
          setIsBulkDataLoaded(true);
          
          // Get cache stats for monitoring
          const stats = gameState.getHiveClient().getCacheStats();
          logger.debug('Bulk data loaded. Cache stats:', stats);
        } catch (error) {
          logger.error('Error initializing bulk data:', error);
          setError('Failed to load game data. Please refresh the page.');
        }
      };

      initializeBulkData();
    }
  }, [gameState, isBulkDataLoaded]);

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

  // Update game map when it changes (now handled by bulk loader)
  useEffect(() => {
    if (gameState && isBulkDataLoaded) {
      const hiveClient = gameState.getHiveClient();
      const gameMap = hiveClient.getGameMap();
      setGameJSON(gameMap);
      setIsLoadedGame(true);
    }
  }, [gameState, isBulkDataLoaded]);

  // Fetch game data (now simplified since bulk loader handles it)
  const fetchGameData = useCallback(async () => {
    try {
      setIsLoadedGame(false);
      
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
        const hiveClient = gameState.getHiveClient();
        const gameMap = hiveClient.getGameMap();
        setGameJSON(gameMap);
        setIsLoadedGame(true);
      }
    } catch (error) {
      logger.error('Error fetching game data:', error);
    }
  }, [client, gameState, isBulkDataLoaded]);

  // Check if user is builder
  const checkIfUserIsBuilder = useCallback((username: string) => {
    const isUserBuilder = buildersList.current.includes(username);
    return isUserBuilder;
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
      setError(error instanceof Error ? error.message : 'Failed to login');
    }
  }, [gameState]);

  // Update room data
  const updateRoomData = useCallback((data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => {
    if (typeof data === 'function') {
      setRoomData(prev => {
        const newData = data(prev);
        return {
          ...newData,
          exits: gameJSON[newData.permlink]?.exits || {}
        };
      });
    } else {
      setRoomData({
        ...data,
        exits: gameJSON[data.permlink]?.exits || {}
      });
    }
  }, [gameJSON]);

  // Update game JSON
  const updateGameJSON = useCallback((data: GameJSON) => {
    setGameJSON(data);
    setRoomData(prev => ({
      ...prev,
      exits: data[prev.permlink]?.exits || {}
    }));
  }, []);

  // Update user profile
  const updateUserProfile = useCallback(async (username: string | null) => {
    if (!username) {
      setUserProfileJSON({});
      setIsBuilder(false);
      setIsAdmin(false);
      return;
    }

    // Use dynamic builder detection from community + static config as fallback
    const isUserBuilder = buildersList.current.includes(username) || config.builders.includes(username);
    setIsBuilder(isUserBuilder);
    setIsAdmin(config.admins.includes(username));

    // Fetch Hive profile data including player descriptions
    try {
      const hiveClient = new HiveClient();
      const profileImage = await hiveClient.getProfileImage(username);
      
      // Get full account data to access json_metadata
      const accounts = await client.database.call('get_accounts', [[username]]);
      let playerData = {};
      
      if (accounts && accounts[0] && accounts[0].json_metadata) {
        try {
          const metadata = JSON.parse(accounts[0].json_metadata);
          if (metadata.egodeathplayer) {
            playerData = metadata.egodeathplayer;
          }
        } catch (error) {
          console.error('[UpdateUserProfile Debug] Error parsing account metadata:', error);
        }
      }
      
      setUserProfileJSON((prev) => ({ 
        ...prev, 
        profile_image: profileImage || undefined,
        egodeathplayer: playerData
      }));
    } catch (error) {
      console.error('[UpdateUserProfile Debug] Error fetching profile data:', error);
      setUserProfileJSON((prev) => ({ ...prev, profile_image: undefined }));
    }
  }, [client]);

  // Check if room data has changed
  const hasRoomDataChanged = useCallback((newData: LegacyRoomData, oldData: LegacyRoomData | null): boolean => {
    if (!oldData) return true;
    
    return (
      newData.title !== oldData.title ||
      newData.body !== oldData.body ||
      JSON.stringify(newData.players) !== JSON.stringify(oldData.players) ||
      JSON.stringify(newData.exits) !== JSON.stringify(oldData.exits) ||
      JSON.stringify(newData.details) !== JSON.stringify(oldData.details)
    );
  }, []);

  // Build approval queue from blockchain data
  const buildApprovalQueue = useCallback(async (): Promise<any[]> => {
    try {
      console.log('[Build Queue] Starting queue build...');
      
      // Get current game data
      const gameAccount = await client.database.getAccounts([config.game.account]);
      if (!gameAccount || !gameAccount[0]) {
        console.error('[Build Queue] Failed to fetch game account data');
        return [];
      }

      const currentMetadata = JSON.parse(gameAccount[0].posting_json_metadata);
      const existingRooms = currentMetadata.egodeathgamedata?.rooms_authors_exits || {};
      console.log('[Build Queue] Existing rooms:', Object.keys(existingRooms));
      
      // Get builders list from community
      const communityDetailsArray = await client.hivemind.getCommunity({ 
        name: config.game.account, 
        observer: ''
      });
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;
      
      if (!communityDetails || !communityDetails.team) {
        console.error('[Build Queue] Failed to fetch community team data');
        return [];
      }

      const builders = communityDetails.team
        .filter(member => member[2] === "Builder")
        .map(member => member[0]);

      console.log('[Build Queue] Found builders:', builders);

      // Get recent posts from builders
      const pendingRooms = [];
      
      for (const builder of builders) {
        try {
          console.log(`[Build Queue] Checking posts for builder: ${builder}`);
          
          // Get recent account history for this builder to find their posts
          const accountHistory = await client.database.getAccountHistory(builder, -1, 50);
          
          // Filter for recent posts (not comments)
          const recentPosts = accountHistory
            .filter(([, op]) => op.op[0] === 'comment' && !op.op[1].parent_author)
            .slice(0, 20); // Get the 20 most recent posts
          
          console.log(`[Build Queue] Found ${recentPosts.length} recent posts for ${builder}`);
          
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
                  console.log(`[Build Queue] Checking post: ${content.permlink}`);
                  console.log(`[Build Queue] Metadata app: ${metadata.app}, type: ${metadata.type}`);
                  console.log(`[Build Queue] Already in game: ${!!existingRooms[content.permlink]}`);
                  
                  if ((metadata.app === config.game.idName || metadata.app === 'leaf') && 
                      (!metadata.type || metadata.type === 'room') && 
                      !existingRooms[content.permlink]) {
                    
                    console.log(`[Build Queue] Adding to queue: ${content.permlink}`);
                    
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
                    console.log(`[Build Queue] Skipping post ${content.permlink}: app=${metadata.app}, type=${metadata.type}, inGame=${!!existingRooms[content.permlink]}`);
                  }
                } catch (error) {
                  console.error('[Build Queue] Error parsing post metadata:', error);
                }
              }
            } catch (error) {
              console.error('[Build Queue] Error fetching post content:', error);
            }
          }
        } catch (error) {
          console.error(`[Build Queue] Error fetching posts for builder ${builder}:`, error);
        }
      }

      console.log('[Build Queue] Final pending rooms:', pendingRooms);
      return pendingRooms;
    } catch (error) {
      console.error('[Build Queue] Error building approval queue:', error);
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
      setError('Cannot handle command: gameState is null');
      return;
    }
    
    // Get current room exits for command validation
    const currentRoomPermlink = player?.location.permlink;
    const currentRoomExits = currentRoomPermlink ? gameJSON[currentRoomPermlink]?.exits : undefined;
    
    const command = commandParser.parse(text, currentRoomExits);
    if (!command) {
      gameState.addOutputMessage('Invalid command. Type "help" for a list of commands.');
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
          gameJSONKeys: Object.keys(gameJSON),
          currentRoomExits: currentRoomPermlink ? gameJSON[currentRoomPermlink]?.exits : 'no permlink'
        });
        
        if (!currentRoomPermlink) {
          gameState.addOutputMessage('Cannot determine current location.', true);
          return;
        }
        
        // Look up the exit in the gameJSON
        if (!currentRoomExits || !currentRoomExits[direction]) {
          logger.debug('Exit not found:', {
            currentRoomPermlink,
            direction,
            availableExits: currentRoomExits ? Object.keys(currentRoomExits) : 'none',
            gameJSONForRoom: gameJSON[currentRoomPermlink]
          });
          gameState.addOutputMessage(`You cannot go ${direction}.`, true);
          return;
        }
        
        const targetPermlink = currentRoomExits[direction];
        logger.debug('Found exit, moving to:', {
          direction,
          targetPermlink,
          currentAuthor: player?.location.author
        });
        
        await movePlayer({ 
          newlocation: { 
            permlink: targetPermlink, 
            author: player?.location.author || '' 
          } 
        });
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
        gameState.addOutputMessage('Unknown command. Type "help" for a list of commands.');
    }
  }, [gameState, player, commandParser, movePlayer, gameJSON]);

  return {
    // Game State
    gameState,
    isLoading,
    error,
    player,
    currentRoom,
    login,
    isLoginComplete,
    
    // Room State
    roomData,
    gameJSON,
    isLoadedGame,
    updateRoomData,
    updateGameJSON,
    hasRoomDataChanged,
    
    // Game Data
    fetchGameData,
    checkIfUserIsBuilder,
    
    // User State
    userProfileJSON,
    setUserProfileJSON,
    isBuilder,
    isAdmin,
    updateUserProfile,
    // new additions
    handleCommand,
    movePlayer,
    buildApprovalQueue
  };
} 