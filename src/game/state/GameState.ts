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
import logger from '../../utils/Logger';

export class GameState extends EventEmitter {
  private player: Player | null = null;
  private currentRoom: RoomData | null = null;
  private gameMap: GameMap = {};
  private outputMessages: GameOutputMessage[] = [];
  private currentRoomIdentifier: string | null = null;
  private hiveClient: HiveClient;
  private socketManager: SocketManager | null;
  private lastDisplayedRoom: string | null = null;
  private lastRoomDisplayTimestamp: number = 0;
  private isLoggingIn: boolean = false;
  private hasNotifiedChatOffline: boolean = false;
  private isProcessingMovement: boolean = false;
  private isBulkDataLoaded: boolean = false;
  private lastOptimisticRoomKey: string | null = null;
  private isInitialConnection: boolean = false;
  private hasReceivedInitialPlayerList: boolean = false;

  constructor(hiveClient: HiveClient, socketManager?: SocketManager) {
    super();
    this.hiveClient = hiveClient;
    this.socketManager = socketManager || new SocketManager(this);
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
      logger.error('[GameState] Error during initialization:', error);
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
            logger.error('[Login Debug] Error parsing operation:', error);
          }
        }
      }

      // Create player with last known location or default starting room
      // Admin users should not have a location
      const isAdmin = username === config.game.account;
      this.player = {
        username,
        location: isAdmin ? null : (lastLocation || config.game.startRoom),
        isAdmin,
        isBuilder: false,
        characterDescription: ''
      };

      // Load player descriptions from blockchain
      await this.loadPlayerDescriptions();

      // Load the player's current room using bulk data (skip display during login)
      // Admin users don't have a location, so skip room loading
      if (this.player.location) {
        await this.loadRoom(this.player.location, true); // Skip display during login
      }
      
      // Emit player changed event
      this.emit('playerChanged', this.player);
      
      // Mark login as complete
      this.isLoggingIn = false;
      
      // Set initial connection flag
      this.isInitialConnection = true;
      
      // Clear the initial connection flag immediately - no delay needed since signaling server issues are fixed
      this.isInitialConnection = false;
      
      // Room will be displayed when we receive the initial player list from the signaling server
      
    } catch (error) {
      this.isLoggingIn = false;
      logger.error('[Login Debug] Error during login:', error);
      throw error;
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

      // Create a copy of the room data to avoid mutating the cache
      const roomCopy: RoomData = {
        ...room,
        players: [] // Initialize with empty player list
      };

      // Load room details (comments) on-demand for memory efficiency
      if (!roomCopy.details) {
        try {
          const details = await this.hiveClient.getRoomDetails(location.author, location.permlink);
          roomCopy.details = details;
        } catch (error) {
          logger.error('[LoadRoom Debug] Error loading room details:', error);
          roomCopy.details = {};
        }
      }
      
      this.setCurrentRoom(roomCopy);
      
      // Only display room if not skipped
      if (!skipDisplay) {
        this.displayRoom();
      }
    } catch (error) {
      logger.error('Error loading room:', error);
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
      logger.debug('[GameState] Waiting for initial player list before displaying room');
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

      // OPTIMISTIC UPDATE: Update local state immediately for instant feedback
      this.player.location = location;
      this.emit('playerChanged', this.player);
      
      // Load new room optimistically (using cached data)
      await this.loadRoom(location);
      
      // Update player location on blockchain
      await this.hiveClient.moveTo(this.player.username, location);
      
    } catch (error) {
      logger.error('Error moving:', error);
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

    // Show present players before exits (excluding current player)
    if (this.currentRoom.players && this.currentRoom.players.length > 0) {
      const otherPlayers = this.currentRoom.players.filter(player => player !== this.player?.username);
      if (otherPlayers.length > 0) {
        this.addOutputMessage(`Players present: ${otherPlayers.join(', ')}`, false);
      }
    }

    // Show room details if they exist
    // Commented out to remove automatic display of details list
    // if (this.currentRoom.details && Object.keys(this.currentRoom.details).length > 0) {
    //   this.addOutputMessage('\nYou can look at:', true);
    //   Object.keys(this.currentRoom.details).forEach((key) => {
    //     this.addOutputMessage(key, false);
    //   });
    // }

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

  public async lookAtPlayer(targetUsername: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You are not logged in.', true);
      return;
    }

    if (!this.currentRoom) {
      this.addOutputMessage('You are not in a room.', true);
      return;
    }

    // Check if the target player is in the current room
    const roomPlayers = this.currentRoom.players || [];
    const isPlayerInRoom = roomPlayers.some(player => 
      player.toLowerCase() === targetUsername.toLowerCase()
    );

    if (!isPlayerInRoom) {
      this.addOutputMessage(`You don't see "${targetUsername}" here.`, true);
      return;
    }

    // Don't allow looking at yourself (use look self instead)
    if (targetUsername.toLowerCase() === this.player.username.toLowerCase()) {
      this.addOutputMessage('Use "look self" to view your own description.', true);
      return;
    }

    try {
      // Load the target player's description from blockchain
      const accounts = await this.hiveClient.database.call('get_accounts', [[targetUsername]]);
      if (accounts && accounts[0] && accounts[0].posting_json_metadata) {
        const metadata = JSON.parse(accounts[0].posting_json_metadata);
        if (metadata.egodeathplayer?.Description) {
          this.addOutputMessage(`${targetUsername}'s description:`, true);
          this.addOutputMessage(metadata.egodeathplayer.Description, false);
        } else {
          this.addOutputMessage(`${targetUsername} has not set a description yet.`, true);
        }
      } else {
        this.addOutputMessage(`${targetUsername} has not set a description yet.`, true);
      }
    } catch (error) {
      logger.error('Error loading player description:', error);
      this.addOutputMessage(`Unable to load ${targetUsername}'s description.`, true);
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
      logger.error('Error setting description:', error);
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
      logger.error('Error setting short description:', error);
      this.addOutputMessage('Failed to set short description. Please try again.', true);
    }
  }

  private async loadPlayerDescriptions(): Promise<void> {
    if (!this.player) return;

    try {
      const accounts = await this.hiveClient.database.call('get_accounts', [[this.player.username]]);
      if (accounts && accounts[0] && accounts[0].posting_json_metadata) {
        const metadata = JSON.parse(accounts[0].posting_json_metadata);
        if (metadata.egodeathplayer?.Description) {
          this.player.characterDescription = metadata.egodeathplayer.Description;
          this.emit('playerChanged', this.player);
        }
      }
    } catch (error) {
      logger.error('Error loading player descriptions:', error);
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
    if (!this.socketManager) {
      throw new Error('SocketManager not initialized');
    }
    return this.socketManager;
  }

  // Setters
  private setCurrentRoom(room: RoomData): void {
    this.currentRoom = room;
    this.currentRoomIdentifier = `${room.author}/${room.permlink}`;
    
    // Reset room display tracking when changing rooms
    this.resetRoomDisplayTracking();
    
    // Emit room state changed event to notify React components
    this.emit('roomStateChanged', room);
    
    // Clear present players when changing rooms - they will be updated by socket server
    this.emit('chatChannelUpdate', { players: [] });
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
    this.addOutputMessage('look <player> - View another player\'s description', false);
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
      logger.debug('[GameState] updateRoomPlayers called:', { oldPlayers, newPlayers: players });
      this.currentRoom.players = players;
      
      // Emit event to notify UI of player list update
      this.emit('roomPlayersUpdated', { players });
      
      // Mark that we've received the initial player list
      if (!this.hasReceivedInitialPlayerList) {
        this.hasReceivedInitialPlayerList = true;
        logger.debug('[GameState] Initial player list received, now displaying room');
        // Display the room now that we have the player list
        this.displayRoom();
      } else if (oldPlayers.length === 0 && players.length > 0 && !this.isLoggingIn) {
        // For subsequent updates, refresh the room display to show existing players
        logger.debug('[GameState] Player list updated, refreshing room display');
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

  // Comprehensive cleanup method to prevent memory leaks
  public destroy(): void {
    logger.debug('[GameState] Destroying game state');
    
    // Clean up socket manager
    if (this.socketManager) {
      this.socketManager.destroy();
      this.socketManager = null;
    }
    
    // Remove all event listeners from this EventEmitter
    this.removeAllListeners();
    
    // Clear data structures
    this.outputMessages = [];
    this.gameMap = {};
    this.currentRoom = null;
    this.player = null;
    
    // Reset flags
    this.isLoggingIn = false;
    this.isProcessingMovement = false;
    this.isBulkDataLoaded = false;
    this.hasNotifiedChatOffline = false;
    this.isInitialConnection = false;
    this.hasReceivedInitialPlayerList = false;
    this.lastDisplayedRoom = null;
    this.lastOptimisticRoomKey = null;
    this.currentRoomIdentifier = null;
  }
} 