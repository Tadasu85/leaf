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

export function useGame(client: Client, keychain: KeychainSDK) {
  // Game State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);

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
  const [loading, setLoading] = useState(false);

  // Command handler logic
  const commandParser = useRef(new CommandParser()).current;

  // Initialize GameState
  useEffect(() => {
    const hiveClient = new HiveClient();
    const state = new GameState(hiveClient);
    
    // Set game map if available
    if (Object.keys(gameJSON).length > 0) {
      state.setGameMap(gameJSON);
    }
    
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
      hiveClient.stopMoveListener();
    };
  }, [gameJSON]);

  // Cleanup blockchain listener when player changes
  useEffect(() => {
    if (gameState && player) {
      // The listener is started in GameState.login()
      return () => {
        // Stop the listener when player changes or component unmounts
        gameState.getHiveClient().stopMoveListener();
      };
    }
  }, [gameState, player]);

  // Update game map when it changes
  useEffect(() => {
    if (gameState && Object.keys(gameJSON).length > 0) {
      gameState.setGameMap(gameJSON);
    }
  }, [gameState, gameJSON]);

  // Fetch game data
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

      // Get game account's profile JSON from hive-109456 chain
      const gameAccount = await client.database.call('get_accounts', [[config.game.account]]);
      if (!gameAccount || !gameAccount[0]) {
        console.error('[Game Debug] Failed to fetch game account data');
        return;
      }

      const parsedGameInfo = JSON.parse(gameAccount[0].posting_json_metadata);
      
      if (!parsedGameInfo.egodeathgamedata?.rooms_authors_exits) {
        console.error('[Game Debug] No game map data found in profile JSON. Full parsed data:', parsedGameInfo);
        return;
      }

      const gameMap = parsedGameInfo.egodeathgamedata.rooms_authors_exits;
      setGameJSON(gameMap);
      setIsLoadedGame(true);
    } catch (error) {
      console.error('[Game Debug] Error fetching game data:', error);
    }
  }, [client]);

  // Check if user is builder
  const checkIfUserIsBuilder = useCallback((username: string) => {
    const isUserBuilder = buildersList.current.includes(username);
    return isUserBuilder;
  }, []);

  // Login function
  const login = useCallback(async (username: string) => {
    if (!gameState) return;
    try {
      await gameState.login(username);
    } catch (error) {
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
      // Get current game data
      const gameAccount = await client.database.getAccounts([config.game.account]);
      if (!gameAccount || !gameAccount[0]) {
        console.error('[Build Queue] Failed to fetch game account data');
        return [];
      }

      const currentMetadata = JSON.parse(gameAccount[0].posting_json_metadata);
      const existingRooms = currentMetadata.egodeathgamedata?.rooms_authors_exits || {};
      
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
          // Get recent account history for this builder to find their posts
          const accountHistory = await client.database.getAccountHistory(builder, -1, 50);
          
          // Filter for recent posts (not comments)
          const recentPosts = accountHistory
            .filter(([, op]) => op.op[0] === 'comment' && !op.op[1].parent_author)
            .slice(0, 20); // Get the 20 most recent posts
          
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
                  if (metadata.app === config.game.idName && 
                      metadata.type === 'room' && 
                      !existingRooms[content.permlink]) {
                    
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

      console.log('[Build Queue] Found pending rooms:', pendingRooms);
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
    
    console.log('[MovePlayer Debug] Starting move operation:', {
      player: player.username,
      currentLocation: player.location,
      newLocation: options?.newlocation
    });
    
    try {
      setLoading(true);
      let movedPlayer = {
        "Location": options?.newlocation ?? { "permlink": "genesis-scaffold-precipice", "author": player.location.author }
      };
      
      console.log('[MovePlayer Debug] Prepared move data:', movedPlayer);
      
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
      
      console.log('[MovePlayer Debug] Broadcasting move operation...');
      const result = await keychain.broadcast(broadcastData);
      
      if (!result || !result.success || !result.result || !result.result.id) {
        console.log('[MovePlayer Debug] Broadcast failed:', result);
        if (gameState) gameState.addOutputMessage('Move failed. Please check your Keychain and try again.', true);
        setLoading(false);
        return;
      }
      
      console.log('[MovePlayer Debug] Broadcast successful, waiting for blockchain listener to detect move...');
      
      // The blockchain listener will handle the move completion
      // We just need to wait a reasonable time for it to be detected
      setTimeout(() => {
        setLoading(false);
      }, 3000); // Give 3 seconds for the blockchain listener to detect the move
      
    } catch (error) {
      console.error('[MovePlayer Debug] Move operation failed:', error);
      if (gameState) gameState.addOutputMessage('Move failed. Please check your Keychain and try again.', true);
      setLoading(false);
    }
  }, [player, keychain, gameState]);

  // Command handler logic
  const handleCommand = useCallback(async (text: string) => {
    console.log('[Command Debug] handleCommand called with:', text);
    
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
    
    console.log('[Command Debug] Parsed command:', command);
    
    switch (command.type) {
      case 'move':
        console.log('[Command Debug] Processing move command');
        const direction = command.args[0];
        
        console.log('[Movement Debug] Attempting to move:', {
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
          console.log('[Movement Debug] Exit not found:', {
            currentRoomPermlink,
            direction,
            availableExits: currentRoomExits ? Object.keys(currentRoomExits) : 'none',
            gameJSONForRoom: gameJSON[currentRoomPermlink]
          });
          gameState.addOutputMessage(`You cannot go ${direction}.`, true);
          return;
        }
        
        const targetPermlink = currentRoomExits[direction];
        console.log('[Movement Debug] Found exit, moving to:', {
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
        console.log('[Command Debug] Processing say command');
        gameState.say(command.args[0]);
        break;
      case 'emote':
        console.log('[Command Debug] Processing emote command');
        gameState.emote(command.args[0]);
        break;
      case 'look':
        console.log('[Command Debug] Processing look command');
        await gameState.look();
        break;
      case 'help':
        console.log('[Command Debug] Processing help command');
        gameState.help();
        break;
      case 'describe':
        console.log('[Command Debug] Processing describe command');
        await gameState.setDescription(command.args[0]);
        break;
      case 'describeshort':
        console.log('[Command Debug] Processing describeshort command');
        await gameState.setShortDescription(command.args[0]);
        break;
      case 'lookAt':
        console.log('[Command Debug] Processing lookAt command');
        const target = command.args[0];
        
        // Special case for "look self"
        if (target.toLowerCase() === 'self') {
          await gameState.lookAtSelf();
          break;
        }
        
        console.log('[LookAt Debug] Target:', target);
        const currentRoom = gameState.getCurrentRoom();
        console.log('[LookAt Debug] Current room:', currentRoom);
        if (!currentRoom) {
          gameState.addOutputMessage('No current room found', true);
          break;
        }
        
        // Check if the detail exists in the room
        const roomDetails = (currentRoom as any).details || {};
        console.log('[LookAt Debug] Room details:', roomDetails);
        console.log('[LookAt Debug] Available detail keys:', Object.keys(roomDetails));
        
        // Try exact match first
        let detailKey = Object.keys(roomDetails).find(key => 
          key.toLowerCase() === target.toLowerCase()
        );
        console.log('[LookAt Debug] Exact match result:', detailKey);
        
        // If no exact match, try partial match
        if (!detailKey) {
          detailKey = Object.keys(roomDetails).find(key => 
            key.toLowerCase().includes(target.toLowerCase()) || 
            target.toLowerCase().includes(key.toLowerCase())
          );
          console.log('[LookAt Debug] Partial match result:', detailKey);
        }
        
        if (detailKey) {
          console.log('[LookAt Debug] Found detail, displaying:', detailKey, roomDetails[detailKey]);
          gameState.addOutputMessage(detailKey, true);
          gameState.addOutputMessage(roomDetails[detailKey], false);
        } else {
          console.log('[LookAt Debug] No match found for:', target);
          gameState.addOutputMessage(`You don't see "${target}" here.`, true);
        }
        break;
      default:
        console.log('[Command Debug] Processing default case, command type:', command.type);
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
    loading,
    buildApprovalQueue
  };
} 