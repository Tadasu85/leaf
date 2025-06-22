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
    };
  }, [gameJSON]);

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
  const updateUserProfile = useCallback((username: string | null) => {
    if (!username) {
      setUserProfileJSON({});
      setIsBuilder(false);
      setIsAdmin(false);
      return;
    }

    setIsBuilder(config.builders.includes(username));
    setIsAdmin(config.admins.includes(username));
  }, []);

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
      
      console.log('[MovePlayer Debug] Broadcast successful, waiting for confirmation...');
      
      // Wait for blockchain confirmation
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 30;
      while (!confirmed && attempts < maxAttempts) {
        try {
          const accountHistory = await client.database.getAccountHistory(player.username, -1, 100);
          for (const [, op] of accountHistory) {
            if (op.op[0] === 'custom_json' && 
                op.op[1].id === config.game.idName && 
                op.trx_id === result.result.id) {
              confirmed = true;
              break;
            }
          }
          if (!confirmed) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
        } catch (error) {
          attempts++;
        }
      }
      
      if (!confirmed) {
        console.log('[MovePlayer Debug] Confirmation timeout after', attempts, 'attempts');
        if (gameState) gameState.addOutputMessage('Move operation timed out. Please try again.', true);
        setLoading(false);
        return;
      }
      
      console.log('[MovePlayer Debug] Move confirmed, loading new room...');
      
      // Update room after confirmation
      if (gameState && movedPlayer.Location) {
        // Update player location in local state
        if (player) {
          player.location = movedPlayer.Location;
          console.log('[MovePlayer Debug] Updated player location to:', player.location);
        }
        
        // Load room without displaying - let socket system handle display
        await gameState.loadRoom(movedPlayer.Location, true);
        console.log('[MovePlayer Debug] Room loaded successfully');
      }
      setLoading(false);
    } catch (error) {
      console.error('[MovePlayer Debug] Move operation failed:', error);
      if (gameState) gameState.addOutputMessage('Move failed. Please check your Keychain and try again.', true);
      setLoading(false);
    }
  }, [player, keychain, client, gameState]);

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
        gameState.say(command.args[0]);
        break;
      case 'emote':
        gameState.emote(command.args[0]);
        break;
      case 'look':
        await gameState.look();
        break;
      case 'help':
        gameState.help();
        break;
      default:
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
    loading
  };
} 