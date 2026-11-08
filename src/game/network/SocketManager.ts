import { Socket, io } from 'socket.io-client';
import { EventEmitter } from 'events';
import config from '../../config';
import { GameState } from '../state/GameState';
import logger from '../../utils/Logger';
import { ChatAuth, ChatAuthPayload, isAuthError } from './ChatAuth';
import { isGuestName } from '../guest/GuestSession';

const BANNED_MESSAGE = "Chat is off for you because you've been muted in the game's Hive community. You can still look around and move.";

export class SocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;
  private currentChannelId: string | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error' = 'disconnected';
  private username: string | null = null;
  private location: { author: string; permlink: string } | null = null;
  
  // Memory leak prevention
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isDestroyed: boolean = false;
  private eventListeners: Map<string, (...args: any[]) => void> = new Map();

  // Chat login
  private chatAuth: ChatAuth;
  private connectGeneration: number = 0;
  private lastAuthUsedToken: boolean = false;
  private retriedWithSignature: boolean = false;

  constructor(private gameState: GameState, chatAuth?: ChatAuth) {
    super();
    this.chatAuth = chatAuth ?? new ChatAuth({
      serverUrl: config.signalingServer,
      signer: (username, message) => {
        const hiveClient = this.gameState?.getHiveClient?.();
        return hiveClient?.signMessage ? hiveClient.signMessage(username, message) : Promise.resolve(null);
      }
    });
    // Always emit the initial status
    setTimeout(() => {
      this.emit('connectionStatusChanged', { status: this.connectionStatus });
    }, 0);
  }

  connect(username: string, location: { author: string; permlink: string }, forceSignature: boolean = false): void {
    if (this.isDestroyed) {
      logger.warn('[SocketManager] Cannot connect - SocketManager is destroyed');
      return;
    }

    logger.debug('[SocketManager] Attempting to connect:', { username, location });

    if (this.isConnecting) {
      logger.debug('[SocketManager] Already connecting, ignoring duplicate connect call');
      return;
    }

    if (this.socket) {
      logger.debug('[SocketManager] Disconnecting existing socket');
      this.cleanupSocket();
    }

    // Reset channel so the reconnect effect re-joins the room on the new socket
    this.currentChannelId = null;
    this.isConnecting = true;
    this.connectionStatus = 'connecting';
    if (this.username !== username) this.retriedWithSignature = false;
    this.username = username;
    this.location = location;
    this.emit('connectionStatusChanged', { status: 'connecting' });

    const generation = ++this.connectGeneration;
    void this.openSocket(username, generation, forceSignature);
  }

  private async openSocket(username: string, generation: number, forceSignature: boolean): Promise<void> {
    // Chat login: a stored session token, or a fresh Keychain signature.
    let auth: ChatAuthPayload | undefined;
    try {
      const outcome = await this.chatAuth.prepare(username, forceSignature);
      if (generation !== this.connectGeneration || this.isDestroyed) return; // superseded
      if (outcome.kind === 'unreachable') {
        logger.debug('[SocketManager] Chat server unreachable during login:', outcome.error);
        this.isConnecting = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this.connectionStatus = 'failed';
          this.emit('connectionStatusChanged', { status: 'failed', error: 'Max reconnection attempts reached' });
        }
        return;
      }
      if (outcome.kind === 'auth') auth = outcome.payload;
      // 'legacy' and 'cancelled' connect without credentials; the server decides.
    } catch (error) {
      logger.warn('[SocketManager] Chat login preparation failed:', error);
      if (generation !== this.connectGeneration || this.isDestroyed) return;
    }
    this.lastAuthUsedToken = Boolean(auth?.sessionToken);

    try {
      logger.debug('[SocketManager] Creating new socket connection to:', config.signalingServer);
      this.socket = io(config.signalingServer, {
        // query.username is kept so servers without chat login still work.
        query: { username },
        ...(auth ? { auth: { ...auth } } : {}),
        transports: ['websocket', 'polling'], // polling fallback for server cold starts
        autoConnect: true,
        timeout: 10000, // 10 second timeout
        reconnection: false, // We'll handle reconnection manually
      });
      
      this.setupSocketEventListeners();
      
    } catch (error) {
      this.isConnecting = false;
      logger.error('[SocketManager] Error connecting to signaling server:', error);
      this.connectionStatus = 'failed';
      this.emit('connectionStatusChanged', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private setupSocketEventListeners(): void {
    if (!this.socket) return;

    // Store event listeners for cleanup
    const listeners = {
      connect: () => {
        logger.info('[SocketManager] Socket connected successfully');
        this.isConnecting = false;
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Register the username with the server
        this.socket?.emit('register', { username: this.username });
      },

      // The server disconnects this socket right after; it won't reconnect.
      chatBanned: () => {
        logger.warn('[SocketManager] Banned from chat (muted in the game community)');
        this.connectionStatus = 'failed';
        this.emit('connectionStatusChanged', { status: 'failed', error: BANNED_MESSAGE });
      },

      registered: (data: { success: boolean; message?: string }) => {
        if (!data.success) {
          logger.error('[SocketManager] Registration failed:', data.message);
        } else {
          logger.debug('[SocketManager] Registration successful');
        }
      },

      disconnect: (reason: string) => {
        logger.debug('[SocketManager] Socket disconnected:', reason);
        this.connectionStatus = 'disconnected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'disconnected' });
        
        // Don't attempt manual reconnect if server initiated disconnect or manager is destroyed
        if (reason === 'io server disconnect' || this.isDestroyed) {
          logger.debug('[SocketManager] Server initiated disconnect or manager destroyed, not reconnecting');
          return;
        }
        
        // Attempt to reconnect with limits
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          logger.debug('[SocketManager] Attempting to reconnect...');
          this.attemptReconnect();
        } else {
          logger.warn('[SocketManager] Max reconnection attempts reached');
          this.connectionStatus = 'failed';
          this.emit('connectionStatusChanged', { status: 'failed', error: 'Max reconnection attempts reached' });
        }
      },

      reconnect: (attemptNumber: number) => {
        logger.info('[SocketManager] Socket reconnected after', attemptNumber, 'attempts');
        this.connectionStatus = 'connected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Re-register username after reconnect
        this.socket?.emit('register', { username: this.username });
      },

      reRegistered: (data: { success: boolean; message?: string }) => {
        if (!data.success) {
          logger.error('[SocketManager] Re-registration failed:', data.message);
        } else {
          logger.debug('[SocketManager] Re-registration successful');
        }
      },

      // Chat events
      // Room objects: someone used something in this room (see GameState.tryRoomObject)
      playerUsedObject: (data: { username: string; channelId: string; object: string; verb: string }) => {
        this.emit('playerUsedObject', data);
      },

      chatChannelState: (data: any) => {
        this.emit('chatChannelState', data);
      },

      chatChannelUpdate: (data: any) => {
        this.emit('chatChannelUpdate', data);
      },

      playerJoined: (data: any) => {
        this.emit('playerJoined', data);
      },

      playerLeft: (data: any) => {
        this.emit('playerLeft', data);
      },

      chatMessage: (data: any) => {
        this.emit('chatMessage', data);
      },

      chat: (data: any) => {
        // Handle legacy chat events
        this.emit('chat', data);
      },

      emote: (data: any) => {
        this.emit('emote', data);
      },

      // Room owners removing players (see GameState.ejectPlayer)
      ejected: (data: { channelId: string; by: string; until: number }) => {
        this.emit('ejected', data);
      },
      playerEjected: (data: { channelId: string; target: string; by: string }) => {
        this.emit('playerEjected', data);
      },
      ejectResult: (data: { ok: boolean; message: string }) => {
        this.emit('ejectResult', data);
      },

      keepalive: () => {
        logger.debug('[SocketManager] Received keepalive from server, responding');
        // Respond to keepalive to prevent being removed from chat room
        this.socket?.emit('keepalive');
      },

      // page / whisper / who (see GameState.sendPrivate)
      privateMessage: (data: { kind: 'page' | 'whisper'; from: string; message: string }) => {
        this.emit('privateMessage', data);
      },
      privateResult: (data: { ok: boolean; kind: 'page' | 'whisper'; target: string; message: string }) => {
        this.emit('privateResult', data);
      },
      whoList: (data: { players: string[] }) => {
        this.emit('whoList', data);
      },

      builderGranted: (data: { username: string }) => {
        this.emit('builderGranted', data);
      },

      // Exit narration (see GameState.move)
      playerUsedExit: (data: { username: string; channelId: string; direction: string }) => {
        this.emit('playerUsedExit', data);
      },
      playerArrivedVia: (data: { username: string; channelId: string; from: string; direction: string }) => {
        this.emit('playerArrivedVia', data);
      },

      authenticated: (data: { username: string; sessionToken?: string }) => {
        logger.debug('[SocketManager] Chat login accepted for', data.username);
        this.retriedWithSignature = false;
        if (data.sessionToken && data.username === this.username && !isGuestName(data.username)) {
          this.chatAuth.storeToken(data.username, data.sessionToken);
        }
      },

      connect_error: (error: any) => {
        logger.debug('[SocketManager] Connection error:', error?.message);
        this.isConnecting = false;
        if (isAuthError(error?.message) && !this.isDestroyed) {
          this.handleAuthFailure(error.message);
          return;
        }
        if (!this.isDestroyed) {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          } else {
            this.connectionStatus = 'failed';
            this.emit('connectionStatusChanged', { status: 'failed', error: 'Max reconnection attempts reached' });
          }
        }
      },

      error: (error: any) => {
        logger.error('[SocketManager] Socket error:', error);
        this.connectionStatus = 'error';
        this.emit('error', error);
      }
    };

    // Register all listeners and store them for cleanup
    Object.entries(listeners).forEach(([event, listener]) => {
      this.socket!.on(event, listener);
      this.eventListeners.set(event, listener);
    });
  }

  private cleanupSocket(): void {
    if (this.socket) {
      // Remove all event listeners
      this.eventListeners.forEach((listener, event) => {
        this.socket!.off(event, listener);
      });
      this.eventListeners.clear();

      // Disconnect the socket
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear any pending reconnection attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  disconnect(): void {
    logger.debug('[SocketManager] Disconnecting socket manager');
    this.connectGeneration++; // cancel any login still in progress
    this.cleanupSocket();
    this.isConnecting = false;
    this.connectionStatus = 'disconnected';
    this.currentChannelId = null;
    this.emit('connectionStatusChanged', { status: 'disconnected' });
  }

  // Comprehensive cleanup method
  destroy(): void {
    logger.debug('[SocketManager] Destroying socket manager');
    this.isDestroyed = true;
    this.disconnect();
    
    // Remove all event listeners from this EventEmitter
    this.removeAllListeners();
    
    // Clear any remaining timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  joinChatChannel(channelId: string): void {
    if (this.isDestroyed) {
      logger.warn('[SocketManager] Cannot join channel - SocketManager is destroyed');
      return;
    }

    logger.debug('[SocketManager] joinChatChannel called with:', channelId);
    logger.debug('[SocketManager] Socket status:', {
      hasSocket: !!this.socket,
      connectionStatus: this.connectionStatus,
      isConnected: this.connectionStatus === 'connected'
    });
    
    if (this.socket && this.connectionStatus === 'connected') {
      logger.debug('[SocketManager] Emitting joinChatChannel event:', { channelId });
      this.socket.emit('joinChatChannel', { channelId });
      this.currentChannelId = channelId;
      logger.debug('[SocketManager] Current channel ID set to:', this.currentChannelId);
    } else {
      logger.debug('[SocketManager] Cannot join channel - socket not ready');
    }
  }

  leaveChatChannel(channelId: string, username: string): void {
    if (this.socket && this.connectionStatus === 'connected') {
      this.socket.emit('leaveChatChannel', { 
        channelId,
        username 
      });
      // Clear the current channel identifier when leaving
      if (this.currentChannelId === channelId) {
        this.currentChannelId = null;
      }
    }
  }

  sendChat(message: string, username: string): void {
    if (this.socket && this.currentChannelId && this.connectionStatus === 'connected') {
      this.socket.emit('chatMessage', {
        message,
        username,
        channelId: this.currentChannelId
      });
    } else {
      // Emit an event to notify the game state that chat is not available
      this.emit('chatUnavailable', { message: 'Chat is not available. You can still navigate and play the game.' });
    }
  }

  sendEmote(emote: string, username: string): void {
    if (this.socket && this.currentChannelId && this.connectionStatus === 'connected') {
      this.socket.emit('emote', {
        emote,
        username,
        channelId: this.currentChannelId
      });
    } else {
      // Emit an event to notify the game state that emotes are not available
      this.emit('chatUnavailable', { message: 'Emotes are not available. You can still navigate and play the game.' });
    }
  }

  /** page or whisper someone; false if chat isn't connected. */
  sendPrivate(kind: 'page' | 'whisper', target: string, message: string): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit(kind, { target, message });
    return true;
  }

  /** Ask who is online; the answer arrives as 'whoList'. */
  requestWho(): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit('who');
    return true;
  }

  getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }

  /** Tell the room left and the room entered which exit this player used. */
  announceExit(data: { from: string; to: string; direction: string; othersLeave: boolean; othersArrive: boolean }): void {
    if (this.socket?.connected) this.socket.emit('usedExit', data);
  }

  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error' {
    return this.connectionStatus;
  }

  /** Tell the room that this player used one of its objects. */
  announceObjectUse(data: { channelId: string; object: string; verb: string }): void {
    if (this.socket?.connected) this.socket.emit('usedObject', data);
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /** Ask the server to remove a player from the current room (room authors only). */
  ejectPlayer(target: string): boolean {
    if (!this.socket?.connected || !this.currentChannelId) return false;
    this.socket.emit('ejectPlayer', { channelId: this.currentChannelId, target });
    return true;
  }

  claimBuilder(): void {
    if (this.socket && this.connectionStatus === 'connected') {
      this.socket.emit('claimBuilder');
    }
  }

  emitEvent(eventName: string, data: any): void {
    if (this.socket && this.connectionStatus === 'connected') {
      this.socket.emit(eventName, data);
    }
  }

  /**
   * The server refused the login. A stale session token gets one retry with a
   * fresh Keychain signature; anything else stops here instead of prompting
   * Keychain on every reconnect attempt.
   */
  private handleAuthFailure(message: string): void {
    const username = this.username;
    const location = this.location;
    if (username) this.chatAuth.clearToken(username);
    this.cleanupSocket();

    const banned = /^auth_failed:\s*banned\b/.test(message);
    if (!banned && this.lastAuthUsedToken && !this.retriedWithSignature && username && location && !isGuestName(username)) {
      logger.info('[SocketManager] Chat session expired; asking Keychain to sign in again');
      this.retriedWithSignature = true;
      this.connect(username, location, true);
      return;
    }

    logger.warn('[SocketManager] Chat login rejected:', message);
    this.connectionStatus = 'failed';
    const reason = message.replace(/^auth_failed:\s*/, '');
    const friendly = banned
      ? BANNED_MESSAGE
      : username && isGuestName(username)
      ? 'Chat is not available for this guest right now. You can still look around.'
      : reason === 'missing credentials'
      ? 'Chat needs you to sign in with Keychain. Reload the page to try again.'
      : `Chat login failed (${reason}). Reload the page to try again.`;
    this.emit('connectionStatusChanged', { status: 'failed', error: friendly });
  }

  private getChannelId(): string {
    if (this.location) {
      return `${this.location.author}/${this.location.permlink}`;
    }
    throw new Error('Location is not set');
  }

  private attemptReconnect(): void {
    if (this.isDestroyed || this.reconnectAttempts >= this.maxReconnectAttempts || this.reconnectTimeout !== null) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
    
    logger.debug(`[SocketManager] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.username && this.location && !this.isConnecting && !this.isDestroyed) {
        logger.debug('[SocketManager] Executing reconnect attempt');
        this.connect(this.username, this.location);
      }
    }, delay);
  }
} 