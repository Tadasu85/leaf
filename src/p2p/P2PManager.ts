import { io, Socket } from 'socket.io-client';
import Peer, { Instance as PeerInstance } from 'simple-peer';

// --- Types ---
export interface P2PMessage {
  type: 'chat' | 'emote' | 'test';
  payload: any;
  sender: string;
}

export interface PeerConnection {
  peer: PeerInstance;
  targetUsername: string;
  connected: boolean;
  testMessageSent: boolean;
}

export interface P2PManagerConfig {
  username: string;
  onMessage: (message: P2PMessage) => void;
  onConnectionStatus: (username: string, connected: boolean) => void;
  onError: (error: string) => void;
  onRoomState: (roomId: string, players: string[]) => void;
}

// --- Socket Setup ---
const createSignalingSocket = (username: string) => {
  const socketUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:4001'
    : 'https://your-production-socket-url.com'; // Replace with your production URL

  const socket = io(socketUrl, {
    query: { username },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  return socket;
};

export class P2PManager {
  private peers: { [username: string]: PeerConnection } = {};
  private signalingSocket: Socket | null = null;
  private pendingMessages: { [username: string]: P2PMessage[] } = {};
  private isFullyReady = false;
  private isSettingUpSocket = false;
  private isUnmounted = false;
  private retryCount = 0;
  private currentRoomIdentifier: string | null = null;

  constructor(private config: P2PManagerConfig) {}

  // --- Public Methods ---
  public initialize() {
    this.setupSignalingSocket();
  }

  public destroy() {
    this.isUnmounted = true;
    this.destroyAllPeers();
    if (this.signalingSocket) {
      this.signalingSocket.removeAllListeners();
      this.signalingSocket.disconnect();
      this.signalingSocket = null;
    }
  }

  public sendMessage(message: P2PMessage) {
    console.log('[Peer Debug] Attempting to send message:', {
      type: message.type,
      payload: message.payload,
      currentPeers: Object.entries(this.peers).map(([user, conn]) => ({
        user,
        connected: conn.connected
      }))
    });

    let sentToAny = false;
    Object.values(this.peers).forEach(({ peer, connected, targetUsername }) => {
      try {
        if (connected) {
          const messageStr = JSON.stringify(message);
          console.log(`[Peer Debug] Sending message to ${targetUsername}:`, messageStr);
          peer.send(messageStr);
          sentToAny = true;
        } else {
          console.log(`[Peer Debug] Peer ${targetUsername} not connected, storing message`);
          if (!this.pendingMessages[targetUsername]) {
            this.pendingMessages[targetUsername] = [];
          }
          this.pendingMessages[targetUsername].push(message);
        }
      } catch (error) {
        console.error(`[Peer Debug] Failed to send message to ${targetUsername}:`, error);
        if (!this.pendingMessages[targetUsername]) {
          this.pendingMessages[targetUsername] = [];
        }
        this.pendingMessages[targetUsername].push(message);
      }
    });
    
    if (!sentToAny) {
      console.log('[Peer Debug] No connected peers to send message to');
    }
  }

  public joinRoom(roomId: string, players: string[]) {
    if (this.signalingSocket?.connected) {
      console.log('[Room Debug] Joining room:', { roomId, players });
      this.currentRoomIdentifier = roomId;
      
      // Emit joinRoom event
      this.signalingSocket.emit('joinRoom', {
        room: roomId,
        username: this.config.username,
        roomData: {
          players,
          lastUpdated: Date.now()
        }
      });

      // Request current room state
      this.signalingSocket.emit('getRoomState', { room: roomId });
      
      // Connect to all players in the room
      players.forEach(targetUser => {
        if (targetUser !== this.config.username && !this.peers[targetUser]) {
          console.log(`[Peer Debug] Creating peer connection for ${targetUser}`);
          this.createPeer(targetUser, true);
        }
      });
    }
  }

  public leaveRoom() {
    if (this.signalingSocket?.connected && this.currentRoomIdentifier) {
      console.log('[Room Debug] Leaving room:', this.currentRoomIdentifier);
      this.signalingSocket.emit('leaveRoom', { 
        username: this.config.username, 
        room: this.currentRoomIdentifier 
      });
      this.currentRoomIdentifier = null;
      this.destroyAllPeers();
    }
  }

  // --- Private Methods ---
  private setupSignalingSocket() {
    if (!this.config.username || this.isSettingUpSocket || this.signalingSocket?.connected) {
      return;
    }

    console.log('[Socket Debug] Initializing signaling connection:', {
      username: this.config.username,
      currentPeers: Object.keys(this.peers)
    });
    this.isSettingUpSocket = true;
    
    // Clean up any existing socket
    if (this.signalingSocket) {
      this.signalingSocket.removeAllListeners();
      this.signalingSocket.disconnect();
      this.signalingSocket = null;
    }

    const socket = createSignalingSocket(this.config.username);
    this.signalingSocket = socket;

    socket.on('connect', () => {
      console.log('[Socket Debug] Connected to signaling server:', {
        socketId: socket.id,
        username: this.config.username,
        currentPeers: Object.keys(this.peers)
      });
      this.retryCount = 0;
      this.isSettingUpSocket = false;
      
      // Register the user with the signaling server
      socket.emit('register', { username: this.config.username }, (response: { success: boolean }) => {
        if (response.success) {
          console.log('[Socket Debug] User registered successfully:', this.config.username);
          this.isFullyReady = true;
        } else {
          console.error('[Socket Debug] Failed to register user:', this.config.username);
          setTimeout(() => {
            socket.emit('register', { username: this.config.username }, (response: { success: boolean }) => {
              if (response.success) {
                console.log('[Socket Debug] User registered successfully on retry:', this.config.username);
                this.isFullyReady = true;
              }
            });
          }, 1000);
        }
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket Debug] Disconnected from signaling server:', {
        reason,
        username: this.config.username,
        currentPeers: Object.keys(this.peers)
      });
      this.isFullyReady = false;
      if (!this.isUnmounted && reason !== 'io client disconnect') {
        setTimeout(() => this.setupSignalingSocket(), 1000);
      }
    });

    socket.on('signal', ({ from, signal }) => {
      console.log('[Socket Debug] Received signal:', {
        from,
        signalType: signal.type,
        isFullyReady: this.isFullyReady
      });
      if (!this.isFullyReady) {
        return;
      }
      this.handleIncomingSignal({ from, signal });
    });

    socket.on('roomState', ({ room, players }: { room: string, players: string[] }) => {
      console.log('[Socket Debug] Received room state:', { room, players });
      if (room === this.currentRoomIdentifier) {
        this.config.onRoomState(room, players);
      }
    });

    socket.on('playerJoined', ({ room, username: joinedUsername, players }) => {
      console.log('[Socket Debug] Player joined:', { room, joinedUsername, players });
      if (room === this.currentRoomIdentifier) {
        this.config.onMessage({
          type: 'chat',
          payload: `${joinedUsername} has entered the room.`,
          sender: 'system'
        });
        this.config.onRoomState(room, players);
      }
    });

    socket.on('playerLeft', ({ room, username: leftUsername, players }) => {
      console.log('[Socket Debug] Player left:', { room, leftUsername, players });
      if (room === this.currentRoomIdentifier) {
        this.config.onMessage({
          type: 'chat',
          payload: `${leftUsername} has left the room.`,
          sender: 'system'
        });
        this.config.onRoomState(room, players);
      }
    });

    socket.on('roomUpdate', ({ room, players }) => {
      console.log('[Socket Debug] Room update:', { room, players });
      if (room === this.currentRoomIdentifier) {
        this.config.onRoomState(room, players);
      }
    });

    socket.connect();
  }

  private createPeer(targetUsername: string, initiator: boolean = false) {
    if (!this.config.username) {
      console.error('[Peer Debug] Cannot create peer without username');
      return;
    }

    console.log(`[Peer Debug] Creating peer connection to ${targetUsername}`, {
      initiator,
      currentPeers: Object.keys(this.peers),
      isFullyReady: this.isFullyReady,
      socketConnected: this.signalingSocket?.connected
    });
    
    // Check if peer already exists and is not destroyed
    if (this.peers[targetUsername]) {
      const existingPeer = this.peers[targetUsername];
      if (!existingPeer.peer.destroyed) {
        console.log(`[Peer Debug] Peer connection to ${targetUsername} already exists and is active`);
        return;
      } else {
        console.log(`[Peer Debug] Cleaning up destroyed peer connection to ${targetUsername}`);
        try {
          existingPeer.peer.destroy();
        } catch (error) {
          console.error(`[Peer Debug] Error cleaning up destroyed peer ${targetUsername}:`, error);
        }
        delete this.peers[targetUsername];
      }
    }

    // Create new peer with explicit data channel options
    const peer = new Peer({
      initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      },
      channelConfig: {
        ordered: true,
        maxRetransmits: 3
      },
      objectMode: false
    });

    // Store peer connection
    this.peers[targetUsername] = {
      peer,
      targetUsername,
      connected: false,
      testMessageSent: false
    };

    // Handle peer events
    peer.on('signal', (signal) => {
      if (peer.destroyed) {
        console.log(`[Peer Debug] Skipping signal for destroyed peer ${targetUsername}`);
        return;
      }

      if (this.signalingSocket?.connected) {
        try {
          this.signalingSocket.emit('signal', {
            from: this.config.username,
            to: targetUsername,
            signal
          });
        } catch (error) {
          console.error(`[Peer Debug] Error sending signal to ${targetUsername}:`, error);
        }
      }
    });

    peer.on('connect', () => {
      console.log(`[Peer Debug] Peer connection established with ${targetUsername}`);
      
      if (this.peers[targetUsername]) {
        this.peers[targetUsername].connected = true;
        this.config.onConnectionStatus(targetUsername, true);
        
        // Only send test message if we're the initiator and haven't sent one yet
        if (initiator && !this.peers[targetUsername].testMessageSent) {
          try {
            const testMessage = {
              type: 'test',
              payload: 'connection test',
              sender: this.config.username
            };
            peer.send(JSON.stringify(testMessage));
            this.peers[targetUsername].testMessageSent = true;
          } catch (error) {
            console.error(`[Peer Debug] Failed to send test message to ${targetUsername}:`, error);
          }
        }
        
        // Send any pending messages
        if (this.pendingMessages[targetUsername]) {
          this.pendingMessages[targetUsername].forEach(message => {
            try {
              peer.send(JSON.stringify(message));
            } catch (error) {
              console.error(`[Peer Debug] Failed to send pending message to ${targetUsername}:`, error);
            }
          });
          delete this.pendingMessages[targetUsername];
        }
      }
    });

    peer.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString()) as P2PMessage;
        
        if (message.type === 'test') {
          // Only send response if we haven't sent a test message yet
          if (!this.peers[targetUsername].testMessageSent) {
            try {
              const responseMessage = {
                type: 'test',
                payload: 'channel test response',
                sender: this.config.username
              };
              peer.send(JSON.stringify(responseMessage));
              this.peers[targetUsername].testMessageSent = true;
            } catch (error) {
              console.error(`[Peer Debug] Failed to send test response to ${targetUsername}:`, error);
            }
          }
        } else {
          this.config.onMessage(message);
        }
      } catch (error) {
        console.error(`[Peer Debug] Error processing message from ${targetUsername}:`, error);
      }
    });

    peer.on('error', (error) => {
      console.error(`[Peer Debug] Peer connection error with ${targetUsername}:`, error);
      if (error.message.includes('fatal') || error.message.includes('closed')) {
        this.config.onError(`Connection error with ${targetUsername}: ${error.message}`);
        this.destroyPeer(targetUsername);
      }
    });

    peer.on('close', () => {
      console.log(`[Peer Debug] Peer connection closed with ${targetUsername}`);
      
      if (this.peers[targetUsername]) {
        this.peers[targetUsername].connected = false;
        this.config.onConnectionStatus(targetUsername, false);
        
        // Try to reconnect if we're still in the same room
        if (this.currentRoomIdentifier) {
          setTimeout(() => {
            if (this.peers[targetUsername]) {
              this.createPeer(targetUsername, true);
            }
          }, 1000);
        } else {
          this.destroyPeer(targetUsername);
        }
      }
    });

    return peer;
  }

  private destroyPeer(targetUser: string) {
    const peerConn = this.peers[targetUser];
    if (peerConn) {
      try {
        peerConn.peer.destroy();
      } catch (error) {
        console.error(`[Peer Debug] Error destroying peer ${targetUser}:`, error);
      }
      delete this.peers[targetUser];
    }
  }

  private destroyAllPeers() {
    Object.keys(this.peers).forEach(targetUser => {
      this.destroyPeer(targetUser);
    });
    this.peers = {};
  }

  private handleIncomingSignal({ from, signal }: { from: string, signal: any }) {
    if (!this.peers[from]) {
      this.createPeer(from, false);
    }

    const peerConnection = this.peers[from];
    if (peerConnection && !peerConnection.peer.destroyed) {
      try {
        peerConnection.peer.signal(signal);
      } catch (error) {
        console.error(`[Peer Debug] Error forwarding signal to ${from}:`, error);
        this.destroyPeer(from);
        this.createPeer(from, false);
        const newPeer = this.peers[from];
        if (newPeer && !newPeer.peer.destroyed) {
          newPeer.peer.signal(signal);
        }
      }
    }
  }
} 