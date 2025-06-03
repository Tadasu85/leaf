import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import BuildButton from './components/BuildButton';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { io, Socket } from 'socket.io-client';
import Peer, {SignalData} from 'simple-peer';
import { Client } from '@hiveio/dhive';
import { debounce } from 'lodash';
import config from './config';
import BuildModal from './components/BuildModal';

// Interface for PeerConnection (refined)
interface PeerConnection {
  peer: Peer.Instance;
  targetUsername: string; // Track who this peer connects to
  connected: boolean; // Is the data channel open?
}

interface GameJSON {
  [key: string]: {
    exits: {
      [key: string]: string;
    };
    author: string;
  };
}

interface RoomData {
  body: string;
  title: string;
  players: string[];
  details: {
    [key: string]: string;
  };
  exits: {
    [key: string]: string;
  };
  author: string;
  permlink: string;
}

interface PlayerLocation {
  Location: {
    permlink: string;
    author: string;
  };
}

interface UserProfileJSON {
  egodeathplayer?: {
    Name?: string;
    Description?: string;
    ShortDesc?: string;
  };
  Location?: {
    permlink: string;
    author: string;
  };
  profile_image?: string;
}

interface StreamOperation {
  op: [string, {
    id: string;
    json: string;
    required_posting_auths: string[];
  }];
  trx_id: string;
}

// --- Helper type for P2P messages ---
interface P2PMessage {
  type: 'chat' | 'emote'; // Add other types as needed
  payload: any;
  sender: string;
}

// Move socket setup outside component
const createSignalingSocket = (username: string) => {
  const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:4001', {
    query: { username },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  return socket;
};

