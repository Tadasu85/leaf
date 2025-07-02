import { EventEmitter } from 'events';
import { 
  Player, 
  GameMap, 
  Location, 
  GameOutputMessage,
  RoomData
} from '../types/GameTypes';
import config from '../../config';
import { HiveClient } from '../blockchain/HiveClient';
import { SocketManager } from '../network/SocketManager';

export class GameState extends EventEmitter {
  private player: Player | null = null;
  private currentRoom: RoomData | null = null;
  private gameMap: GameMap = {};
  private outputMessages: GameOutputMessage[] = [];
  private currentRoomIdentifier: string | null = null;
  private hiveClient: HiveClient;
  private socketManager: SocketManager;
  private lastDisplayedRoom: string | null = null;
  private lastRoomDisplayTimestamp: number = 0;
  private isLoggingIn: boolean = false;
  private hasNotifiedChatOffline: boolean = false;
  private isProcessingMovement: boolean = false;
  private isBulkDataLoaded: boolean = false;
  private lastOptimisticRoomKey: string | null = null;
  private isInitialConnection: boolean = false;
  private hasReceivedInitialPlayerList: boolean = false;
  
  // NEW: Track pending movements to prevent double processing
  private pendingMovements: Set<string> = new Set();
  private lastMoveTimestamp: number = 0;

  constructor(hiveClient: HiveClient, socketManager?: SocketManager) {
    super();
    this.hiveClient = hiveClient;
    this.socketManager = socketManager || new SocketManager(this);
    
    // Set up periodic cleanup of old pending movements
    setInterval(() => {
      this.cleanupOldPendingMovements();
    }, 30000); // Clean up every 30 seconds
  }

  /**
   * Initialize game state with bulk data loading
   */
  public async initialize(): Promise<void> {
    if (this.isBulkDataLoaded) return;
    
    try {
      await this.hiveClient.loadAllGameData();
      this.isBulkDataLoaded = true;
    } catch (error) {
      console.error('[GameState] Error during initialization:', error);
      throw error;
    }
  }

