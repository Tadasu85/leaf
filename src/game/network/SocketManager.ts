import { Socket, io } from 'socket.io-client';
import { EventEmitter } from 'events';
import config from '../../config';
import { GameState } from '../state/GameState';

export class SocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;
  private currentChannelId: string | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'failed' = 'disconnected';

  constructor(private gameState: GameState) {
    super();
    // Always emit the initial status
    setTimeout(() => {
      this.emit('connectionStatusChanged', { status: this.connectionStatus });
    }, 0);
  }

  connect(username: string, location: { author: string; permlink: string }): void {
    if (this.isConnecting) {
      console.log('[SocketManager Debug] Already connecting, skipping');
      return;
    }
    this.isConnecting = true;
    this.connectionStatus = 'connecting';
    // Emit status immediately when connecting
    this.emit('connectionStatusChanged', { status: 'connecting' });

    try {
      // Clean up any existing socket first
      this.disconnect();

      const channelId = `${location.author}/${location.permlink}`;
      console.log('[SocketManager Debug] Initializing socket connection with username:', username, 'and location:', location);
      console.log('[SocketManager Debug] Using signaling server URL:', config.signalingServer);
      
      const newSocket = io(config.signalingServer, {
        query: { 
          username,
          channel: channelId
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 10000,
        forceNew: true,
        path: '/socket.io/'
      });

      this.socket = newSocket;
      this.currentChannelId = channelId;

      // Set up event handlers
      newSocket.on('connect', () => {
        console.log('[SocketManager Debug] Connected to signaling server');
        this.isConnecting = false;
        this.connectionStatus = 'connected';
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Register username on connection
        newSocket.emit('register', { username }, (response: { success: boolean }) => {
          if (response.success) {
            console.log('[SocketManager Debug] Successfully registered username:', username);
            // Join the chat channel to get channel state and ensure we're in the chat
            newSocket.emit('joinChatChannel', channelId);
          } else {
            console.error('[SocketManager Debug] Failed to register username:', username);
            this.connectionStatus = 'failed';
            this.emit('connectionStatusChanged', { status: 'failed', error: 'Registration failed' });
          }
        });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[SocketManager Debug] Disconnected from signaling server:', reason);
        this.isConnecting = false;
        this.connectionStatus = 'disconnected';
        this.emit('connectionStatusChanged', { status: 'disconnected', reason });
        
        // Don't manually reconnect - let socket.io handle it
        if (reason === 'io server disconnect') {
          console.log('[SocketManager Debug] Server initiated disconnect, not attempting manual reconnect');
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('[SocketManager Debug] Connection error:', error);
        this.isConnecting = false;
        this.connectionStatus = 'failed';
        this.emit('connectionStatusChanged', { status: 'failed', error: error.message });
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('[SocketManager Debug] Reconnected after', attemptNumber, 'attempts');
        this.isConnecting = false;
        this.connectionStatus = 'connected';
        this.emit('connectionStatusChanged', { status: 'connected' });
        
        // Re-register username after reconnection
        newSocket.emit('register', { username }, (response: { success: boolean }) => {
          if (response.success) {
            console.log('[SocketManager Debug] Successfully re-registered username after reconnect');
            // Join the chat channel to get channel state and ensure we're in the chat
            newSocket.emit('joinChatChannel', channelId);
          }
        });
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('[SocketManager Debug] Reconnection error:', error);
        this.isConnecting = false;
        this.connectionStatus = 'failed';
        this.emit('connectionStatusChanged', { status: 'failed', error: error.message });
      });

      newSocket.on('reconnect_failed', () => {
        console.error('[SocketManager Debug] Failed to reconnect after all attempts');
        this.isConnecting = false;
        this.connectionStatus = 'failed';
        this.emit('connectionStatusChanged', { status: 'failed', error: 'Reconnection failed after all attempts' });
        // Don't try to connect again - this prevents the loop
      });

      // Chat channel state handlers
      newSocket.on('chatChannelState', (data: any) => {
        // console.log('[SocketManager Debug] Received chat channel state:', data);
        this.emit('chatChannelState', data);
      });

      newSocket.on('chatChannelUpdate', (data: any) => {
        // console.log('[SocketManager Debug] Received chat channel update:', data);
        this.emit('chatChannelUpdate', data);
      });

      // Player event handlers
      newSocket.on('playerJoined', (data: { username: string; players: string[]; channelId: string }) => {
        // console.log('[SocketManager Debug] Player joined event:', data);
        this.emit('playerJoined', data);
      });

      newSocket.on('playerLeft', (data: { username: string; players: string[]; channelId: string }) => {
        // console.log('[SocketManager Debug] Player left event:', data);
        this.emit('playerLeft', data);
      });

      // Chat and emote handlers
      newSocket.on('chat', (data: { username: string; message: string; channelId: string }) => {
        console.log('[SocketManager Debug] Received chat message:', data);
        this.emit('chat', data);
      });

      newSocket.on('emote', (data: { username: string; emote: string; channelId: string }) => {
        console.log('[SocketManager Debug] Received emote:', data);
        this.emit('emote', data);
      });

      // Connect after setting up all event handlers
      newSocket.connect();

    } catch (error) {
      console.error('[SocketManager Debug] Error initializing socket:', error);
      this.isConnecting = false;
      this.connectionStatus = 'failed';
      this.emit('connectionStatusChanged', { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Cleaning up socket connection');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.connectionStatus = 'disconnected';
    this.emit('connectionStatusChanged', { status: 'disconnected' });
  }

  joinChatChannel(channelId: string): void {
    if (this.socket && this.connectionStatus === 'connected') {
      console.log('Joining chat channel:', channelId);
      this.socket.emit('joinChatChannel', channelId);
      this.currentChannelId = channelId;
    } else {
      console.log('[SocketManager Debug] Cannot join chat channel - not connected');
    }
  }

  leaveChatChannel(channelId: string, username: string): void {
    if (this.socket && this.connectionStatus === 'connected') {
      console.log('Leaving chat channel:', channelId);
      this.socket.emit('leaveChatChannel', { 
        channelId,
        username 
      });
      // Clear the current channel identifier when leaving
      if (this.currentChannelId === channelId) {
        this.currentChannelId = null;
        console.log('[SocketManager Debug] Cleared current channel identifier after leaving channel');
      }
    } else {
      console.log('[SocketManager Debug] Cannot leave chat channel - not connected');
    }
  }

  sendChat(message: string, username: string): void {
    console.log('[SocketManager Debug] sendChat called with:', { message, username, currentChannelId: this.currentChannelId });
    console.log('[SocketManager Debug] Socket connected:', this.socket?.connected);
    
    if (this.socket && this.currentChannelId && this.connectionStatus === 'connected') {
      console.log('[SocketManager Debug] Emitting chat event to server');
      this.socket.emit('chat', {
        message,
        username,
        channelId: this.currentChannelId
      });
      console.log('[SocketManager Debug] Chat event emitted successfully');
    } else {
      console.log('[SocketManager Debug] Cannot send chat - socket not connected or channel identifier missing');
      // Emit an event to notify the game state that chat is not available
      this.emit('chatUnavailable', { message: 'Chat is not available. You can still navigate and play the game.' });
    }
  }

  sendEmote(emote: string, username: string): void {
    console.log('[SocketManager Debug] sendEmote called with:', { emote, username, currentChannelId: this.currentChannelId });
    
    if (this.socket && this.currentChannelId && this.connectionStatus === 'connected') {
      console.log('[SocketManager Debug] Emitting emote event to server');
      this.socket.emit('emote', {
        emote,
        username,
        channelId: this.currentChannelId
      });
      console.log('[SocketManager Debug] Emote event emitted successfully');
    } else {
      console.log('[SocketManager Debug] Cannot send emote - socket not connected or channel identifier missing');
      // Emit an event to notify the game state that emotes are not available
      this.emit('chatUnavailable', { message: 'Emotes are not available. You can still navigate and play the game.' });
    }
  }

  getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }

  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'failed' {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  emitEvent(eventName: string, data: any): void {
    if (this.socket && this.connectionStatus === 'connected') {
      this.socket.emit(eventName, data);
    } else {
      console.log(`[SocketManager Debug] Cannot emit ${eventName} - not connected`);
    }
  }
} 