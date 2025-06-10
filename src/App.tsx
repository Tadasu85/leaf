import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import BuildButton from './components/BuildButton';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { io, Socket } from 'socket.io-client';
import Peer, { Instance as PeerInstance } from 'simple-peer';
import { Client } from '@hiveio/dhive';
import { debounce } from 'lodash';
import config from './config';
import BuildModal from './components/BuildModal';
import QueueButton from './components/QueueButton';
import QueueManagementModal from './components/QueueManagementModal';

// Interface for PeerConnection (refined)
interface PeerConnection {
  peer: PeerInstance;
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
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [isQueueButtonActive, setIsQueueButtonActive] = useState(false);
  const isFullyReady = useRef(false);
  const [isLoadingMove, setIsLoadingMove] = useState(false);

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
  const createPeer = useCallback((targetUsername: string, initiator: boolean = false) => {
    if (!username) {
      console.error('Cannot create peer without username');
      return;
    }

    console.log(`Creating peer connection to ${targetUsername} (initiator: ${initiator})`);
    
    // Check if peer already exists
    if (peers.current[targetUsername]) {
      console.log(`Peer connection to ${targetUsername} already exists`);
      return;
    }

    // Create new peer
    const peer = new Peer({
      initiator,
      trickle: false,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    // Store peer connection
    peers.current[targetUsername] = {
      peer,
      targetUsername,
      connected: false
    };

    // Handle peer events
    peer.on('signal', (signal) => {
      console.log(`Sending signal to ${targetUsername}:`, signal.type);
      if (signalingSocket.current?.connected) {
        signalingSocket.current.emit('signal', {
          from: username,
          to: targetUsername,
          signal
        });
      } else {
        console.error('Cannot send signal: socket not connected');
      }
    });

    peer.on('connect', () => {
      console.log(`Peer connection established with ${targetUsername}`);
      if (peers.current[targetUsername]) {
        peers.current[targetUsername].connected = true;
        outPutRef.current(`[P2P] Connected to ${targetUsername}.`, false);
      }
    });

    peer.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString()) as P2PMessage;
        console.log(`Received P2P message from ${targetUsername}:`, message);
        
        if (message.type === 'chat') {
          outPutRef.current(`[${message.sender}]: ${message.payload}`, false);
        } else if (message.type === 'emote') {
          outPutRef.current(`[P2P] ${message.sender} ${message.payload}`, false);
        }
      } catch (error) {
        console.error('Error parsing P2P message:', error);
      }
    });

    peer.on('error', (error) => {
      console.error(`Peer connection error with ${targetUsername}:`, error);
      outPutRef.current(`[P2P Error] Connection error with ${targetUsername}: ${error.message}`, true);
      destroyPeer(targetUsername);
    });

    peer.on('close', () => {
      console.log(`Peer connection closed with ${targetUsername}`);
      outPutRef.current(`[P2P] Disconnected from ${targetUsername}.`, false);
      destroyPeer(targetUsername);
    });

