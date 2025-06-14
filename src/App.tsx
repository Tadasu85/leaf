import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import BuildButton from './components/BuildButton';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import config from './config';
import BuildModal from './components/BuildModal';
import QueueButton from './components/QueueButton';
import QueueManagementModal from './components/QueueManagementModal';
import io from 'socket.io-client';
import { Socket } from 'socket.io-client';
import { GameJSON, PlayerLocation, UserProfileJSON, RoomData } from './types';

// Add process polyfill for browser environment
declare global {
  interface Window {
    process: {
      env: {
        NODE_ENV: string;
      };
    };
  }
}

window.process = window.process || {
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
};

function App() {
  const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
  const [username, setUsername] = useState<string | null>(() => {
    // Initialize from localStorage if available
    const savedUsername = localStorage.getItem('username');
    return savedUsername || null;
  });
  const [roomdata, setRoomData] = useState<RoomData>({
    body: '',
    title: '',
    players: [],
    details: {},
    exits: {},
    author: '',
    permlink: '',
  });
  const [gameJSON, setgameJSON] = useState<GameJSON>({});
  const [userProfileJSON, setuserProfileJSON] = useState<UserProfileJSON>({});
  const [isLoadedGame, setIsLoadedGame] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(() => {
    // Initialize from localStorage if available
    return !!localStorage.getItem('username');
  });
  const [lastKnownLocation, setLastKnownLocation] = useState<PlayerLocation['Location'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [isButtonActive, setIsButtonActive] = useState(false);
  const [isQueueButtonActive, setIsQueueButtonActive] = useState(false);
  const [isBuilder, setIsBuilder] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [queueStatus, setQueueStatus] = useState<[string, any][]>([]);

  // Refs
  const currentRoomIdentifier = useRef<string | null>(null);
  const socket = useRef<Socket | null>(null);
  const outPutRef = useRef<(text: string, bold?: boolean) => void>();
  const roomdataRef = useRef(roomdata);
  const hasShownGreeting = useRef(false);

  // Constants
  const gameGreeting = useMemo(() => [
    "If you've arrived here by accident and do not have a Hive account. ",
    "Please make your way to https://ecency.com/ to create an account.",
    "Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
    "You will also need the hive keychain extension installed and the account added.",
    "If this is successful you will see your username in the top right."
  ], []); // Empty dependency array since these messages are static

  // Initialize clients
  const hivenode = config.hive.node;
  const client = useMemo(() => new Client([hivenode]), [hivenode]);
  const keychain = useMemo(() => new KeychainSDK(window, { rpc: hivenode }), [hivenode]);

  // Callback declarations
  const outPut = useCallback((texttooutput: string, bold?: boolean) => {
    setGameOutputMessage((prevOutput) => [...prevOutput, { output: texttooutput, bold: bold }]);
  }, []);

  // Effects
  useEffect(() => {
    outPutRef.current = outPut;
  }, [outPut]);

  useEffect(() => {
    roomdataRef.current = roomdata;
  }, [roomdata]);

  // Display initial greeting
  useEffect(() => {
    if (!hasShownGreeting.current) {
      gameGreeting.forEach((item) => {
        outPut(item, false);
      });
      hasShownGreeting.current = true;
    }
  }, [gameGreeting, outPut]);

  const displayRoom = useCallback(async (roomData: RoomData) => {
    console.log('Displaying room:', roomData);
    if (!roomData) {
      console.error('No room data provided to displayRoom');
      return;
    }

    // Ensure we have all required data before displaying
    if (!roomData.title || !roomData.body || !roomData.players || !roomData.exits) {
      console.log('Waiting for complete room data...', roomData);
      return;
    }

    // Display room information
    if (roomData.title) {
      outPutRef.current?.(roomData.title, true);
    }
    if (roomData.body) {
      outPutRef.current?.(roomData.body, false);
    }

    // Display players
    const presentPlayers = roomData.players?.filter((p: string) => p !== username) || [];
    if (presentPlayers.length > 0) {
      outPutRef.current?.(`Found ${presentPlayers.length} other player(s) in the room:`, false);
      presentPlayers.forEach((player: string) => {
        outPutRef.current?.(`- ${player}`, false);
      });
    } else {
      outPutRef.current?.("No other players are currently in this room.", false);
    }

    // Display exits
    if (roomData.exits && Object.keys(roomData.exits).length > 0) {
      outPutRef.current?.("Available exits:", false);
      Object.entries(roomData.exits).forEach(([direction, destination]) => {
        outPutRef.current?.(`- ${direction}`, false);
      });
    } else {
      outPutRef.current?.("There are no visible exits from this room.", false);
    }
  }, [username]);

  const parseDetailString = useCallback((detailBody: string): { [key: string]: string } | null => {
    const firstColonIndex = detailBody.indexOf(':');
    if (firstColonIndex === -1) {
      console.warn(`Detail string "${detailBody}" does not contain a colon. Skipping.`);
      return null;
    }
    const key = detailBody.substring(0, firstColonIndex).trim();
    const value = detailBody.substring(firstColonIndex + 1).trim();
    if (key && value) {
      return { [key]: value };
    }
    console.warn(`Parsed key or value is empty for detail string "${detailBody}". Skipping.`);
    return null;
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!username) return;

    // First get the most recent location from the blockchain
    const initializeLocation = async () => {
      try {
        const accountHistory = await client.database.getAccountHistory(username, -1, 100);
        let mostRecentLocation = null;

        // Find the most recent move_to operation
        for (const [, op] of accountHistory) {
          if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
            try {
              const jsonData = JSON.parse(op.op[1].json);
              if (jsonData.move_to) {
                mostRecentLocation = jsonData.move_to.Location;
                break;
              }
            } catch (error) {
              console.error('Error parsing operation JSON:', error);
            }
          }
        }

        // If we found a location, use it, otherwise use default
        const location = mostRecentLocation || { permlink: "genesis-scaffold-precipice", author: "raymonjohnstone" };
        setLastKnownLocation(location);
        return location;
      } catch (error) {
        console.error('Error fetching account history:', error);
        const defaultLocation = { permlink: "genesis-scaffold-precipice", author: "raymonjohnstone" };
        setLastKnownLocation(defaultLocation);
        return defaultLocation;
      }
    };

    // Initialize socket connection after getting location
    initializeLocation().then(location => {
      console.log('Initializing socket connection with username:', username, 'and location:', location);
      const newSocket = io(config.signalingServer, {
        query: { 
          username,
          room: `${location.author}/${location.permlink}`
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      socket.current = newSocket;

      newSocket.on('connect', () => {
        console.log('Connected to signaling server');
        // Re-register username on reconnection
        newSocket.emit('register', { username }, (response: { success: boolean }) => {
          if (response.success) {
            console.log('Successfully re-registered username:', username);
            // Request room state for the current location
            const roomId = `${location.author}/${location.permlink}`;
            console.log('Requesting initial room state for:', roomId);
            newSocket.emit('getRoomState', { room: roomId });
          } else {
            console.error('Failed to re-register username:', username);
          }
        });
      });

      newSocket.on('roomState', (data: RoomData) => {
        console.log('Received room state:', data);
        // Only update room data and display if we have complete information
        if (data.title && data.body && data.players && data.exits) {
          setRoomData(data);
          displayRoom(data);
        } else {
          console.log('Received incomplete room state, waiting for more data...', data);
        }
      });

      newSocket.on('roomUpdate', (data: RoomData) => {
        console.log('Received room update:', data);
        
        // Handle partial updates by merging with existing room data
        setRoomData((prev: RoomData) => {
          const updatedData = {
            ...prev,
            ...data,
            // Ensure players array is always present
            players: data.players || prev.players || []
          };
          
          // Log what's being updated
          const updatedFields = Object.keys(data).filter(key => {
            const typedKey = key as keyof RoomData;
            return data[typedKey] !== prev[typedKey];
          });
          if (updatedFields.length > 0) {
            console.log('Updating room data with fields:', updatedFields);
          }
          
          return updatedData;
        });

        // Only display room if we have the minimum required data
        if (data.title && data.body) {
          displayRoom(data);
        }
      });

      newSocket.on('playerJoined', (data: { username: string; players: string[]; room: string }) => {
        console.log('Player joined event:', data);
        // Only show message if it's not the current user
        if (data.username !== username) {
          outPutRef.current?.(`${data.username} has entered the room.`, false);
        }
        // Update room data regardless of current room to ensure sync
        setRoomData((prev: RoomData) => ({
          ...prev,
          players: data.players
        }));
      });

      newSocket.on('playerLeft', (data: { username: string; players: string[]; room: string }) => {
        console.log('Player left event:', data);
        outPutRef.current?.(`${data.username} has left the room.`, false);
        // Update room data regardless of current room to ensure sync
        setRoomData((prev: RoomData) => ({
          ...prev,
          players: data.players
        }));
      });

      newSocket.on('chat', (data: { username: string; message: string; room: string }) => {
        console.log('Received chat message:', data);
        if (data.room === currentRoomIdentifier.current) {
          // Show different format based on whether the message is from the current user
          if (data.username === username) {
            outPutRef.current?.(`You say: "${data.message}"`, false);
          } else {
            outPutRef.current?.(`${data.username} says: "${data.message}"`, false);
          }
        }
      });

      newSocket.on('emote', (data: { username: string; emote: string; room: string }) => {
        console.log('Received emote:', data);
        if (data.room === currentRoomIdentifier.current) {
          // Show different format based on whether the emote is from the current user
          if (data.username === username) {
            outPutRef.current?.(`You "${data.emote}"`, false);
          } else {
            // Convert first word to third person if it's a verb
            const words = data.emote.split(' ');
            if (words.length > 0) {
              const firstWord = words[0].toLowerCase();
              if (firstWord.endsWith('s')) {
                // If it already ends with 's', assume it's already in third person
                outPutRef.current?.(`${data.username} "${data.emote}"`, false);
              } else {
                // Add 's' to make it third person
                words[0] = firstWord + 's';
                outPutRef.current?.(`${data.username} "${words.join(' ')}"`, false);
              }
            } else {
              outPutRef.current?.(`${data.username} "${data.emote}"`, false);
            }
          }
        }
      });

      return () => {
        console.log('Cleaning up socket connection');
        if (socket.current) {
          socket.current.disconnect();
        }
      };
    });
  }, [displayRoom, username, client]);

  // Update room players
  const updateRoomPlayers = useCallback(async (currentLocation: PlayerLocation['Location']): Promise<string[]> => {
    try {
      console.log('Updating room players for location:', currentLocation);
      const roomId = `${currentLocation.author}/${currentLocation.permlink}`;
      
      // Fetch room content from blockchain
      const transactionData = await client.database.call('get_content', [currentLocation.author, currentLocation.permlink]);
      const roomDetailsReplies = await client.database.call('get_content_replies', [currentLocation.author, currentLocation.permlink]);

      // Transform room details
      const transformedDetails: { [key: string]: string } = {};
      if (Array.isArray(roomDetailsReplies)) {
        roomDetailsReplies.forEach((reply: any) => {
          if (reply && typeof reply.body === 'string') {
            const parsedDetail = parseDetailString(reply.body);
            if (parsedDetail) {
              Object.assign(transformedDetails, parsedDetail);
            }
          }
        });
      }
      
      // Update room data with players from blockchain
      const accountHistory = await client.database.getAccountHistory(config.game.accountName, -1, 100);
      const playersInRoom = new Set<string>();

      // Find all players who have moved to this room
      for (const [, op] of accountHistory) {
        if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
          try {
            const jsonData = JSON.parse(op.op[1].json);
            if (jsonData.move_to && 
                jsonData.move_to.Location.permlink === currentLocation.permlink &&
                jsonData.move_to.Location.author === currentLocation.author) {
              const playerUsername = op.op[1].required_posting_auths[0];
              console.log('Found player in room from blockchain:', playerUsername);
              playersInRoom.add(playerUsername);
            }
          } catch (error) {
            console.error('Error parsing operation JSON:', error);
          }
        }
      }

      // Always include the current user in the room
      if (username) {
        playersInRoom.add(username);
      }

      // Convert Set back to Array for state update
      const newPlayers = Array.from(playersInRoom);
      console.log('Players found in room:', newPlayers);
      
      // Create complete room data
      const newRoomData: RoomData = {
        body: transactionData.body,
        title: transactionData.title,
        players: newPlayers,
        details: transformedDetails,
        exits: gameJSON[currentLocation.permlink]?.exits || {},
        author: currentLocation.author,
        permlink: currentLocation.permlink
      };
      
      // Update room data
      setRoomData(newRoomData);
      console.log('Updated room data:', newRoomData);

      // Update room with signaling server
      if (socket.current) {
        // Leave current room if different
        if (currentRoomIdentifier.current && currentRoomIdentifier.current !== roomId) {
          console.log('Leaving current room:', currentRoomIdentifier.current);
          socket.current.emit('leaveRoom', { 
            room: currentRoomIdentifier.current,
            username 
          });
        }

        // Join new room
        currentRoomIdentifier.current = roomId;
        console.log('Joining room:', { roomId, username, players: newPlayers });
        socket.current.emit('joinRoom', roomId);
      }

      return newPlayers;
    } catch (error) {
      console.error('Error updating room players:', error);
      return [];
    }
  }, [username, client, gameJSON, parseDetailString]);

  const movePlayer = useCallback(async (username: string, options?: {
    newlocation?: {
      permlink: string,
      author: string
    }
  }) => {
    try {
      setLoading(true);
      const newRoomId = options?.newlocation ? 
        `${options.newlocation.author}/${options.newlocation.permlink}` : 
        `${lastKnownLocation?.author}/${lastKnownLocation?.permlink}`;

      // Only leave current room if we're actually changing rooms
      if (currentRoomIdentifier.current && 
          currentRoomIdentifier.current !== newRoomId) {
        console.log('[Room Debug] Leaving room:', {
          from: currentRoomIdentifier.current,
          to: newRoomId,
          username
        });
        
        // Leave room with signaling server
        if (socket.current) {
          socket.current.emit('leaveRoom', { 
            room: currentRoomIdentifier.current,
            username 
          });
        }
      }

      let movedPlayer = {
        "Location": options?.newlocation ?? { "permlink": "genesis-scaffold-precipice", "author": "raymonjohnstone" }
      };
      const broadcastData = {
        "username": username,
        "operations": [
          [
            "custom_json",
            {
              "required_auths": [],
              "required_posting_auths": [username],
              "id": config.game.idName,
              "json": JSON.stringify({
                "move_to": movedPlayer
              })
            }
          ]
        ],
        'method': KeychainKeyTypes.posting
      } as unknown as Broadcast;
      const result = await keychain.broadcast(broadcastData);
      if (result && result.success && result.result && result.result.id) {
        // Wait for the blockchain operation to be processed
        const operationId = result.result.id;
        console.log('[Move Debug] Waiting for blockchain confirmation:', {
          operationId,
          username,
          newLocation: movedPlayer.Location
        });
        
        // Set up a promise that resolves when the operation is confirmed
        const waitForConfirmation = new Promise<void>((resolve, reject) => {
          const checkInterval = setInterval(async () => {
            try {
              const accountHistory = await client.database.getAccountHistory(username, -1, 100);
              const operation = accountHistory.find(([, op]) => 
                op.op[0] === 'custom_json' && 
                op.op[1].id === config.game.idName &&
                op.trx_id === operationId
              );
              
              if (operation) {
                clearInterval(checkInterval);
                resolve();
              }
            } catch (error) {
              console.error('[Move Debug] Error checking operation confirmation:', error);
              clearInterval(checkInterval);
              reject(error);
            }
          }, 1000); // Check every second

          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Operation confirmation timeout'));
          }, 30000);
        });

        try {
          await waitForConfirmation;
          console.log('[Move Debug] Operation confirmed, updating room state');
          
          // Update last known location
          setLastKnownLocation(movedPlayer.Location);
          
          // Join new room with signaling server
          if (socket.current) {
            socket.current.emit('joinRoom', newRoomId);
            currentRoomIdentifier.current = newRoomId;
          }
          
          // Update room players and display
          const updatedPlayers = await updateRoomPlayers(movedPlayer.Location);
          console.log('[Move Debug] Room players updated:', updatedPlayers);
          
          // Fetch and display the new room
          const transactionData = await client.database.call('get_content', [movedPlayer.Location.author, movedPlayer.Location.permlink]);
          const roomDetailsReplies = await client.database.call('get_content_replies', [movedPlayer.Location.author, movedPlayer.Location.permlink]);

          const transformedDetails: { [key: string]: string } = {};
          if (Array.isArray(roomDetailsReplies)) {
            roomDetailsReplies.forEach((reply: any) => {
              if (reply && typeof reply.body === 'string') {
                const parsedDetail = parseDetailString(reply.body);
                if (parsedDetail) {
                  Object.assign(transformedDetails, parsedDetail);
                }
              }
            });
          }

          const newRoomData: RoomData = {
            body: transactionData.body,
            title: transactionData.title,
            players: updatedPlayers,
            details: transformedDetails,
            exits: gameJSON[movedPlayer.Location.permlink]?.exits || {},
            author: movedPlayer.Location.author,
            permlink: movedPlayer.Location.permlink
          };
          
          console.log('[Move Debug] Setting new room data:', newRoomData);
          setRoomData(newRoomData);
          await displayRoom(newRoomData);
          
        } catch (error) {
          console.error('[Move Debug] Error waiting for confirmation:', error);
          outPut('Move failed: Operation confirmation timeout', true);
        }
      } else {
        console.error('[Move Debug] Broadcast failed:', result);
        outPut('Move failed. Please check your Keychain and try again.', true);
      }
    } catch (error) {
      console.error('[Move Debug] Error in movePlayer:', error);
      outPut('Move failed. Please check your Keychain and try again.', true);
    } finally {
      setLoading(false);
    }
  }, [keychain, client, lastKnownLocation, updateRoomPlayers, outPut, gameJSON, parseDetailString, displayRoom]);

  // Fetch game data
  const fetchgameData = useCallback(async () => {
    try {
      setIsLoadedGame(false);
      const communityDetailsArray = await client.hivemind.getCommunity({ 
        name: config.game.accountName, 
        observer: ''
      });
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;
      if (communityDetails && communityDetails.team) {
        const buildersList = communityDetails.team
          .filter(member => member[2] === "Builder")
          .map(member => member[0]);
        setIsBuilder(buildersList.includes(username || ''));
      }
      const gameInfo = await client.database.getAccounts([config.game.accountName]);
      const parsedgameInfo = JSON.parse(gameInfo[0].posting_json_metadata);
      setgameJSON(parsedgameInfo.egodeathgamedata.rooms_authors_exits);
      setIsLoadedGame(true);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [client, username]);

  // Fetch player data
  const fetchPlayerData = useCallback(async (playerUsername: string) => {
    try {
      const account = await client.database.getAccounts([playerUsername]);
      if (account && account[0]) {
        const metadata = JSON.parse(account[0].posting_json_metadata);
        setuserProfileJSON(metadata);
        
        // Get the most recent location from the blockchain
        const accountHistory = await client.database.getAccountHistory(playerUsername, -1, 100);
        let mostRecentLocation = null;

        // Find the most recent move_to operation
        for (const [, op] of accountHistory) {
          if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
            try {
              const jsonData = JSON.parse(op.op[1].json);
              if (jsonData.move_to) {
                mostRecentLocation = jsonData.move_to.Location;
                break; // Stop at the first (most recent) move_to operation
              }
            } catch (error) {
              console.error('Error parsing operation JSON:', error);
            }
          }
        }

        // If we found a location, fetch and display that room
        if (mostRecentLocation) {
          console.log('Found most recent location:', mostRecentLocation);
          setLastKnownLocation(mostRecentLocation);
          const transactionData = await client.database.call('get_content', [mostRecentLocation.author, mostRecentLocation.permlink]);
          const roomDetailsReplies = await client.database.call('get_content_replies', [mostRecentLocation.author, mostRecentLocation.permlink]);

          const transformedDetails: { [key: string]: string } = {};

          if (Array.isArray(roomDetailsReplies)) {
            roomDetailsReplies.forEach((reply: any) => {
              if (reply && typeof reply.body === 'string') {
                const parsedDetail = parseDetailString(reply.body);
                if (parsedDetail) {
                  Object.assign(transformedDetails, parsedDetail);
                }
              }
            });
          }

          // Get initial players in room
          const initialPlayers = await updateRoomPlayers(mostRecentLocation);

          const newRoomData: RoomData = {
            "body": transactionData.body,
            "title": transactionData.title,
            "players": initialPlayers || [],
            "details": transformedDetails,
            "exits": gameJSON[mostRecentLocation.permlink]?.exits || {},
            "author": mostRecentLocation.author,
            "permlink": mostRecentLocation.permlink
          };
          
          console.log('Setting room data:', newRoomData);
          // Update room data
          setRoomData(newRoomData);
          
          // Display room
          await displayRoom(newRoomData);
        } else {
          console.log('No location found, using default location');
          // If no location found, set default location
          const defaultLocation = { permlink: "genesis-scaffold-precipice", author: "raymonjohnstone" };
          setLastKnownLocation(defaultLocation);
          const transactionData = await client.database.call('get_content', [defaultLocation.author, defaultLocation.permlink]);
          const roomDetailsReplies = await client.database.call('get_content_replies', [defaultLocation.author, defaultLocation.permlink]);

          const transformedDetails: { [key: string]: string } = {};

          if (Array.isArray(roomDetailsReplies)) {
            roomDetailsReplies.forEach((reply: any) => {
              if (reply && typeof reply.body === 'string') {
                const parsedDetail = parseDetailString(reply.body);
                if (parsedDetail) {
                  Object.assign(transformedDetails, parsedDetail);
                }
              }
            });
          }

          // Get initial players in room
          const initialPlayers = await updateRoomPlayers(defaultLocation);

          const newRoomData: RoomData = {
            "body": transactionData.body,
            "title": transactionData.title,
            "players": initialPlayers || [],
            "details": transformedDetails,
            "exits": gameJSON[defaultLocation.permlink]?.exits || {},
            "author": defaultLocation.author,
            "permlink": defaultLocation.permlink
          };
          
          console.log('Setting default room data:', newRoomData);
          // Update room data
          setRoomData(newRoomData);
          
          // Display room
          await displayRoom(newRoomData);
        }
      }
    } catch (error) {
      console.error('Error fetching player data:', error);
    }
  }, [client, gameJSON, updateRoomPlayers, displayRoom, parseDetailString]);

  // Load game data on mount
  useEffect(() => {
    if (!isLoadedGame) {
      fetchgameData();
    }
  }, [fetchgameData, isLoadedGame]);

  // Event handlers
  const handleTextEntered = useCallback((text: string) => {
    if (text.startsWith('login ')) {
      const username = text.split(' ')[1];
      if (!username) {
        outPut('Please provide a username: login <username>', true);
        return;
      }
      keychain.login({ 
        username,
        method: KeychainKeyTypes.posting
      })
        .then((result) => {
          if (result.success) {
            // Save to localStorage
            localStorage.setItem('username', username);
            setUsername(username);
            setIsSignedIn(true);
            outPut(`Login successful as ${username}`, true);
            fetchPlayerData(username);
          } else {
            outPut('Login failed. Please check your Keychain and try again.', true);
          }
        })
        .catch((error) => {
          console.error('Login error:', error);
          outPut('Login failed. Please check your Keychain and try again.', true);
        });
    } else if (text.startsWith('move_to ')) {
      if (!isSignedIn || !username) {
        outPut('Please login first', true);
        return;
      }
      const location = text.split(' ')[1];
      if (!location) {
        outPut('Please provide a location: move_to <location>', true);
        return;
      }
      movePlayer(username, {
        newlocation: {
          permlink: location,
          author: gameJSON[location]?.author || "raymonjohnstone"
        }
      });
    } else if (text.startsWith('say ')) {
      if (!isSignedIn || !username) {
        outPut('Please login first', true);
        return;
      }
      const message = text.slice(4);
      if (!message) {
        outPut('Please provide a message: say <message>', true);
        return;
      }
      if (socket.current && currentRoomIdentifier.current) {
        socket.current.emit('chat', { 
          message,
          username,
          room: currentRoomIdentifier.current
        });
        outPut(`[You]: ${message}`, false);
      }
    } else if (text.startsWith('emote ')) {
      if (!isSignedIn || !username) {
        outPut('Please login first', true);
        return;
      }
      const emote = text.slice(6);
      if (!emote) {
        outPut('Please provide an emote: emote <emote>', true);
        return;
      }
      if (socket.current && currentRoomIdentifier.current) {
        socket.current.emit('emote', { 
          emote,
          username,
          room: currentRoomIdentifier.current
        });
        outPut(`You ${emote}`, false);
      }
    } else if (text === 'look') {
      if (!isSignedIn || !username) {
        outPut('Please login first', true);
        return;
      }
      if (roomdata) {
        displayRoom(roomdata);
      }
    } else if (text === 'help') {
      outPut('Available commands:', true);
      outPut('login <username> - Login to the game', true);
      outPut('move_to <location> - Move to a location', true);
      outPut('say <message> - Send a chat message', true);
      outPut('emote <emote> - Perform an emote', true);
      outPut('look - Look around the current room', true);
      outPut('help - Show this help message', true);
      outPut('Directional commands: north, south, east, west, up, down, etc.', true);
    } else {
      // Check if the input matches any room exits
      if (isSignedIn && username && roomdata && roomdata.exits) {
        const direction = text.toLowerCase();
        if (direction in roomdata.exits) {
          const destination = roomdata.exits[direction];
          const author = gameJSON[destination]?.author || "raymonjohnstone";
          outPut(`Moving ${direction}...`, true);
          movePlayer(username, {
            newlocation: {
              permlink: destination,
              author: author
            }
          });
          return;
        }
      }
      outPut('Unknown command. Type "help" for a list of commands.', true);
    }
  }, [keychain, outPut, fetchPlayerData, isSignedIn, username, gameJSON, roomdata, displayRoom, movePlayer]);

  const handleTopRightButtonClick = useCallback(() => {
    setIsBuildModalOpen(true);
    setIsButtonActive(true);
  }, []);

  const handleQueueButtonClick = useCallback(() => {
    setIsQueueModalOpen(true);
    setIsQueueButtonActive(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsBuildModalOpen(false);
    setIsButtonActive(false);
  }, []);

  const handleCloseQueueModal = useCallback(() => {
    setIsQueueModalOpen(false);
    setIsQueueButtonActive(false);
  }, []);

  const handleSignOut = useCallback(() => {
    // Clear localStorage
    localStorage.removeItem('username');
    setIsSignedIn(false);
    setUsername(null);
    setuserProfileJSON({});
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <div className="Title">E̴̙̣̦̩̱̮͇̋̐̏̕G̶̱͕̦͎̯͙̳̋̽͒͋̾͌̌̚͜O̴̪̤͎̼͙̫͌̏͒̑̍̏͜͠ ̶̗͎̯̥̮̲̠̝̮̲̃͆͊̽Ḇ̶̘̞̂Ȇ̶̹͎͓̳̼͇̠͜ͅA̸͖͖̠̖̙̐̍̀̉̍̾̇̚Ṯ̷̜̀̆͗̏͊͘̚H̴̛̼</div>
        {loading ? <div className="Loading">Loading</div> : null}
        <div className="header-buttons">
          {isSignedIn && (
            <div className="user-signout-container">
              {userProfileJSON.profile_image && (
                <img src={userProfileJSON.profile_image} alt="User Icon" className="user-icon" />
              )}
              <SignOutButton 
                isSignedIn={isSignedIn} 
                username={username || undefined}
                onSignOut={handleSignOut}
              />
            </div>
          )}
          {isSignedIn && isBuilder && (
            <BuildButton 
              onClick={handleTopRightButtonClick}
              label="Build"
              isActive={isButtonActive}
            />
          )}
          {isSignedIn && username === config.game.accountName && (
            <QueueButton
              onClick={handleQueueButtonClick}
              label="Queue"
              isActive={isQueueButtonActive}
            />
          )}
        </div>
      </header>
      <GameOutputWindow output={gameOutputMessage} />
      <div className="TextInputBox">
        <TextInputBox onEnterPressed={handleTextEntered} isLoading={loading} />
      </div>
      <BuildModal
        isOpen={isBuildModalOpen}
        onClose={handleCloseModal}
        username={username}
        currentRoom={roomdata.author && roomdata.permlink ? {
          author: roomdata.author,
          permlink: roomdata.permlink
        } : null}
        onRoomCreated={() => {
          fetchgameData();
          if (username) {
            fetchPlayerData(username);
          }
        }}
      />
      <QueueManagementModal
        isOpen={isQueueModalOpen}
        onClose={handleCloseQueueModal}
        username={username}
        queueStatus={queueStatus}
      />
    </div>
  );
}

export default App;