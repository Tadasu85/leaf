import { Socket, io } from 'socket.io-client';
import { EventEmitter } from 'events';
import config from '../../config';
import { GameState } from '../state/GameState';

export class SocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;
  private currentRoomIdentifier: string | null = null;

  constructor(private gameState: GameState) {
    super();
  }

  connect(username: string, location: { author: string; permlink: string }): void {
    if (this.isConnecting) {
      console.log('[SocketManager Debug] Already connecting, skipping');
      return;
    }
    this.isConnecting = true;

    try {
      // Clean up any existing socket first
      this.disconnect();

      const roomId = `${location.author}/${location.permlink}`;
      console.log('[SocketManager Debug] Initializing socket connection with username:', username, 'and location:', location);
      
      const newSocket = io(config.signalingServer, {
        query: { 
          username,
          room: roomId
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
      this.currentRoomIdentifier = roomId;

      // Set up event handlers
      newSocket.on('connect', () => {
        console.log('[SocketManager Debug] Connected to signaling server');
        this.isConnecting = false;
        // Register username on connection
        newSocket.emit('register', { username }, (response: { success: boolean }) => {
          if (response.success) {
            console.log('[SocketManager Debug] Successfully registered username:', username);
            // Join the room to get room state and ensure we're in the chat
            newSocket.emit('joinRoom', roomId);
          } else {
            console.error('[SocketManager Debug] Failed to register username:', username);
          }
        });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[SocketManager Debug] Disconnected from signaling server:', reason);
        this.isConnecting = false;
        // Don't manually reconnect - let socket.io handle it
        if (reason === 'io server disconnect') {
          console.log('[SocketManager Debug] Server initiated disconnect, not attempting manual reconnect');
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('[SocketManager Debug] Connection error:', error);
        this.isConnecting = false;
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('[SocketManager Debug] Reconnected after', attemptNumber, 'attempts');
        this.isConnecting = false;
        // Re-register username after reconnection
        newSocket.emit('register', { username }, (response: { success: boolean }) => {
          if (response.success) {
            console.log('[SocketManager Debug] Successfully re-registered username after reconnect');
            // Join the room to get room state and ensure we're in the chat
            newSocket.emit('joinRoom', roomId);
          }
        });
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('[SocketManager Debug] Reconnection error:', error);
        this.isConnecting = false;
      });

      newSocket.on('reconnect_failed', () => {
        console.error('[SocketManager Debug] Failed to reconnect after all attempts');
        this.isConnecting = false;
        // Don't try to connect again - this prevents the loop
      });

      // Room state handlers
      newSocket.on('roomState', (data: any) => {
        // console.log('[SocketManager Debug] Received room state:', data);
        this.emit('roomState', data);
      });

      newSocket.on('roomUpdate', (data: any) => {
        // console.log('[SocketManager Debug] Received room update:', data);
        this.emit('roomUpdate', data);
      });

      // Player event handlers
      newSocket.on('playerJoined', (data: { username: string; players: string[]; room: string }) => {
        // console.log('[SocketManager Debug] Player joined event:', data);
        this.emit('playerJoined', data);
      });

      newSocket.on('playerLeft', (data: { username: string; players: string[]; room: string }) => {
        // console.log('[SocketManager Debug] Player left event:', data);
        this.emit('playerLeft', data);
      });

      // Chat and emote handlers
      newSocket.on('chat', (data: { username: string; message: string; room: string }) => {
        console.log('[SocketManager Debug] Received chat message:', data);
        this.emit('chat', data);
      });

      newSocket.on('emote', (data: { username: string; emote: string; room: string }) => {
        console.log('[SocketManager Debug] Received emote:', data);
        this.emit('emote', data);
      });

      // Connect after setting up all event handlers
      newSocket.connect();

    } catch (error) {
      console.error('[SocketManager Debug] Error initializing socket:', error);
      this.isConnecting = false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Cleaning up socket connection');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
  }

  joinRoom(roomId: string): void {
    if (this.socket) {
      console.log('Joining room:', roomId);
      this.socket.emit('joinRoom', roomId);
      this.currentRoomIdentifier = roomId;
    }
  }

  leaveRoom(roomId: string, username: string): void {
    if (this.socket) {
      console.log('Leaving room:', roomId);
      this.socket.emit('leaveRoom', { 
        room: roomId,
        username 
      });
      // Clear the current room identifier when leaving
      if (this.currentRoomIdentifier === roomId) {
        this.currentRoomIdentifier = null;
        console.log('[SocketManager Debug] Cleared current room identifier after leaving room');
      }
    }
  }

  sendChat(message: string, username: string): void {
    console.log('[SocketManager Debug] sendChat called with:', { message, username, currentRoomIdentifier: this.currentRoomIdentifier });
    // console.log('[SocketManager Debug] Socket object:', this.socket);
    console.log('[SocketManager Debug] Socket connected:', this.socket?.connected);
    // console.log('[SocketManager Debug] Socket id:', this.socket?.id);
    
    if (this.socket && this.currentRoomIdentifier) {
      console.log('[SocketManager Debug] Emitting chat event to server');
      // console.log('[SocketManager Debug] Event data:', {
      //   message,
      //   username,
      //   room: this.currentRoomIdentifier
      // });
      this.socket.emit('chat', {
        message,
        username,
        room: this.currentRoomIdentifier
      });
      console.log('[SocketManager Debug] Chat event emitted successfully');
    } else {
      console.log('[SocketManager Debug] Cannot send chat - socket or room identifier missing');
      console.log('[SocketManager Debug] Socket:', this.socket);
      console.log('[SocketManager Debug] Current room identifier:', this.currentRoomIdentifier);
      // console.log('[SocketManager Debug] Socket exists:', !!this.socket);
      // console.log('[SocketManager Debug] Room identifier exists:', !!this.currentRoomIdentifier);
    }
  }

  sendEmote(emote: string, username: string): void {
    console.log('[SocketManager Debug] sendEmote called with:', { emote, username, currentRoomIdentifier: this.currentRoomIdentifier });
    if (this.socket && this.currentRoomIdentifier) {
      console.log('[SocketManager Debug] Emitting emote event to server');
      this.socket.emit('emote', {
        emote,
        username,
        room: this.currentRoomIdentifier
      });
    } else {
      console.log('[SocketManager Debug] Cannot send emote - socket or room identifier missing');
      console.log('[SocketManager Debug] Socket:', this.socket);
      console.log('[SocketManager Debug] Current room identifier:', this.currentRoomIdentifier);
    }
  }

  getCurrentRoomIdentifier(): string | null {
    return this.currentRoomIdentifier;
  }

  emitEvent(eventName: string, data: any): void {
    if (this.socket) {
      console.log(`[SocketManager Debug] Emitting ${eventName} event:`, data);
      this.socket.emit(eventName, data);
    } else {
      console.log(`[SocketManager Debug] Cannot emit ${eventName} - socket not available`);
    }
  }
} 