    return peer;
  }, [username, destroyPeer]);

  // --- P2P Signaling Handlers ---
  const handleIncomingSignal = useCallback(({ from, signal }: { from: string, signal: any }) => {
    console.log(`Handling incoming signal from ${from}:`, signal.type);
    
    // Create peer if it doesn't exist
    if (!peers.current[from]) {
      console.log(`Creating new peer for ${from}`);
      createPeer(from, false);
    }

    // Forward signal to peer
    const peerConnection = peers.current[from];
    if (peerConnection) {
      console.log(`Forwarding signal to peer ${from}`);
      peerConnection.peer.signal(signal);
    } else {
      console.error(`No peer connection found for ${from}`);
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
        
        // Emit joinRoom to ensure the user is in the room
        console.log('[Debug] Emitting joinRoom (updateRoomPlayers)', { room: roomId, username, roomData: { ...roomdata, players: [...roomdata.players, username], lastUpdated: Date.now() } });
        signalingSocket.current.emit('joinRoom', {
          room: roomId,
          username,
          roomData: {
            ...roomdata,
            players: [...roomdata.players, username],
            lastUpdated: Date.now()
          }
        });

        // Use regular event listener instead of once
        signalingSocket.current.on('roomState', ({ room, players }: { room: string, players: string[] }) => {
          // Only process if this is for our current room
          if (room === roomId) {
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
          }
        });
      } else {
        console.log('No changes in room players, skipping update');
      }
    } catch (error) {
      console.error('Error updating room players:', error);
    }
  }, [username, createPeer, client, roomdata]);

  const displayRoom = useCallback(async (roomData: RoomData) => {
    // First get the current room state from the signaling server
    if (signalingSocket.current && roomData.author && roomData.permlink) {
      const roomId = `${roomData.author}/${roomData.permlink}`;
      console.log('[Room Debug] Requesting room state before display:', roomId);
      
      // Create a promise to wait for room state
      const roomStatePromise = new Promise<RoomData>((resolve) => {
        const handler = ({ room, players }: { room: string, players: string[] }) => {
          if (room === roomId) {
            console.log('[Room Debug] Received room state for display:', {
              room,
              players,
              currentPeers: Object.keys(peers.current)
            });

            // Filter out current user and ensure we only show connected players
            const connectedPlayers = players.filter(p => 
              p !== username && // Remove current user
              peers.current[p]?.connected // Only include connected peers
            );

            const updatedRoomData = {
              ...roomData,
              players: connectedPlayers
            };
            
            // Update state
            setRoomData(updatedRoomData);
            signalingSocket.current?.off('roomState', handler);
            resolve(updatedRoomData);
          }
        };
        signalingSocket.current?.on('roomState', handler);
        signalingSocket.current?.emit('getRoomState', { room: roomId });
      });

      // Wait for room state and use the updated data
      roomData = await roomStatePromise;
    }

    // Display room title and description
    outPutRef.current(roomData.title, true);
    outPutRef.current(roomData.body, false);

    // Display present players (excluding only the current user)
    const presentPlayers = roomData.players.filter(p => 
      p !== username && // Remove current user
      peers.current[p]?.connected // Only show connected players
    );

    if (presentPlayers.length > 0) {
      outPutRef.current(`Found ${presentPlayers.length} other player(s) in the room:`, false);
      presentPlayers.forEach(player => {
        outPutRef.current(`- ${player}`, false);
      });
    } else {
      outPutRef.current("No other players are currently in this room.", false);
    }

    // Display available exits
    if (roomData.exits && Object.keys(roomData.exits).length > 0) {
      outPutRef.current("Available exits:", false);
      Object.entries(roomData.exits).forEach(([direction, destination]) => {
        outPutRef.current(`- ${direction}`, false);
      });
    } else {
      outPutRef.current("There are no visible exits from this room.", false);
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
      setIsLoadingMove(true);
      const newRoomId = options?.newlocation ? 
        `${options.newlocation.author}/${options.newlocation.permlink}` : 
        `${lastKnownLocation?.author}/${lastKnownLocation?.permlink}`;

      // Only leave current room if we're actually changing rooms
      if (signalingSocket.current && currentRoomIdentifier.current && 
          currentRoomIdentifier.current !== newRoomId) {
        console.log('[Room Debug] Leaving room:', {
          from: currentRoomIdentifier.current,
          to: newRoomId,
          username
        });
        signalingSocket.current.emit('leaveRoom', { 
          username, 
          room: currentRoomIdentifier.current 
        });
        // Clean up all peer connections when changing rooms
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
          console.log('[Move Debug] Move operation confirmed:', {
            username,
            newLocation: movedPlayer.Location
          });
          
          // The blockchain operation is confirmed, so we can return
          // The blockchain stream handler will handle the room update and display
          return movedPlayer;
        } catch (error) {
          console.error('[Move Debug] Error waiting for operation confirmation:', error);
          outPutRef.current('Error: Move operation not confirmed. Please try again.', true);
          throw error;
        }
      } else {
        const message = "Error: Failed to update player data. Please check your Keychain and try again.";
        console.error("[Move Debug] Broadcast failed:", { result });
        console.error("[Move Debug] Broadcast result details:", JSON.stringify(result));
        outPutRef.current(message, true);
        throw new Error(message);
      }
    } catch (error: unknown) {
      const message = `Error updating account metadata: ${error instanceof Error ? error.message : String(error)}`;
      console.error("[Move Debug]", message, error);
      outPutRef.current(message, true);
      throw error;
    } finally {
      setLoading(false);
      setIsLoadingMove(false);
    }
  }, [keychain, userProfileJSON, lastKnownLocation, client.database]);

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
      
      // Update room data
      setRoomData(obtaineddata);
      
      // Only display room if this is not part of a move operation
      if (!isLoadingMove) {
        displayRoom(obtaineddata);
      }
    } catch (error) {
      console.error('Error fetching player data:', error);
      outPutRef.current(`Error fetching player data: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setLoading(false);
    }
  }, [client, gameJSON, traceUserActivity, parseDetailString, roomdata, displayRoom, isLoadingMove]);


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

  // Add helper function to send messages through peer connections
  const sendMessageToPeers = useCallback((message: P2PMessage) => {
    let sentToAny = false;
    Object.values(peers.current).forEach(({ peer, connected, targetUsername }) => {
      if (connected) {
        try {
          peer.send(JSON.stringify(message));
          sentToAny = true;
          console.log(`Sent ${message.type} to ${targetUsername}:`, message.payload);
        } catch (error) {
          console.error(`Failed to send ${message.type} to ${targetUsername}:`, error);
        }
      } else {
        console.log(`Skipping ${targetUsername} - peer not connected`);
      }
    });
    
    if (!sentToAny) {
      console.log('No connected peers to send message to');
    }
  }, []);

  // Modify the handleCommand function's say case
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
        console.log('Room data:', roomdata);
        console.log('Looking for:', words[1]);
        if (roomdata && roomdata.details) {
          console.log('Available details:', roomdata.details);
          console.log('Detail keys:', Object.keys(roomdata.details));
        }
        if (words[1] === 'self' || words[1] === 'me') {
          if (userProfileJSON && userProfileJSON.egodeathplayer) {
            outPutRef.current(`You see yourself.  ${userProfileJSON.egodeathplayer.Description}`, false);
            outPutRef.current(`Short description: ${userProfileJSON.egodeathplayer.ShortDesc}`, false);
          }
          else {
            outPutRef.current("You look at yourself, but don't see anything special.", true);
          }
        }
        else if (words[1]) {
          // Check if it's a detail in the room by matching against the full key
          if (roomdata && roomdata.details) {
            const searchTerm = words[1].toLowerCase();
            const matchingDetail = Object.entries(roomdata.details).find(([key]) => {
              return key.toLowerCase().includes(searchTerm);
            });
            
            if (matchingDetail) {
              outPutRef.current(matchingDetail[1], false);
            }
            // Check if it's another player in the room
            else if (roomdata.players.includes(words[1])) {
              // Fetch and display other player's description
              try {
                const accountInfo = await client.database.getAccounts([words[1]]);
                if (accountInfo.length > 0) {
                  const playerMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
                  if (playerMetadata.egodeathplayer) {
                    outPutRef.current(`You look at ${words[1]}.`, false);
                    outPutRef.current(playerMetadata.egodeathplayer.Description, false);
                  } else {
                    outPutRef.current(`You look at ${words[1]}, but don't see anything special.`, false);
                  }
                } else {
                  outPutRef.current(`You look at ${words[1]}, but don't see anything special.`, false);
                }
              } catch (error) {
                console.error('Error fetching player description:', error);
                outPutRef.current(`You look at ${words[1]}, but something prevents you from seeing clearly.`, true);
              }
            }
            else {
              outPutRef.current(`You don't see any ${words[1]} here.`, true);
            }
          }
          else if (roomdata && roomdata.players.includes(words[1])) {
            // Fetch and display other player's description
            try {
              const accountInfo = await client.database.getAccounts([words[1]]);
              if (accountInfo.length > 0) {
                const playerMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
                if (playerMetadata.egodeathplayer) {
                  outPutRef.current(`You look at ${words[1]}.`, false);
                  outPutRef.current(playerMetadata.egodeathplayer.Description, false);
                } else {
                  outPutRef.current(`You look at ${words[1]}, but don't see anything special.`, false);
                }
              } else {
                outPutRef.current(`You look at ${words[1]}, but don't see anything special.`, false);
              }
            } catch (error) {
              console.error('Error fetching player description:', error);
              outPutRef.current(`You look at ${words[1]}, but something prevents you from seeing clearly.`, true);
            }
          }
          else {
            outPutRef.current(`You don't see any ${words[1]} here.`, true);
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
        
        // Echo to self with consistent format
        outPutRef.current(`[${username}]: ${messageToSend}`, false);
        
        // Send message through peer connections
        const chatMessage: P2PMessage = {
          type: 'chat',
          payload: messageToSend,
          sender: username
        };
        sendMessageToPeers(chatMessage);
        break;

      case "emote":
        const emoteText = words.slice(1).join(" ");
        if (!emoteText) {
          outPutRef.current("Emote what?", true);
          break;
        }
        
        // Echo to self with consistent format
        outPutRef.current(`${username} ${emoteText}`, false);
        
        // Send emote through peer connections
        const emoteMessage: P2PMessage = {
          type: 'emote',
          payload: emoteText,
          sender: username
        };
        sendMessageToPeers(emoteMessage);
        break;

      default:
        if (roomdata && roomdata.exits && roomdata.exits[command]) {
          const newlocation = roomdata.exits[command];
          outPutRef.current(`You traipse off towards ${command}.`, false);
          try {
            const updateSuccess = await movePlayer(username, {
              newlocation: {
                permlink: newlocation,
                author: gameJSON[roomdata.exits[command]].author,
              },
            });
            
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
  }, [isSignedIn, username, client, roomdata, movePlayer, gameJSON, updatePlayerDesc, userProfileJSON, displayRoom, sendMessageToPeers]);

  const handleTextEntered = useCallback(async (enteredText: string) => {
    try {
      if (enteredText.startsWith('login') || enteredText.startsWith('connect')) {
        const words = enteredText.split(' ');
        if (words.length < 2) {
          outPutRef.current("You must follow your login/connect command with your hive username", true);
          return;
        }

        const tempuser = words[1];
        const loginData: Login = {
          username: tempuser,
          message: "Login to Ego Death",
          method: KeychainKeyTypes.posting
        };

        try {
          const result = await keychain.login(loginData);
          if (result && result.success) {
            setUsername(tempuser);
            setIsSignedIn(true);
            try {
              // Special handling for game account
              if (tempuser === config.game.accountName) {
                // Skip normal player data fetching for game account
                outPutRef.current(`Login successful as ${tempuser}`, false);
                setIsBuilder(true); // Game account is always a builder
              }
              else {
                const message = 'Login successful, fetching player data...';
                outPutRef.current(message, false);
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
                    console.log('[Debug] Emitting joinRoom (login)', { room: roomId, username: tempuser, roomData: { ...currentRoomdata, players: [...currentRoomdata.players, tempuser], lastUpdated: Date.now() } });
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
              }
            } catch (error) {
              const message = `Error fetching player data: ${error instanceof Error ? error.message : String(error)}`;
              console.error(message, error);
              setGeneralError(message);
              outPutRef.current(message, true);
              setIsSignedIn(false);
              setUsername(null);
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
  }, [keychain, builders, fetchPlayerData, handleCommand, isSignedIn ]);

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
      console.log(`[Socket Debug] Skipping socket setup:`, {
        hasUsername: !!username,
        isSettingUp: isSettingUpSocket.current,
        isConnected: signalingSocket.current?.connected
      });
      return;
    }

    console.log('[Socket Debug] Initializing signaling connection:', {
      username,
      currentPeers: Object.keys(peers.current)
    });
    isSettingUpSocket.current = true;
    
    // Clean up any existing socket
    if (signalingSocket.current) {
      console.log('[Socket Debug] Cleaning up existing socket');
      signalingSocket.current.removeAllListeners();
      signalingSocket.current.disconnect();
      signalingSocket.current = null;
    }

    const socket = createSignalingSocket(username);
    signalingSocket.current = socket;

    socket.on('connect', () => {
      console.log('[Socket Debug] Connected to signaling server:', {
        socketId: socket.id,
        username,
        currentPeers: Object.keys(peers.current)
      });
      retryCount.current = 0;
      isSettingUpSocket.current = false;
      
      // Register the user with the signaling server
      console.log('[Socket Debug] Registering user:', username);
      socket.emit('register', { username }, (response: { success: boolean }) => {
        console.log('[Socket Debug] Registration response:', response);
        if (response.success) {
          console.log('[Socket Debug] User registered successfully:', username);
          isFullyReady.current = true;
          
          // Re-establish room connection after registration
          const currentRoomdata = roomdataRef.current;
          if (currentRoomdata?.author && currentRoomdata?.permlink && username) {
            const roomId = `${currentRoomdata.author}/${currentRoomdata.permlink}`;
            
            console.log('[Socket Debug] Re-establishing room connection:', {
              roomId,
              currentPlayers: currentRoomdata.players
            });

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

            // Re-establish peer connections with all players in the room
            currentRoomdata.players.forEach((targetUser: string) => {
              if (targetUser !== username && !peers.current[targetUser]) {
                console.log(`[Socket Debug] Re-establishing peer connection:`, {
                  targetUser,
                  socketId: socket.id
                });
                createPeer(targetUser, true);
              }
            });
          }
        } else {
          console.error('[Socket Debug] Failed to register user:', username);
          // Retry registration after a short delay
          setTimeout(() => {
            console.log('[Socket Debug] Retrying registration for:', username);
            socket.emit('register', { username }, (response: { success: boolean }) => {
              console.log('[Socket Debug] Retry registration response:', response);
              if (response.success) {
                console.log('[Socket Debug] User registered successfully on retry:', username);
                isFullyReady.current = true;
                // Re-establish room connection after successful registration
                const currentRoomdata = roomdataRef.current;
                if (currentRoomdata?.author && currentRoomdata?.permlink && username) {
                  const roomId = `${currentRoomdata.author}/${currentRoomdata.permlink}`;
                  socket.emit('getRoomState', { room: roomId });
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
              }
            });
          }, 1000);
        }
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket Debug] Disconnected from signaling server:', {
        reason,
        username,
        currentPeers: Object.keys(peers.current)
      });
      isFullyReady.current = false;
      if (!isUnmounted.current && reason !== 'io client disconnect') {
        setTimeout(setupSignalingSocket, 1000);
      }
    });

    socket.on('signal', ({ from, signal }) => {
      console.log('[Socket Debug] Received signal:', {
        from,
        signalType: signal.type,
        isFullyReady: isFullyReady.current
      });
      if (!isFullyReady.current) {
        console.log('[Socket Debug] Ignoring signal - not fully ready:', {
          from,
          signalType: signal.type
        });
        return;
      }
      handleIncomingSignalRef.current({ from, signal });
    });

    socket.on('roomState', ({ room, players }: { room: string, players: string[] }) => {
      const currentRoomdata = roomdataRef.current;
      if (room === `${currentRoomdata.author}/${currentRoomdata.permlink}`) {
        console.log('[Socket Debug] Received room state update:', { room, players });
        
        // Update room data with players from signaling server
        setRoomData(prev => ({
          ...prev,
          players: players.filter((p: string) => p !== username)
        }));

        // Handle peer connections - ensure we connect to all players in the room
        const currentPeers = new Set(Object.keys(peers.current));
        const newPeers = new Set(players.filter((p: string) => p !== username));

        console.log('[Socket Debug] Peer connection status:', {
          currentPeers: Array.from(currentPeers),
          newPeers: Array.from(newPeers)
        });

        // Create peer connections for any players we're not connected to
        newPeers.forEach((targetUser: string) => {
          if (!currentPeers.has(targetUser)) {
            console.log(`[Socket Debug] Creating peer connection for ${targetUser} (reconnect)`);
            // Both users should try to initiate the connection
            createPeer(targetUser, true);
          }
        });

        // Remove peer connections for players who left
        currentPeers.forEach((targetUser: string) => {
          if (!newPeers.has(targetUser)) {
            console.log(`[Socket Debug] Removing peer connection for ${targetUser}`);
            destroyPeer(targetUser);
          }
        });

        // If we're the first to join, we should try to connect to all other players
        if (players.length > 1) {
          console.log('[Socket Debug] Multiple players in room, ensuring peer connections');
          players.forEach((targetUser: string) => {
            if (targetUser !== username && !currentPeers.has(targetUser)) {
              console.log(`[Socket Debug] Initiating peer connection to ${targetUser}`);
              createPeer(targetUser, true);
            }
          });
        }
      }
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
                  newLocation.Location.author !== lastKnownLocation.author)) {
                console.log('Current user moved to new location:', newLocation);
                try {
                  setLoading(true);
                  // Update the location
                  setLastKnownLocation(newLocation.Location);
                  
                  // Fetch the new room data
                  const transactionData = await client.database.call('get_content', [newLocation.Location.author, newLocation.Location.permlink]);
                  const roomDetailsReplies = await client.database.call('get_content_replies', [newLocation.Location.author, newLocation.Location.permlink]);

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
                    "players": [], // Start with empty players list, will be updated by room state
                    "details": transformedDetails,
                    "exits": gameJSON[newLocation.Location.permlink]?.exits || {},
                    "author": newLocation.Location.author,
                    "permlink": newLocation.Location.permlink
                  };
                  
                  // Update room data
                  setRoomData(newRoomData);
                  
                  // Update room players and display
                  await updateRoomPlayers(newLocation.Location);
                  await displayRoom(newRoomData);
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
  }, [client, displayRoom, username, isSignedIn, roomdata, outPut, debouncedFetchPlayerData, lastKnownLocation, processedOperations, createPeer, destroyPeer, updateRoomPlayers, gameJSON, parseDetailString]);

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

  // Add queue button click handler
  const handleQueueButtonClick = useCallback(() => {
    setIsQueueButtonActive(prev => !prev);
    setIsQueueModalOpen(true);
  }, []);

  // Add queue modal close handler
  const handleCloseQueueModal = useCallback(() => {
    setIsQueueModalOpen(false);
    setIsQueueButtonActive(false);
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
        <TextInputBox onEnterPressed={handleTextEntered} isLoading={isLoadingMove} />
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
        socket={signalingSocket.current}
      />
      <QueueManagementModal
        isOpen={isQueueModalOpen}
        onClose={handleCloseQueueModal}
        username={username}
        socket={signalingSocket.current}
      />
    </div>
  );
}

export default App;