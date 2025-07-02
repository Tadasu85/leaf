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

  constructor(private gameState: GameState) {
    super();
    // Always emit the initial status
    setTimeout(() => {
      this.emit('connectionStatusChanged', { status: this.connectionStatus });
    }, 0);
  }

  connect(username: string, location: { author: string; permlink: string }): void {
    console.log('[SocketManager] Attempting to connect:', { username, location });
    
    if (this.socket) {
      console.log('[SocketManager] Disconnecting existing socket');
      this.socket.disconnect();
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
      });
      
      this.socket.on('connect', () => {
        console.log('[SocketManager] Socket connected successfully');
        this.isConnecting = false;
        this.connectionStatus = 'connected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Register the username with the server
        this.socket?.emit('register', { username });
      });

      this.socket.on('registered', (data: { success: boolean; message?: string }) => {
        if (!data.success) {
          console.error('[SocketManager] Registration failed:', data.message);
        } else {
          console.log('[SocketManager] Registration successful');
        }
      });

      this.socket.on('disconnect', (reason: string) => {
        console.log('[SocketManager] Socket disconnected:', reason);
        this.connectionStatus = 'disconnected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'disconnected' });
        
        // Don't attempt manual reconnect if server initiated disconnect
        if (reason === 'io server disconnect') {
          console.log('[SocketManager] Server initiated disconnect, not reconnecting');
          return;
        }
        
        // Attempt to reconnect
        console.log('[SocketManager] Attempting to reconnect...');
        this.attemptReconnect();
      });

      this.socket.on('reconnect', (attemptNumber: number) => {
        console.log('[SocketManager] Socket reconnected after', attemptNumber, 'attempts');
        this.connectionStatus = 'connected';
        
        // Emit connection status change
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Re-register username after reconnect
        this.socket?.emit('register', { username: this.username });
      });

      this.socket.on('reRegistered', (data: { success: boolean; message?: string }) => {
        if (!data.success) {
          console.error('[SocketManager] Re-registration failed:', data.message);
        } else {
          console.log('[SocketManager] Re-registration successful');
        }
      });

      // Chat events
      this.socket.on('chatChannelState', (data: any) => {
        this.emit('chatChannelState', data);
      });

      this.socket.on('chatChannelUpdate', (data: any) => {
        this.emit('chatChannelUpdate', data);
      });

      this.socket.on('playerJoined', (data: any) => {
        this.emit('playerJoined', data);
      });

      this.socket.on('playerLeft', (data: any) => {
        this.emit('playerLeft', data);
      });

      this.socket.on('chatMessage', (data: any) => {
        this.emit('chatMessage', data);
      });

      this.socket.on('chat', (data: any) => {
        // Handle legacy chat events
        this.emit('chat', data);
      });

      this.socket.on('emote', (data: any) => {
        this.emit('emote', data);
      });

      this.socket.on('error', (error) => {
        console.error('[SocketManager] Socket error:', error);
        this.connectionStatus = 'error';
        this.emit('error', error);
      });

    } catch (error) {
      this.isConnecting = false;
      console.error('[SocketManager] Error connecting to signaling server:', error);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.connectionStatus = 'disconnected';
    this.emit('connectionStatusChanged', { status: 'disconnected' });
  }

  joinChatChannel(channelId: string): void {
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
    if (this.username && this.location && !this.isConnecting) {
      console.log('[SocketManager] Attempting to reconnect...');
      this.connect(this.username, this.location);
    }
  }
} 