function App() {

  const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [roomdata, setRoomData] = useState<RoomData>({
    body: '',
    title: '',
    players: [], // Initialize as an empty array
    details: {},
    exits: {}, // Initialize as an empty object
    author: '',
    permlink: '',
  });
  const [gameJSON, setgameJSON] = useState<GameJSON>({});
  const [userProfileJSON, setuserProfileJSON] = useState<UserProfileJSON>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [userGreeted, setUserGreeted] = useState(false);
  const [isLoadedGame, setIsLoadedGame] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [lastKnownLocation, setLastKnownLocation] = useState<PlayerLocation['Location'] | null>(null);
  const [loading, setLoading] = useState(false);
  const processedOperations = useMemo(() => new Set<string>(), []);
  const peers = useRef<{ [username: string]: PeerConnection }>({});
  const currentRoomIdentifier = useRef<string | null>(null);
  const isUnmounted = useRef(false);
  const retryCount = useRef(0);
  const signalingSocket = useRef<Socket | null>(null);
  const isSettingUpSocket = useRef(false);
  const [isButtonActive, setIsButtonActive] = useState(false);
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [builders, setBuilders] = useState<string[]>([]);
  const [isBuilder, setIsBuilder] = useState<boolean>(false);

  const outPut = useCallback((texttooutput: string, bold?: boolean) => {
    setGameOutputMessage((prevOutput) => [...prevOutput, { output: texttooutput, bold: bold }]);
  }, []);

  const outPutRef = useRef(outPut);

  useEffect(() => {
    outPutRef.current = outPut;
  }, [outPut]);

  const roomdataRef = useRef(roomdata);

  useEffect(() => {
    roomdataRef.current = roomdata;
  }, [roomdata]);

  //We depend on keychain for signing and dhive for fetching data from the hive chain.
  //Here we initializse them both.

  const hivenode = config.hive.node;

  const client = useMemo(() => new Client([hivenode]), [hivenode]);

  const keychain = useMemo(() => new KeychainSDK(window, { rpc: hivenode }), [hivenode]);

  // Helper function to broadcast data to the blockchain
  // Commented out for the time being as we are not using it.
  // const broadcastToBlockchain = useCallback(async (data: any) => {
  //   if (!username) return;
    
  //   try {
  //     const broadcastData = {
  //       username: username,
  //       operations: [
  //         [
  //           "custom_json",
  //           {
  //             required_auths: [],
  //             required_posting_auths: [username],
  //             id: config.game.idName,
  //             json: JSON.stringify(data)
  //           }
  //         ]
  //       ],
  //       method: KeychainKeyTypes.posting
  //     };

  //     await keychain.broadcast(broadcastData as unknown as Broadcast);
  //   } catch (error) {
  //     console.error('Error broadcasting to blockchain:', error);
  //   }
  // }, [username, keychain]);

  // --- P2P Helper: Destroy Peer ---
  const destroyPeer = useCallback((targetUser: string) => {
    const peerConn = peers.current[targetUser];
    if (peerConn) {
      peerConn.peer.destroy();
      delete peers.current[targetUser];
    }
  }, []);

  // --- P2P Helper: Destroy All Peers ---
  const destroyAllPeers = useCallback(() => {
    Object.keys(peers.current).forEach(targetUser => {
      destroyPeer(targetUser);
    });
    peers.current = {};
  }, [destroyPeer]);

  // --- P2P Helper: Create Peer ---
  const createPeer = useCallback((targetUser: string, initiator: boolean) => {
    if (!username || peers.current[targetUser]) {
      return;
    }

    const peer = new Peer({
      initiator, 
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    const peerConn: PeerConnection = {
      peer,
      targetUsername: targetUser,
      connected: false,
    };
    peers.current[targetUser] = peerConn;

    peer.on('connect', () => {
      peerConn.connected = true;
      outPutRef.current(`[P2P] Connected to ${targetUser}.`, false);
      
      const testMessage: P2PMessage = {
        type: 'chat',
        payload: 'Connection established',
        sender: username
      };
      try {
        peer.send(JSON.stringify(testMessage));
      } catch (error) {
        console.error(`Failed to send test message to ${targetUser}:`, error);
      }
    });

    peer.on('data', (data: Buffer) => {
      try {
        const messageStr = data.toString();
        const message: P2PMessage = JSON.parse(messageStr);

        switch (message.type) {
          case 'chat':
            outPutRef.current(`[${message.sender}]: ${message.payload}`, false);
            break;
          case 'emote':
            outPutRef.current(`[P2P] ${message.payload}`, false);
            break;
          default:
            console.warn(`Received unknown P2P message type: ${message.type}`);
        }
      } catch (error) {
        console.error(`Error processing data from ${targetUser}:`, error);
        outPutRef.current(`[P2P Error] Received malformed data from ${targetUser}.`, true);
      }
    });

    peer.on('close', () => {
      outPutRef.current(`[P2P] Disconnected from ${targetUser}.`, false);
      destroyPeer(targetUser);
    });

    peer.on('error', (err: Error) => {
      console.error(`ERROR with peer ${targetUser}:`, err);
      outPutRef.current(`[P2P Error] Connection error with ${targetUser}: ${err.message}`, true);
      destroyPeer(targetUser);
    });

  }, [username, destroyPeer]);

  // --- P2P Signaling Handlers ---
  const handleIncomingSignal = useCallback(({ from, signal }: { from: string, signal: SignalData }) => {
    console.log(`Received signal from ${from}:`, signal.type);
    const peerConn = peers.current[from];

    if (signal.type === 'offer') {
      if (peerConn) {
        console.warn(`Received offer from ${from}, but peer connection already exists. Ignoring.`);
        return;
      }
      createPeer(from, false);
      peers.current[from]?.peer.signal(signal);
    } else {
      if (!peerConn) {
        console.warn(`Received ${signal.type} from ${from}, but no peer connection exists. Ignoring.`);
        return;
      }
      if (!peerConn.connected) {
        peerConn.peer.signal(signal);
      } else {
        console.log(`Ignoring signal from ${from}, already connected.`);
      }
    }
  }, [createPeer]);

  const handleIncomingSignalRef = useRef(handleIncomingSignal);

  useEffect(() => {
    handleIncomingSignalRef.current = handleIncomingSignal;
  }, [handleIncomingSignal]);

  const destroyAllPeersRef = useRef(destroyAllPeers);

  useEffect(() => {
    destroyAllPeersRef.current = destroyAllPeers;
  }, [destroyAllPeers]);

  async function initializeKeychain() {
    try {
      const isInstalled = await keychain.isKeychainInstalled();
      if (isInstalled) {
        console.log("Keychain installed");
      }
      return isInstalled; // Return boolean indicating success
    } catch (error) {
      console.error('Error initializing Keychain:', error);
      return false;
    }
  };

  const checkAndInitialize = async () => {
    const initialized = await initializeKeychain();
    if (initialized) {
      console.log("Keychain is initialized.")
    }
  }

  window.onload = checkAndInitialize;

  const gameGreeting = [
    "If you've arrived here by accident and do not have a Hive account. ",
    "Please make your way to https://ecency.com/ to create an account.",
    "Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
    "You will also need the hive keychain extension installed and the account added.",
    "If this is successful you will see your username in the top right."
  ];

  const traceUserActivity = useCallback(async (username: string, targetKey: string) => {
    try {
      const accountHistory = await client.database.getAccountHistory(username, -1, 100);
      if (accountHistory.length > 0) {
        for (let i = accountHistory.length - 1; i >= 0; i--) {
          // eslint-disable-next-line
          const [seq, op] = accountHistory[i];
          if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
            const jsonData = JSON.parse(op.op[1].json);
            if (jsonData[targetKey]) {
              processedOperations.add(op.trx_id);
              return jsonData[targetKey];
            }
          }
        }
      }
      console.warn(`User data not found in recent account history for key ${targetKey}.`);
      return null;
    } catch (error) {
      console.error('Error fetching account history:', error);
      return null;
    }
  }, [client, processedOperations]);

  const fetchgameData = useCallback(async () => {
    try {
      setIsLoadedGame(false);
      const communityDetailsArray = await client.hivemind.getCommunity({ 
        name: config.game.accountName, 
        observer: '' // Provide a valid observer value
      });

      // Check if the response is an array and get the first element
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;

      // Extract builders from the team array
      if (communityDetails && communityDetails.team) {
        const buildersList = communityDetails.team
          .filter(member => member[2] === "Builder") // Check if the title is "Builder"
          .map(member => member[0]); // Get the username of the builder
        setBuilders(buildersList); // Set the builders state
      }

      const gameInfo = await client.database.getAccounts([config.game.accountName]);
      const parsedgameInfo = JSON.parse(gameInfo[0].posting_json_metadata);
      setgameJSON(parsedgameInfo.egodeathgamedata.rooms_authors_exits);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [client, setgameJSON]);

  useEffect(() => {
    if (!isLoadedGame) {
      fetchgameData();
      setIsLoadedGame(true);
    }

  }, [isLoadedGame, fetchgameData]);

  // Move updateRoomPlayers before fetchPlayerData
  const updateRoomPlayers = useCallback(async (currentLocation: PlayerLocation['Location']) => {
    if (!currentLocation) return;

    try {
      console.log('Updating room players for location:', currentLocation);
      
      // First check the signaling server for current room state
      if (signalingSocket.current) {
        const roomId = `${currentLocation.author}/${currentLocation.permlink}`;
        console.log('Requesting room state from signaling server:', roomId);
        
        // Emit a request to get the current room state
        signalingSocket.current.emit('getRoomState', { room: roomId });

        // Listen for the response from the signaling server
        signalingSocket.current.once('roomState', ({ players }: { players: string[] }) => {
          console.log('Received room state from signaling server:', players);

          // Update the players list in roomdata
          setRoomData(prev => ({
            ...prev,
            players: players // Update players with the list received from the server
          }));

          // Connect to new players in the room
          players.forEach((targetUser: string) => {
            if (targetUser !== username && !peers.current[targetUser]) {
              console.log(`Found player ${targetUser} in room, initiating connection`);
              createPeer(targetUser, true);
            } else {
              console.log(`Already connected to ${targetUser}`);
            }
          });

          if (players.length > 0) {
            outPutRef.current(`Found ${players.length} other player(s) in the room:`, false);
            players.forEach((player: string) => {
              outPutRef.current(`- ${player}`, false);
            });
          } else {
            outPutRef.current("No other players are currently in this room.", false);
          }
        });
      }

      // Also check blockchain for recent movements
      const accountHistory = await client.database.getAccountHistory(config.game.accountName, -1, 100);
      
      // Create a Set from roomdata.players to avoid duplicates
      const playersInRoom = new Set(roomdata.players);

      // First pass: Find all players who have moved to this room
      for (const [, op] of accountHistory) {
        if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
          try {
            const jsonData = JSON.parse(op.op[1].json);
            if (jsonData.move_to && 
                jsonData.move_to.Location.permlink === currentLocation.permlink &&
                jsonData.move_to.Location.author === currentLocation.author) {
              const playerUsername = op.op[1].required_posting_auths[0];
              if (playerUsername !== username) {
                console.log('Found player in room from blockchain:', playerUsername);
                playersInRoom.add(playerUsername); // Add new player to the set
              }
            }
          } catch (error) {
            console.error('Error parsing operation JSON:', error);
          }
        }
      }

      // Convert Set back to Array for state update
      const newPlayers = Array.from(playersInRoom);
      
      // Only update if the player list has actually changed
      if (JSON.stringify(newPlayers) !== JSON.stringify(roomdata.players)) {
        console.log('Room players changed, updating:', newPlayers);
        setRoomData(prev => ({
          ...prev,
          players: newPlayers // Update players with the new list
        }));

        // Sync with signaling server only if there's a change
        if (signalingSocket.current) {
          const roomId = `${currentLocation.author}/${currentLocation.permlink}`;
          signalingSocket.current.emit('updateRoom', {
            room: roomId,
            username,
            roomData: {
              ...roomdata,
              players: newPlayers, // Ensure no duplicates
              lastUpdated: Date.now()
            }
          });
          currentRoomIdentifier.current = roomId;
        }

        // Connect to new players in the room
        newPlayers.forEach(targetUser => {
          if (targetUser !== username && !peers.current[targetUser]) {
            console.log(`Found player ${targetUser} in room, initiating connection`);
            createPeer(targetUser, true);
          } else {
            console.log(`Already connected to ${targetUser}`);
          }
        });

        if (newPlayers.length > 0) {
          outPutRef.current(`Found ${newPlayers.length} other player(s) in the room:`, false);
          newPlayers.forEach(player => {
            outPutRef.current(`- ${player}`, false);
          });
        } else {
          outPutRef.current("No other players are currently in this room.", false);
        }
      } else {
        console.log('No changes in room players, skipping update');
      }
    } catch (error) {
      console.error('Error updating room players:', error);
    }
  }, [username, createPeer, client, roomdata]);

  const displayRoom = useCallback((roomData: RoomData) => {
    // Display room title and description
    outPutRef.current(roomData.title, true);
    outPutRef.current(roomData.body, false);

    // Display present players (excluding only the current user)
    const presentPlayers = roomData.players.filter(p => p !== username);
    if (presentPlayers.length > 0) {
      outPutRef.current(`Found ${presentPlayers.length} other player(s) in the room:`, false);
      presentPlayers.forEach(player => {
        outPutRef.current(`- ${player}`, false);
      });
    } else {
      outPutRef.current("No other players are currently in this room.", false);
    }

    // Display exits
    if (roomData.exits && Object.keys(roomData.exits).length > 0) {
      outPutRef.current("There is a way to leave: ", false);
      Object.keys(roomData.exits).forEach(exit => {
        outPutRef.current(exit, true);
      });
    }
  }, [username, outPutRef]);
  
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
  
  // Update movePlayer to use displayRoom
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
      if (signalingSocket.current && currentRoomIdentifier.current && 
          currentRoomIdentifier.current !== newRoomId) {
        console.log('Leaving room:', currentRoomIdentifier.current);
        signalingSocket.current.emit('leaveRoom', { 
          username, 
          room: currentRoomIdentifier.current 
        });
        destroyAllPeersRef.current();
      }

      let currentMetadata = userProfileJSON;
      const currentPlayerData = currentMetadata || {};

      let movedPlayer = {
        "Location": options?.newlocation ?? currentPlayerData.Location ?? { "permlink": "genesis-scaffold-precipice", "author": "raymonjohnstone" }
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
        console.log('Waiting for blockchain confirmation of move operation:', operationId);
        
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
              console.error('Error checking operation confirmation:', error);
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
          console.log('Move operation confirmed on blockchain');
          
          // Now that the operation is confirmed, update the room state
          await updateRoomPlayers(movedPlayer.Location);
          
          // Only notify signaling server if we've actually changed rooms
          if (signalingSocket.current && currentRoomIdentifier.current !== newRoomId) {
            console.log('Joining new room:', newRoomId);
            // Get the current room data before joining
            const currentRoomdata = roomdataRef.current;
            signalingSocket.current.emit('joinRoom', {
              room: newRoomId,
              username,
              roomData: {
                ...currentRoomdata,
                players: [...currentRoomdata.players, username],
                lastUpdated: Date.now()
              }
            });
            currentRoomIdentifier.current = newRoomId;
          }
          
          setLastKnownLocation(movedPlayer.Location);
          
          // Fetch and display the new room data
          try {
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
              "body": transactionData.body,
              "title": transactionData.title,
              "players": [...roomdata.players],
              "details": transformedDetails,
              "exits": gameJSON[movedPlayer.Location.permlink]?.exits || {},
              "author": movedPlayer.Location.author,
              "permlink": movedPlayer.Location.permlink
            };
            
            setRoomData(newRoomData);
            displayRoom(newRoomData);
          } catch (error) {
            console.error('Error fetching new room data:', error);
            outPutRef.current('Error: Failed to fetch new room data. Please try the look command.', true);
          }
          
          return movedPlayer;
        } catch (error) {
          console.error('Error waiting for operation confirmation:', error);
          outPutRef.current('Error: Move operation not confirmed. Please try again.', true);
          throw error; // Re-throw to be caught by outer try-catch
        }
      } else {
        const message = "Error: Failed to update player data. Please check your Keychain and try again.";
        console.error("Broadcast failed:", { result });
        console.error("Broadcast result details:", JSON.stringify(result));
        outPutRef.current(message, true);
        throw new Error(message);
      }
    } catch (error: unknown) {
      const message = `Error updating account metadata: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message, error);
      outPutRef.current(message, true);
      throw error; // Re-throw to be caught by the caller
    } finally {
      setLoading(false); // Ensure loading state is cleared in all cases
    }
  }, [keychain, userProfileJSON, lastKnownLocation, parseDetailString, updateRoomPlayers, client, gameJSON, roomdata, displayRoom]);

  const fetchPlayerData = useCallback(async (username: string) => {
    try {
      setLoading(true);
      const playerLocation = await traceUserActivity(username, "move_to");
      const accountInfo = await client.database.getAccounts([username]);

      if (accountInfo.length === 0) {
        const message = "Account does not exist on the Hive blockchain.";
        console.error(message);
        outPutRef.current(message, true);
        setLoading(false);
        return;
      }

      const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
      setuserProfileJSON(currentMetadata);

      let currentRoomPermlink: string;
      let currentRoomAuthor: string;

      if (!playerLocation || !playerLocation.Location) {
        const message = "Welcome to the game! You don't seem to have a location yet, so you start at the beginning.";
        console.warn(message);
        outPutRef.current(message, true);
        currentRoomPermlink = "genesis-scaffold-precipice";
        currentRoomAuthor = "raymonjohnstone";
      } else {
        currentRoomPermlink = playerLocation.Location.permlink;
        currentRoomAuthor = playerLocation.Location.author;
      }

      const transactionData = await client.database.call('get_content', [currentRoomAuthor, currentRoomPermlink]);
      const roomDetailsReplies = await client.database.call('get_content_replies', [currentRoomAuthor, currentRoomPermlink]);

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

      let obtaineddata: RoomData = {
        "body": transactionData.body,
        "title": transactionData.title,
        "players": [...roomdata.players],
        "details": transformedDetails,
        "exits": gameJSON[currentRoomPermlink]?.exits || {},
        "author": currentRoomAuthor,
        "permlink": currentRoomPermlink
      };
      setRoomData(obtaineddata);
      displayRoom(obtaineddata);
    } catch (error) {
      console.error('Error fetching player data:', error);
      outPutRef.current(`Error fetching player data: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setLoading(false);
    }
  }, [client, gameJSON, traceUserActivity, parseDetailString, roomdata, displayRoom]);


  const debouncedFetchPlayerData = useMemo(
    () => {
      const debouncedFn = debounce((username: string) => {
        fetchPlayerData(username);
      }, 400);
      return debouncedFn;
    },
    [fetchPlayerData]
    );

  useEffect(() => {
    return () => {
      if (debouncedFetchPlayerData) {
        debouncedFetchPlayerData.cancel();
      }
    };
  }, [debouncedFetchPlayerData]);

  const updatePlayerDesc = useCallback(async (username: string, options?: {
    desc?: string,
    shortdesc?: string,
  }) => {
    setLoading(true); //start loading
    
    try {
      let currentMetadata = userProfileJSON;
      const currentPlayerData = currentMetadata.egodeathplayer || {};

      currentMetadata.egodeathplayer = {
        "Name": username,
        "Description": options?.desc ?? currentPlayerData.Description ?? "We really should define this but oh well.",
        "ShortDesc": options?.shortdesc ?? currentPlayerData.ShortDesc ?? "How do you imagine we have a short if we don't a long?",
      };

      const broadcastData = {
        "username": username,
        "operations": [
          [
            "account_update2",
            {
              "account": username,
              "json_metadata": "",
              "posting_json_metadata": JSON.stringify(currentMetadata)
            }
          ]
        ],
        'method': KeychainKeyTypes.posting
      };
      
      const result = await keychain.broadcast(broadcastData as unknown as Broadcast);
      
      if (result && result.success && result.result && result.result.id) {
        setuserProfileJSON(currentMetadata);
        setLoading(false); //stop loading
        return true;
      } else {
        const message = "Error: Failed to update player data. Please check your Keychain and try again.";
        console.error("Broadcast failed:", { result });
        console.error("Broadcast result details:", JSON.stringify(result));
        outPutRef.current(message, true);
        setLoading(false); //stop loading
        return false;
      }
    } catch (error: unknown) {
      const message = `Error updating account metadata: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message, error);
      outPutRef.current(message, true);
      setLoading(false); //stop loading
      return false;
    }
  }, [keychain, userProfileJSON]);

  const handleCommand = useCallback(async (enteredText: string) => {
    const words = enteredText.toLowerCase().split(" ");
    const command = words[0];
    if (!isSignedIn || !username) {
      outPutRef.current("Please log in first.", true);
      return;
    }

    switch (command) {
      case "@describe":
        const description = words.slice(1).join(" ");
        const updateOptionsDesc = { desc: description };
        await updatePlayerDesc(username, updateOptionsDesc);
        outPutRef.current("Your description has been updated.", false);
        break;

      case "@describeshort":
        const shortdescription = words.slice(1).join(" ");
        const updateOptionsShort = { shortdesc: shortdescription };
        await updatePlayerDesc(username, updateOptionsShort);
        outPutRef.current("Your short description has been updated.", false);
        break;

      case "look":
        if (words[1] === 'self' || words[1] === 'me') {
          if (userProfileJSON && userProfileJSON.egodeathplayer) {
            outPutRef.current(`You see yourself.  ${userProfileJSON.egodeathplayer.Description}`, false);
            outPutRef.current(`Short description: ${userProfileJSON.egodeathplayer.ShortDesc}`, false);
          }
          else {
            outPutRef.current("You look at yourself, but don't see anything special.", true);
          }
        }
        else if (roomdata) {
          displayRoom(roomdata);
        } else {
          outPutRef.current("Error: Room data not available.", true);
        }
        break;

      case "say":
        const messageToSend = words.slice(1).join(" ");
        if (!messageToSend) {
          outPutRef.current("Say what?", true);
          break;
        }
        outPutRef.current(`You say: ${messageToSend}`, false); // Echo to self
        
        // Send chat message to room
        if (signalingSocket.current && roomdata) {
          const roomId = `${roomdata.author}/${roomdata.permlink}`;
          console.log('Sending chat message to room:', roomId, messageToSend);
          signalingSocket.current.emit('chat', {
            room: roomId,
            username,
            message: messageToSend
          });
        }
        break;

      case "emote":
        const emoteText = words.slice(1).join(" ");
        if (!emoteText) {
          outPutRef.current("Emote what?", true);
          break;
        }
        outPutRef.current(`You ${emoteText}`, false); // Echo to self
        
        // Send emote to room
        if (signalingSocket.current && roomdata) {
          const roomId = `${roomdata.author}/${roomdata.permlink}`;
          console.log('Sending emote to room:', roomId, emoteText);
          signalingSocket.current.emit('emote', {
            room: roomId,
            username,
            emote: emoteText
          });
        }
        break;

      default:
        if (roomdata && roomdata.exits && roomdata.exits[command]) {
          const newlocation = roomdata.exits[command];
          try {
            const updateSuccess = await movePlayer(username, {
              newlocation: {
                permlink: newlocation,
                author: gameJSON[roomdata.exits[command]].author,
              },
            });
            outPutRef.current(`You traipse off towards ${command}.`, false);
            if (updateSuccess) {
              setLastKnownLocation(updateSuccess.Location);
            }
          } catch (error) {
            const message = `Error moving player: ${error instanceof Error ? error.message : String(error)}`;
            console.error(message);
            outPutRef.current(message, true);
          }
        } else if (roomdata && roomdata.exits && !(command in roomdata.exits)) {
          outPutRef.current("Error: Invalid destination.", true);
        } else {
          outPutRef.current("Unknown command.", true);
        }
        break;
    }
  }, [isSignedIn, username, roomdata, movePlayer, gameJSON, updatePlayerDesc, userProfileJSON, displayRoom]);

  const handleTextEntered = useCallback(async (enteredText: string) => {
    try {
      const words = enteredText.toLowerCase().split(" ");
      if (words[0] === "login" || words[0] === "connect") {
        const tempuser = words[1];
        if (tempuser === undefined) {
          outPutRef.current('You must follow your login/connect command with your hive username.', true);
          return;
        }

        outPutRef.current(`Attempting login as ${tempuser}`, false);
        setGeneralError(null);

        const data: Login = {
          username: tempuser,
          message: '{"login":"123"}',
          method: KeychainKeyTypes.posting,
          title: 'Login',
        };
        
        try {
          const loginResult = await keychain.login(data as Login);
          
          if (loginResult) {
            setUsername(tempuser);
            setIsSignedIn(true);
            try {
              await fetchPlayerData(tempuser);
              outPutRef.current(`Login successful as ${tempuser}`, false);
              
              // Check if the user is a builder
              if (builders.includes(tempuser)) {
                setIsBuilder(true);
              } else {
                setIsBuilder(false);
              }

              // Ensure socket is connected and join initial room
              if (signalingSocket.current) {
                const currentRoomdata = roomdataRef.current;
                if (currentRoomdata?.author && currentRoomdata?.permlink) {
                  const roomId = `${currentRoomdata.author}/${currentRoomdata.permlink}`;
                  console.log('Joining initial room on login:', roomId);
                  signalingSocket.current.emit('joinRoom', {
                    room: roomId,
                    username: tempuser,
                    roomData: {
                      ...currentRoomdata,
                      players: [...currentRoomdata.players, tempuser],
                      lastUpdated: Date.now()
                    }
                  });
                  currentRoomIdentifier.current = roomId;
                }
              }
            } catch (fetchError) {
              const message = `Failed to fetch player data after login: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
              console.error(message, fetchError);
              setGeneralError(message);
              outPutRef.current(message, true);
              setIsSignedIn(false);
              setUsername(null);
              return;
            }
          } else {
            const message = 'Login failed, keychain returned false';
            setIsSignedIn(false);
            setUsername(null);
            setGeneralError(message);
            console.error(message);
            outPutRef.current(message, true);
          }
        } catch (loginError) {
          const message = `Keychain login error: ${loginError instanceof Error ? loginError.message : String(loginError)}`;
          console.error(message, loginError);
          setGeneralError(message);
          outPutRef.current(message, true);
          setIsSignedIn(false);
          setUsername(null);
        }
      } else {
        if (isSignedIn) {
          outPutRef.current(`Executing command: ${enteredText}`, false);
          await handleCommand(enteredText);
        } else {
          const message = 'You must log in before executing commands.';
          setGeneralError(message);
          console.error(message);
          outPutRef.current(message, true);
        }
      }
    } catch (error) {
      const message = `An error occurred: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message, error);
      setGeneralError(message);
      outPutRef.current(message, true);
      setIsSignedIn(false);
      setUsername(null);
    }
  }, [keychain, fetchPlayerData, handleCommand, isSignedIn, builders]);

  useEffect(() => {
    if (generalError) {
      console.log("The process encountered an error: ", generalError);
    }
  }, [generalError]);

  const handleSignOut = () => {
    setIsSignedIn(false);
    setUsername(null);
    setuserProfileJSON({});
  };
  if (!userGreeted && !isSignedIn) {
    gameGreeting.forEach((item, index) => {
      outPutRef.current(item, false);
    });
    setUserGreeted(true);
  };

  // Memoize the socket setup function with minimal dependencies
  const setupSignalingSocket = useCallback(() => {
    if (!username || isSettingUpSocket.current || signalingSocket.current?.connected) {
      return;
    }

    console.log('Initializing signaling connection for user:', username);
    isSettingUpSocket.current = true;
    
    // Clean up any existing socket
    if (signalingSocket.current) {
      signalingSocket.current.removeAllListeners();
      signalingSocket.current.disconnect();
      signalingSocket.current = null;
    }

    const socket = createSignalingSocket(username);
    signalingSocket.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      retryCount.current = 0;
      isSettingUpSocket.current = false;
      
      const currentRoomdata = roomdataRef.current;
      if (currentRoomdata?.author && currentRoomdata?.permlink && username) {
        const roomId = `${currentRoomdata.author}/${currentRoomdata.permlink}`;
        
        // First request current room state
        socket.emit('getRoomState', { room: roomId });
        
        // Then join the room
        socket.emit('joinRoom', {
          room: roomId,
          username,
          roomData: {
            ...currentRoomdata,
            players: [...currentRoomdata.players, username],
            lastUpdated: Date.now()
          }
        });
        currentRoomIdentifier.current = roomId;
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from signaling server:', reason);
      if (!isUnmounted.current && reason !== 'io client disconnect') {
        setTimeout(setupSignalingSocket, 1000);
      }
    });

    socket.on('signal', ({ from, signal }) => {
      handleIncomingSignalRef.current({ from, signal });
    });

    socket.on('roomJoined', ({ room, players }: { room: string, players: string[] }) => {
      const currentRoomdata = roomdataRef.current;
      if (room === `${currentRoomdata.author}/${currentRoomdata.permlink}`) {
        // Update room data first
        setRoomData(prev => ({
          ...prev,
          players: players.filter((p: string) => p !== username)
        }));

        // Then establish peer connections
        players.forEach((targetUser: string) => {
          if (targetUser !== username && !peers.current[targetUser]) {
            createPeer(targetUser, true);
          }
        });
      }
    });

    socket.on('roomUpdate', ({ room, players }: { room: string, players: string[] }) => {
      const currentRoomdata = roomdataRef.current;
      if (room === `${currentRoomdata.author}/${currentRoomdata.permlink}`) {
        // Get current players excluding self
        const currentPlayers = currentRoomdata.players.filter(p => p !== username);
        // Get new players excluding self
        const newPlayers = players.filter(p => p !== username);

        // Only update if there's an actual change in players
        if (JSON.stringify(currentPlayers) !== JSON.stringify(newPlayers)) {
          // Find players who joined
          const joinedPlayers = newPlayers.filter(p => !currentPlayers.includes(p));
          // Find players who left
          const leftPlayers = currentPlayers.filter(p => !newPlayers.includes(p));

          // Display messages only for actual changes
          joinedPlayers.forEach(player => {
            outPutRef.current(`${player} has entered the room.`, false);
          });
          leftPlayers.forEach(player => {
            outPutRef.current(`${player} has left the room.`, false);
          });

          // Update room data
          setRoomData(prev => ({
            ...prev,
            players: newPlayers
          }));

          // Handle peer connections
          const currentPeers = new Set(Object.keys(peers.current));
          const newPeers = new Set(newPlayers);

          // Create new peer connections
          newPeers.forEach((targetUser: string) => {
            if (targetUser !== username && !currentPeers.has(targetUser)) {
              createPeer(targetUser, true);
            }
          });

          // Remove old peer connections
          currentPeers.forEach((targetUser: string) => {
            if (!newPeers.has(targetUser)) {
              destroyPeer(targetUser);
            }
          });
        }
      }
    });

    socket.on('playerJoined', ({ room, username: newPlayer, players }: { room: string, username: string, players: string[] }) => {
      const currentRoomdata = roomdataRef.current;
      if (room === `${currentRoomdata.author}/${currentRoomdata.permlink}`) {
        outPutRef.current(`${newPlayer} has entered the room.`, false);
        
        // Update room data
        setRoomData(prev => ({
          ...prev,
          players: players.filter((p: string) => p !== username)
        }));

        // Create peer connection with new player
        if (newPlayer !== username && !peers.current[newPlayer]) {
          createPeer(newPlayer, true);
        }
      }
    });

    socket.on('roomState', ({ room, players }: { room: string, players: string[] }) => {
      const currentRoomdata = roomdataRef.current;
      if (room === `${currentRoomdata.author}/${currentRoomdata.permlink}`) {
        // Update room data first
        setRoomData(prev => ({
          ...prev,
          players: players.filter((p: string) => p !== username)
        }));

        // Then establish peer connections
        const currentPeers = new Set(Object.keys(peers.current));
        const newPeers = new Set(players.filter((p: string) => p !== username));

        // Create new peer connections
        newPeers.forEach((targetUser: string) => {
          if (targetUser !== username && !currentPeers.has(targetUser)) {
            createPeer(targetUser, true);
          }
        });

        // Remove old peer connections
        currentPeers.forEach((targetUser: string) => {
          if (!newPeers.has(targetUser)) {
            destroyPeer(targetUser);
          }
        });
      }
    });

    socket.on('chat', ({ username: sender, message }) => {
      outPutRef.current(`[${sender}]: ${message}`, false);
    });

    socket.on('emote', ({ username: sender, emote }) => {
      outPutRef.current(`[P2P] ${sender} ${emote}`, false);
    });

    socket.connect();

    return () => {
      isUnmounted.current = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        signalingSocket.current = null;
      }
      isSettingUpSocket.current = false;
      destroyAllPeersRef.current();
    };
  }, [username, createPeer, destroyPeer]);

  // Use the memoized setup function
  useEffect(() => {
    const cleanup = setupSignalingSocket();
    return cleanup;
  }, [setupSignalingSocket]);

  // Update the blockchain stream handler to be more precise about room updates
  useEffect(() => {
    let stream: any = null;
    let isStreamActive = true;

    const setupStream = () => {
      if (!isStreamActive) return;
      
      console.log('Setting up blockchain operations stream');
      stream = client.blockchain.getOperationsStream();
      
      const handleOperation = async (op: StreamOperation) => {
        if (!isStreamActive) return;
        
        if (op.op[1].id === config.game.idName) {
          console.log('Received game operation:', op.op[1].json);
          if (processedOperations.has(op.trx_id)) {
            console.log('Operation already processed:', op.trx_id);
            return;
          }
          processedOperations.add(op.trx_id);
          try {
            const jsonData = JSON.parse(op.op[1].json);
            const newLocation = jsonData.move_to;
            const playerUsername = op.op[1].required_posting_auths[0];

            console.log('Processing move_to operation:', {
              player: playerUsername,
              newLocation,
              currentLocation: lastKnownLocation
            });

            // Skip if this is our own operation and we're already processing it
            if (username === playerUsername && isSignedIn) {
              if (newLocation && (!lastKnownLocation || 
                  newLocation.permlink !== lastKnownLocation.permlink || 
                  newLocation.author !== lastKnownLocation.author)) {
                console.log('Current user moved to new location:', newLocation);
                try {
                  setLoading(true);
                  await debouncedFetchPlayerData(username);
                  setLastKnownLocation(newLocation.Location);
                  await updateRoomPlayers(newLocation.Location);
                } finally {
                  setLoading(false);
                }
              }
              return;
            }

            // Handle other players' movement
            if (newLocation && lastKnownLocation && 
                newLocation.Location.permlink === lastKnownLocation.permlink && 
                newLocation.Location.author === lastKnownLocation.author) {
              if (!roomdata.players.includes(playerUsername)) {
                console.log(`${playerUsername} entered the room`);
                outPutRef.current(`${playerUsername} has entered the room.`, false);
                setRoomData(prev => ({
                  ...prev,
                  players: [...prev.players, playerUsername]
                }));
                createPeer(playerUsername, true);
              }
            } 
            else if (newLocation && lastKnownLocation && 
              (newLocation.Location.permlink !== lastKnownLocation.permlink || 
               newLocation.Location.author !== lastKnownLocation.author)) {
              // This condition checks if the player is leaving the room
              if (roomdata.players.includes(playerUsername)) {
                console.log(`${playerUsername} left the room`);
                outPutRef.current(`${playerUsername} has left the room.`, false);
                setRoomData(prev => ({
                  ...prev,
                  players: prev.players.filter(p => p !== playerUsername)
                }));
                destroyPeer(playerUsername);
              }
            }
          } catch (error) {
            console.error('Error processing operation:', error);
          }
        }
      };

      const handleError = (error: unknown) => {
        if (!isStreamActive) return;
        
        console.error('Stream error:', error);
        const baseDelay = 1000;
        const maxDelay = 30000;
        const exponentialFactor = 2;
        const retryDelay = Math.min(maxDelay, Math.pow(exponentialFactor, retryCount.current) * baseDelay);
        
        if (retryCount.current < 5) {
          retryCount.current++;
          console.log(`Retrying stream connection in ${retryDelay}ms (attempt ${retryCount.current})`);
          setTimeout(setupStream, retryDelay);
        } else {
          console.error('Max retry attempts reached');
        }
      };

      stream.on('data', handleOperation);
      stream.on('error', handleError);
      stream.on('end', () => {
        if (isStreamActive) {
          console.log('Stream ended, attempting to reconnect...');
          handleError(new Error('Stream ended'));
        }
      });
    };

    setupStream();

    return () => {
      isStreamActive = false;
      isUnmounted.current = true;
      processedOperations.clear();
      if (stream && typeof stream.destroy === 'function') {
        try {
          stream.destroy();
        } catch (e) {
          console.error("Error destroying stream:", e);
        }
      }
    };
  }, [client, username, isSignedIn, roomdata, outPut, debouncedFetchPlayerData, lastKnownLocation, processedOperations, createPeer, destroyPeer, updateRoomPlayers]);

  // Update the button click handler
  const handleTopRightButtonClick = useCallback(() => {
    setIsButtonActive(prev => !prev);
    setIsBuildModalOpen(true);
  }, []);

  // Add modal close handler
  const handleCloseModal = useCallback(() => {
    setIsBuildModalOpen(false);
    setIsButtonActive(false);
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
        </div>
      </header>
      <GameOutputWindow output={gameOutputMessage} />
      <div className="TextInputBox">
        <TextInputBox onEnterPressed={handleTextEntered} />
      </div>
      <BuildModal 
        isOpen={isBuildModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}

export default App;