  // Core game functionality
  async login(username: string): Promise<void> {
    if (!username) {
      throw new Error('Username is required');
    }

    this.isLoggingIn = true;

    // Ensure bulk data is loaded before login
    if (!this.isBulkDataLoaded) {
      await this.initialize();
    }

    // Find player's last location from blockchain history
    let lastLocation: { author: string; permlink: string } | null = null;
    let lastKnownTimestamp: string | null = null;

    try {
      const accountHistory = await this.hiveClient.database.getAccountHistory(username, -1, 100);
      
      // Look for the most recent move_to operation
      // Instead of relying on order, find the operation with the most recent timestamp
      for (let i = 0; i < accountHistory.length; i++) {
        const [, op] = accountHistory[i];
        
        if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
          try {
            const jsonData = JSON.parse(op.op[1].json);
            if (jsonData.move_to?.Location) {
              // Check if this operation is more recent than what we've found so far
              if (!lastKnownTimestamp || op.timestamp > lastKnownTimestamp) {
                lastLocation = jsonData.move_to.Location;
                lastKnownTimestamp = op.timestamp;
              }
            }
          } catch (error) {
            console.error('[Login Debug] Error parsing operation:', error);
          }
        }
      }

      // Create player with last known location or default starting room
      this.player = {
        username,
        location: lastLocation || config.game.startRoom,
        isAdmin: username === config.game.account,
        isBuilder: false,
        characterDescription: ''
      };

      // Load player descriptions from blockchain
      await this.loadPlayerDescriptions();

      // Set up event listener for move operations BEFORE starting the listener
      this.hiveClient.on('moveDetected', (data: { username: string; location: Location; transactionId: string; timestamp: string }) => {
        // Only handle moves for the current player and not during login
        if (this.player && data.username === this.player.username && !this.isLoggingIn) {
          this.handleBlockchainMove(data.location);
        }
      });

      // Load the player's current room using bulk data (skip display during login)
      await this.loadRoom(this.player.location, true); // Skip display during login
      
      // Emit player changed event
      this.emit('playerChanged', this.player);
      
      // Now start the blockchain move listener from the current block
      await this.hiveClient.startMoveListener(username);
      
      // Mark login as complete
      this.isLoggingIn = false;
      
      // Set initial connection flag
      this.isInitialConnection = true;
      
      // Clear the initial connection flag immediately - no delay needed since signaling server issues are fixed
      this.isInitialConnection = false;
      
      // Room will be displayed when we receive the initial player list from the signaling server
      
    } catch (error) {
      this.isLoggingIn = false;
      console.error('[Login Debug] Error during login:', error);
      throw error;
    }
  }

  // Handle move operations detected from blockchain
  private async handleBlockchainMove(location: Location): Promise<void> {
    if (!this.player) {
      console.error('[GameState Debug] Cannot handle blockchain move: no player logged in');
      return;
    }
    
    // Check if this movement is already pending (optimistic update)
    const pendingMovementKey = `${this.player.username}-${location.author}-${location.permlink}`;
    const hasPendingMovement = Array.from(this.pendingMovements).some(movementId => 
      movementId.startsWith(pendingMovementKey)
    );
    
    if (hasPendingMovement) {
      console.log('[GameState Debug] Ignoring blockchain move - already processed optimistically');
      // Remove the pending movement since blockchain confirmed it
      this.pendingMovements.forEach(movementId => {
        if (movementId.startsWith(pendingMovementKey)) {
          this.pendingMovements.delete(movementId);
        }
      });
      return;
    }
    
    // Check if player is already at this location (prevent unnecessary updates)
    if (this.player.location.author === location.author && 
        this.player.location.permlink === location.permlink) {
      console.log('[GameState Debug] Ignoring blockchain move - player already at location');
      return;
    }
    
    // Check if this is the same room that was just optimistically displayed
    const room = await this.hiveClient.getRoomData(location);
    if (room) {
      const roomKey = `${room.author}/${room.permlink}-${JSON.stringify(room.players || [])}`;
      if (this.lastOptimisticRoomKey === roomKey) {
        this.lastOptimisticRoomKey = null;
        return;
      }
    }
    
    this.isProcessingMovement = true;
    
    try {
      // Update player location
      this.player.location = location;
      this.emit('playerChanged', this.player);
      
      // Load the new room
      await this.loadRoom(location);
    } finally {
      // Reset the flag immediately since data is cached
      this.isProcessingMovement = false;
    }
  }

  async loadRoom(location: Location, skipDisplay: boolean = false): Promise<void> {
    try {
      // Use bulk data loader for efficient room loading
      const room = await this.hiveClient.getRoomData(location);
      
      if (!room) {
        this.addOutputMessage('Room not found', true);
        return;
      }

      // Load room details (comments) on-demand for memory efficiency
      if (!room.details) {
        try {
          const details = await this.hiveClient.getRoomDetails(location.author, location.permlink);
          room.details = details;
        } catch (error) {
          console.error('[LoadRoom Debug] Error loading room details:', error);
          room.details = {};
        }
      }

      this.setCurrentRoom(room);
      
      // Only display room if not skipped
      if (!skipDisplay) {
        this.displayRoom();
      }
    } catch (error) {
      console.error('Error loading room:', error);
      this.addOutputMessage('Failed to load room', true);
    }
  }

  displayRoom(): void {
    const room = this.currentRoom;
    if (!room) return;

    const roomKey = `${room.author}/${room.permlink}-${JSON.stringify(room.players || [])}`;
    
    // Suppress second display if this was just optimistically displayed
    if (this.lastOptimisticRoomKey === roomKey) {
      this.lastOptimisticRoomKey = null;
      return;
    }
    
    // Prevent duplicate displays of the same room state
    if (this.lastDisplayedRoom === roomKey) {
      return;
    }

    // During login, be more strict about suppressing displays
    if (this.isLoggingIn) {
      return;
    }

    // During initial connection after login, suppress socket-triggered displays
    if (this.isInitialConnection) {
      return;
    }

    // If we haven't received the initial player list yet, wait for it
    // This prevents displaying the room twice (once without players, once with)
    if (!this.hasReceivedInitialPlayerList && this.socketManager && this.socketManager.isConnected()) {
      console.log('[GameState] Waiting for initial player list before displaying room');
      return;
    }

    this.lastDisplayedRoom = roomKey;

    this.addOutputMessage(room.title, true);
    this.addOutputMessage(room.description, false);

    // Show present players before exits (excluding current player)
    if (room.players && room.players.length > 0) {
      const otherPlayers = room.players.filter(player => player !== this.player?.username);
      if (otherPlayers.length > 0) {
        this.addOutputMessage(`Players present: ${otherPlayers.join(', ')}`, false);
      }
    }

    if (Object.keys(room.exits).length > 0) {
      this.addOutputMessage('\nExits:', true);
      Object.entries(room.exits).forEach(([direction, destination]) => {
        this.addOutputMessage(direction, false);
      });
    }
  }

  public async move(direction: string): Promise<void> {
    if (!this.player || !this.currentRoom) {
      this.addOutputMessage('You must be logged in to move.', true);
      return;
    }

    const destination = this.currentRoom.exits[direction];
    if (!destination) {
      this.addOutputMessage(`You cannot go ${direction}.`, true);
      return;
    }

    try {
      // Destinations in game map are just permlinks, use current room's author
      const location: Location = { 
        author: this.currentRoom.author, 
        permlink: destination 
      };

      // Create a unique movement identifier
      const movementId = `${this.player.username}-${location.author}-${location.permlink}-${Date.now()}`;
      
      // Mark this movement as pending
      this.pendingMovements.add(movementId);
      
      // OPTIMISTIC UPDATE: Update local state immediately for instant feedback
      this.player.location = location;
      this.emit('playerChanged', this.player);
      
      // Load new room optimistically (using cached data)
      await this.loadRoom(location);
      
      // Update player location on blockchain (this will trigger the listener)
      await this.hiveClient.moveTo(this.player.username, location);
      
      // Remove from pending movements after successful blockchain update
      this.pendingMovements.delete(movementId);
      
    } catch (error) {
      console.error('Error moving:', error);
      this.addOutputMessage('Failed to move.', true);
      
      // Revert optimistic update on error
      if (this.currentRoom) {
        this.player!.location = { 
          author: this.currentRoom.author, 
          permlink: this.currentRoom.permlink 
        };
        this.emit('playerChanged', this.player);
        await this.loadRoom(this.player!.location);
      }
    }
  }

  public async look(): Promise<void> {
    if (!this.currentRoom) {
      this.addOutputMessage('You are not in a room.', true);
      return;
    }

    this.addOutputMessage(this.currentRoom.title, true);
    this.addOutputMessage(this.currentRoom.description, false);

    if (Object.keys(this.currentRoom.exits).length > 0) {
      this.addOutputMessage('\nExits:', true);
      Object.entries(this.currentRoom.exits).forEach(([direction, destination]) => {
        this.addOutputMessage(direction, false);
      });
    }
  }

  public async lookAtSelf(): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You are not logged in.', true);
      return;
    }

    // Load player descriptions from blockchain
    await this.loadPlayerDescriptions();

    if (this.player.characterDescription) {
      this.addOutputMessage('Your character description:', true);
      this.addOutputMessage(this.player.characterDescription, false);
    } else {
      this.addOutputMessage('You have not set a character description yet.', true);
      this.addOutputMessage('Use @describe <description> to set your description.', false);
    }
  }

  public async setDescription(description: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to set your description.', true);
      return;
    }

    if (!description.trim()) {
      this.addOutputMessage('Please provide a description.', true);
      return;
    }

    try {
      await this.hiveClient.setDescription(this.player.username, description);
      this.addOutputMessage('Description set successfully. It will be updated on the blockchain shortly.', false);
    } catch (error) {
      console.error('Error setting description:', error);
      this.addOutputMessage('Failed to set description. Please try again.', true);
    }
  }

  public async setShortDescription(shortDescription: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to set your short description.', true);
      return;
    }

    if (!shortDescription.trim()) {
      this.addOutputMessage('Please provide a short description.', true);
      return;
    }

    try {
      await this.hiveClient.setShortDescription(this.player.username, shortDescription);
      this.addOutputMessage('Short description set successfully. It will be updated on the blockchain shortly.', false);
    } catch (error) {
      console.error('Error setting short description:', error);
      this.addOutputMessage('Failed to set short description. Please try again.', true);
    }
  }

  private async loadPlayerDescriptions(): Promise<void> {
    if (!this.player) return;

    try {
      const accounts = await this.hiveClient.database.call('get_accounts', [[this.player.username]]);
      if (accounts && accounts[0] && accounts[0].json_metadata) {
        const metadata = JSON.parse(accounts[0].json_metadata);
        if (metadata.egodeathplayer?.Description) {
          this.player.characterDescription = metadata.egodeathplayer.Description;
          this.emit('playerChanged', this.player);
        }
      }
    } catch (error) {
      console.error('Error loading player descriptions:', error);
    }
  }

  public async moveTo(location: Location): Promise<void> {
    if (!this.player) {
      throw new Error('Player not logged in');
    }

    // Update player location on blockchain
    await this.hiveClient.moveTo(this.player.username, location);
    
    // Update local state
    this.player.location = location;
  }

  // Getters
  public getPlayer(): Player | null {
    return this.player;
  }

  public getCurrentRoom(): RoomData | null {
    return this.currentRoom;
  }

  public getCurrentRoomIdentifier(): string | null {
    return this.currentRoomIdentifier;
  }

  public getGameMap(): GameMap {
    return this.gameMap;
  }

  public getHiveClient(): HiveClient {
    return this.hiveClient;
  }

  public getSocketManager(): SocketManager {
    return this.socketManager;
  }

  // Setters
  private setCurrentRoom(room: RoomData): void {
    this.currentRoom = room;
    this.currentRoomIdentifier = `${room.author}/${room.permlink}`;
    // Emit room state changed event to notify React components
    this.emit('roomStateChanged', room);
  }

  public setGameMap(gameMap: GameMap): void {
    this.gameMap = gameMap;
  }

  // Output handling
  public addOutputMessage(message: string, bold: boolean = false): void {
    this.outputMessages.push({ output: message, bold });
    this.emit('output', { output: message, bold });
  }

  public addOutput(message: GameOutputMessage): void {
    this.outputMessages.push(message);
    this.emit('output', message);
  }

  public getOutputMessages(): GameOutputMessage[] {
    return this.outputMessages;
  }

  public clearOutputMessages(): void {
    this.outputMessages = [];
  }

  // Chat and emote
  public say(message: string): void {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to speak.', true);
      return;
    }

    // Display local message
    this.addOutputMessage(`You say: "${message}"`, false);

    // Send to signaling server if socket manager is available
    if (this.socketManager && typeof this.socketManager.sendChat === 'function') {
      this.socketManager.sendChat(message, this.player.username);
    }

    // Emit for network communication
    this.emit('say', {
      username: this.player.username,
      message
    });
  }

  public emote(emote: string): void {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to emote.', true);
      return;
    }

    // Display local emote
    this.addOutputMessage(`You ${emote}`, false);

    // Send to signaling server if socket manager is available
    if (this.socketManager && typeof this.socketManager.sendEmote === 'function') {
      this.socketManager.sendEmote(emote, this.player.username);
    }

    // Emit for network communication
    this.emit('emote', {
      username: this.player.username,
      emote
    });
  }

  public help(): void {
    this.addOutputMessage('\nAvailable commands:', true);
    this.addOutputMessage('Movement: Use directional commands like north, south, east, west, up, down, etc.', false);
    this.addOutputMessage('say <message> - Say something in the current room', false);
    this.addOutputMessage('emote <action> - Perform an action in the current room', false);
    this.addOutputMessage('look - Look around the current room', false);
    this.addOutputMessage('look self - View your character description', false);
    this.addOutputMessage('@describe <description> - Set your character description', false);
    this.addOutputMessage('@describeshort <short description> - Set your character short description', false);
    this.addOutputMessage('help - Show this help message', false);
  }

  // Add method to update builder status
  public setBuilderStatus(isBuilder: boolean): void {
    if (this.player) {
      this.player.isBuilder = isBuilder;
      this.emit('playerChanged', this.player);
    }
  }

  // Method to set socket manager (called by useSocket hook)
  public setSocketManager(socketManager: SocketManager): void {
    this.socketManager = socketManager;
    let disconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    
    // Set up event listeners for socket manager events
    if (socketManager) {
      socketManager.on('chatUnavailable', (data: { message: string }) => {
        if (!this.hasNotifiedChatOffline) {
          this.addOutputMessage(data.message, true);
          this.hasNotifiedChatOffline = true;
        }
      });
      
      socketManager.on('connectionStatusChanged', (data: { status: string; error?: string }) => {
        if (data.status === 'failed') {
          if (disconnectDebounceTimer) {
            clearTimeout(disconnectDebounceTimer);
            disconnectDebounceTimer = null;
          }
          if (!this.hasNotifiedChatOffline) {
            this.addOutputMessage('Chat server is unavailable. You can still navigate and play the game.', true);
            this.hasNotifiedChatOffline = true;
          }
        } else if (data.status === 'connected') {
          if (disconnectDebounceTimer) {
            clearTimeout(disconnectDebounceTimer);
            disconnectDebounceTimer = null;
          }
          this.addOutputMessage('Chat server connected. Chat is now available.', false);
          this.hasNotifiedChatOffline = false; // Reset flag when chat comes back online
        } else if (data.status === 'disconnected') {
          if (disconnectDebounceTimer) {
            clearTimeout(disconnectDebounceTimer);
          }
          disconnectDebounceTimer = setTimeout(() => {
            if (!this.hasNotifiedChatOffline) {
              this.addOutputMessage('Chat server disconnected. Chat is no longer available.', true);
              this.hasNotifiedChatOffline = true;
            }
          }, 5000);
        }
      });
    }
  }

  // Method to reset room display tracking (called when changing rooms)
  public resetRoomDisplayTracking(): void {
    this.lastDisplayedRoom = null;
    this.hasReceivedInitialPlayerList = false;
  }

  // Method to check if currently processing movement
  public getIsProcessingMovement(): boolean {
    return this.isProcessingMovement;
  }

  // Method to check if currently logging in
  public getIsLoggingIn(): boolean {
    return this.isLoggingIn;
  }

  // Method to check if in initial connection phase
  public getIsInitialConnection(): boolean {
    return this.isInitialConnection;
  }

  // Method to update room players (called by socket events)
  public updateRoomPlayers(players: string[]): void {
    if (this.currentRoom) {
      const oldPlayers = this.currentRoom.players || [];
      this.currentRoom.players = players;
      
      // Emit event to notify UI of player list update
      this.emit('roomPlayersUpdated', { players });
      
      // Mark that we've received the initial player list
      if (!this.hasReceivedInitialPlayerList) {
        this.hasReceivedInitialPlayerList = true;
        console.log('[GameState] Initial player list received, now displaying room');
        // Display the room now that we have the player list
        this.displayRoom();
      } else if (oldPlayers.length === 0 && players.length > 0 && !this.isLoggingIn) {
        // For subsequent updates, refresh the room display to show existing players
        console.log('[GameState] Player list updated, refreshing room display');
        this.refreshRoomDisplay();
      }
    }
  }

  // Method to get current room players
  public getCurrentRoomPlayers(): string[] {
    return this.currentRoom?.players || [];
  }

  // Method to notify when a player joins the room
  public notifyPlayerJoined(username: string): void {
    if (username !== this.player?.username) {
      this.addOutputMessage(`${username} has entered the room.`, false);
    }
  }

  // Method to notify when a player leaves the room
  public notifyPlayerLeft(username: string): void {
    if (username !== this.player?.username) {
      this.addOutputMessage(`${username} has left the room.`, false);
    }
  }

  // Method to refresh room display with current player list
  public refreshRoomDisplay(): void {
    if (this.currentRoom) {
      // Create a new room key to force display refresh
      this.lastDisplayedRoom = null;
      this.displayRoom();
    }
  }

  public clearPendingMovements(): void {
    this.pendingMovements.clear();
  }

  public getPendingMovements(): string[] {
    return Array.from(this.pendingMovements);
  }

  // Clean up old pending movements (older than 30 seconds)
  private cleanupOldPendingMovements(): void {
    const now = Date.now();
    const thirtySecondsAgo = now - 30000;
    
    this.pendingMovements.forEach(movementId => {
      const timestamp = parseInt(movementId.split('-').pop() || '0');
      if (timestamp < thirtySecondsAgo) {
        this.pendingMovements.delete(movementId);
      }
    });
  }
} 