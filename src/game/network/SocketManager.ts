import { Socket, io } from 'socket.io-client';
import { EventEmitter } from 'events';
import config from '../../config';
import { GameState } from '../state/GameState';

export class SocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;
  private currentChannelId: string | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error' = 'disconnected';
  private username: string | null = null;
  private location: { author: string; permlink: string } | null = null;
  
  // Memory leak prevention
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isDestroyed: boolean = false;
  private eventListeners: Map<string, (...args: any[]) => void> = new Map();

  constructor(private gameState: GameState) {
    super();
    // Always emit the initial status
    setTimeout(() => {
      this.emit('connectionStatusChanged', { status: this.connectionStatus });
    }, 0);
  }

  connect(username: string, location: { author: string; permlink: string }): void {
    if (this.isDestroyed) {
      console.warn('[SocketManager] Cannot connect - SocketManager is destroyed');
      return;
    }

    console.log('[SocketManager] Attempting to connect:', { username, location });
    
    if (this.socket) {
      console.log('[SocketManager] Disconnecting existing socket');
      this.cleanupSocket();
    }

    this.isConnecting = true;
    this.username = username;
    this.location = location;

    try {
      console.log('[SocketManager] Creating new socket connection to:', config.signalingServer);
      this.socket = io(config.signalingServer, {
        query: { username },
        transports: ['websocket'],
        autoConnect: true,
        timeout: 10000, // 10 second timeout
        reconnection: false, // We'll handle reconnection manually
      });
      
      this.setupSocketEventListeners();
      
    } catch (error) {
      this.isConnecting = false;
      console.error('[SocketManager] Error connecting to signaling server:', error);
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
        console.log('[SocketManager] Socket connected successfully');
        this.isConnecting = false;
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Register the username with the server
        this.socket?.emit('register', { username: this.username });
      },

      registered: (data: { success: boolean; message?: string }) => {
        if (!data.success) {
          console.error('[SocketManager] Registration failed:', data.message);
        } else {
          console.log('[SocketManager] Registration successful');
        }
      },

      disconnect: (reason: string) => {
        console.log('[SocketManager] Socket disconnected:', reason);
        this.connectionStatus = 'disconnected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'disconnected' });
        
        // Don't attempt manual reconnect if server initiated disconnect or manager is destroyed
        if (reason === 'io server disconnect' || this.isDestroyed) {
          console.log('[SocketManager] Server initiated disconnect or manager destroyed, not reconnecting');
          return;
        }
        
        // Attempt to reconnect with limits
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log('[SocketManager] Attempting to reconnect...');
          this.attemptReconnect();
        } else {
          console.log('[SocketManager] Max reconnection attempts reached');
          this.connectionStatus = 'failed';
          this.emit('connectionStatusChanged', { status: 'failed', error: 'Max reconnection attempts reached' });
        }
      },

      reconnect: (attemptNumber: number) => {
        console.log('[SocketManager] Socket reconnected after', attemptNumber, 'attempts');
        this.connectionStatus = 'connected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Re-register username after reconnect
        this.socket?.emit('register', { username: this.username });
      },

      reRegistered: (data: { success: boolean; message?: string }) => {
        if (!data.success) {
          console.error('[SocketManager] Re-registration failed:', data.message);
        } else {
          console.log('[SocketManager] Re-registration successful');
        }
      },

      // Chat events
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

      error: (error: any) => {
        console.error('[SocketManager] Socket error:', error);
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
    console.log('[SocketManager] Disconnecting socket manager');
    this.cleanupSocket();
    this.isConnecting = false;
    this.connectionStatus = 'disconnected';
    this.currentChannelId = null;
    this.emit('connectionStatusChanged', { status: 'disconnected' });
  }

  // Comprehensive cleanup method
  destroy(): void {
    console.log('[SocketManager] Destroying socket manager');
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
      console.warn('[SocketManager] Cannot join channel - SocketManager is destroyed');
      return;
    }

    console.log('[SocketManager] joinChatChannel called with:', channelId);
    console.log('[SocketManager] Socket status:', {
      hasSocket: !!this.socket,
      connectionStatus: this.connectionStatus,
      isConnected: this.connectionStatus === 'connected'
    });
    
    if (this.socket && this.connectionStatus === 'connected') {
      console.log('[SocketManager] Emitting joinChatChannel event:', { channelId });
      this.socket.emit('joinChatChannel', { channelId });
      this.currentChannelId = channelId;
      console.log('[SocketManager] Current channel ID set to:', this.currentChannelId);
    } else {
      console.log('[SocketManager] Cannot join channel - socket not ready');
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

  getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }

  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error' {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  emitEvent(eventName: string, data: any): void {
    if (this.socket && this.connectionStatus === 'connected') {
      this.socket.emit(eventName, data);
    }
  }

  private getChannelId(): string {
    if (this.location) {
      return `${this.location.author}/${this.location.permlink}`;
    }
    throw new Error('Location is not set');
  }

  private attemptReconnect(): void {
    if (this.isDestroyed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
    
    console.log(`[SocketManager] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.username && this.location && !this.isConnecting && !this.isDestroyed) {
        console.log('[SocketManager] Executing reconnect attempt');
        this.connect(this.username, this.location);
      }
    }, delay);
  }
} 