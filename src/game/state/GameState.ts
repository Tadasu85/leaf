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
  private socketManager: SocketManager | null = null;
  private lastDisplayedRoom: string | null = null;
  private lastRoomDisplayTimestamp: number = 0;
  private isLoggingIn: boolean = false;
  private hasNotifiedChatOffline: boolean = false;
  private isProcessingMovement: boolean = false;

  constructor(hiveClient: HiveClient) {
    super();
    this.hiveClient = hiveClient;
  }

  // Core game functionality
  async login(username: string): Promise<void> {
    if (!username) {
      throw new Error('Username is required');
    }

    this.isLoggingIn = true;

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

      // Load the player's current room
      await this.loadRoom(this.player.location);
      
      // Emit player changed event
      this.emit('playerChanged', this.player);
      
      // Now start the blockchain move listener from the current block
      await this.hiveClient.startMoveListener(username);
      
      // Mark login as complete
      this.isLoggingIn = false;
      
      console.log('[Login Debug] Login completed successfully');
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
    
    this.isProcessingMovement = true;
    
    try {
      // Update player location
      this.player.location = location;
      this.emit('playerChanged', this.player);
      
      // Load the new room
      await this.loadRoom(location);
    } finally {
      // Reset the flag after a short delay to allow for any immediate socket events
      setTimeout(() => {
        this.isProcessingMovement = false;
      }, 100);
    }
  }

  async loadRoom(location: Location, skipDisplay: boolean = false): Promise<void> {
    try {
      // For blockchain calls, we need separate author and permlink
      let author = location.author;
      let permlink = location.permlink;
      
      // If permlink contains a slash, it's the full room identifier from signaling server
      if (permlink.includes('/')) {
        const parts = permlink.split('/');
        if (parts.length === 2) {
          author = parts[0];
          permlink = parts[1];
        }
      }

      const content = await this.hiveClient.database.call('get_content', [
        author,
        permlink
      ]);

      if (!content || !content.id) {
        this.addOutputMessage('Room not found', true);
        return;
      }

      const room: RoomData = {
        id: `${author}/${permlink}`,
        title: content.title,
        description: content.body,
        author: author,
        permlink: permlink,
        exits: {}
      };

      // Use game map data for exits if available
      if (this.gameMap && this.gameMap[permlink]) {
        room.exits = this.gameMap[permlink].exits || {};
      } else {
        // Fallback to parsing room details and exits from metadata
        try {
          const metadata = JSON.parse(content.json_metadata);
          if (metadata.room) {
            room.exits = metadata.room.exits || {};
          }
        } catch (error) {
          console.error('Error parsing room metadata:', error);
        }
      }

      this.setCurrentRoom(room);
      
      // Fetch comments for room details
      let comments: any[] = [];
      let authorCommentDetails: any[] = [];
      try {
        comments = await this.hiveClient.getComments(author, permlink);
        
        // Filter for comments by the room author only
        const authorComments = comments.filter(comment => comment.author === author);
        
        // Extract key names and body from author comments
        authorCommentDetails = authorComments.map(comment => {
          // Extract key from text before colon, fallback to permlink if no colon found
          const colonIndex = comment.body.indexOf(':');
          const key = colonIndex > 0 ? comment.body.substring(0, colonIndex).trim() : comment.permlink;
          const body = colonIndex > 0 ? comment.body.substring(colonIndex + 1).trim() : comment.body;
          
          return { key, body };
        });
        
        // Add details to the local room object
        const details: { [key: string]: string } = {};
        authorCommentDetails.forEach(comment => {
          details[comment.key] = comment.body;
        });
        room.details = details;
        
      } catch (error) {
        console.error('[LoadRoom Debug] Error fetching comments:', error);
      }
      
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

    const now = Date.now();
    // Only allow display if at least 500ms have passed since last display
    if (now - this.lastRoomDisplayTimestamp < 500) {
      return;
    }
    this.lastRoomDisplayTimestamp = now;

    const roomKey = `${room.author}/${room.permlink}-${JSON.stringify(room.players || [])}`;
    
    // Prevent duplicate displays of the same room state
    if (this.lastDisplayedRoom === roomKey) {
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

      // Update player location on blockchain
      await this.hiveClient.moveTo(this.player.username, location);
      
      // Update local state
      this.player.location = location;
      this.emit('playerChanged', this.player);
      
      // Load new room
      await this.loadRoom(location);
    } catch (error) {
      console.error('Error moving:', error);
      this.addOutputMessage('Failed to move.', true);
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
          if (!this.hasNotifiedChatOffline) {
            this.addOutputMessage('Chat server is unavailable. You can still navigate and play the game.', true);
            this.hasNotifiedChatOffline = true;
          }
        } else if (data.status === 'connected') {
          this.addOutputMessage('Chat server connected. Chat is now available.', false);
          this.hasNotifiedChatOffline = false; // Reset flag when chat comes back online
        } else if (data.status === 'disconnected') {
          if (!this.hasNotifiedChatOffline) {
            this.addOutputMessage('Chat server disconnected. Chat is no longer available.', true);
            this.hasNotifiedChatOffline = true;
          }
        }
      });
    }
  }

  // Method to reset room display tracking (called when changing rooms)
  public resetRoomDisplayTracking(): void {
    this.lastDisplayedRoom = null;
  }

  // Method to check if currently processing movement
  public getIsProcessingMovement(): boolean {
    return this.isProcessingMovement;
  }

  // Method to check if currently logging in
  public getIsLoggingIn(): boolean {
    return this.isLoggingIn;
  }
} 