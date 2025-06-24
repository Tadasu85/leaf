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

  constructor(hiveClient: HiveClient) {
    super();
    this.hiveClient = hiveClient;
  }

  // Core game functionality
  async login(username: string): Promise<void> {
    if (!username) {
      throw new Error('Username is required');
    }

    // Find player's last location from blockchain history
    let lastLocation: { author: string; permlink: string } | null = null;

    try {
      console.log('[Login Debug] Finding last location for player:', username);
      const accountHistory = await this.hiveClient.database.getAccountHistory(username, -1, 100);
      
      console.log('[Login Debug] Processing', accountHistory.length, 'operations from blockchain history for account:', username);
      
      // Look for the most recent move_to operation (continue searching to find the latest one)
      for (let i = 0; i < accountHistory.length; i++) {
        const [, op] = accountHistory[i];
        if (op.op[0] === 'custom_json' && op.op[1].id === config.game.idName) {
          console.log('[Login Debug] Found custom_json operation at index', i, ':', {
            id: op.op[1].id,
            json: op.op[1].json,
            required_auths: op.op[1].required_auths,
            required_posting_auths: op.op[1].required_posting_auths
          });
          
          try {
            const jsonData = JSON.parse(op.op[1].json);
            console.log('[Login Debug] Parsed JSON data:', jsonData);
            
            if (jsonData.move_to?.Location) {
              // Keep updating lastLocation to find the most recent one
              lastLocation = jsonData.move_to.Location;
              console.log('[Login Debug] Found move operation at index', i, ':', lastLocation);
            } else {
              console.log('[Login Debug] Operation has no move_to.Location:', jsonData);
            }
          } catch (error) {
            console.error('[GameState Debug] Error parsing move operation at index', i, ':', error);
            console.error('[GameState Debug] Raw JSON that failed to parse:', op.op[1].json);
          }
        }
      }
      
      if (lastLocation) {
        console.log('[Login Debug] Most recent location from blockchain:', lastLocation);
      }
    } catch (error) {
      console.error('[GameState Debug] Error finding last location:', error);
    }

    // Use default start room only if no previous location was found
    if (!lastLocation) {
      lastLocation = {
        author: config.game.startRoom.author,
        permlink: config.game.startRoom.permlink
      };
      console.log('[Login Debug] No previous location found, using default:', lastLocation);
    }

    console.log('[Login Debug] Final location for player:', lastLocation);

    // Create a new player instance with found location
    const player: Player = {
      username,
      location: lastLocation,
      isAdmin: username === config.game.account,
      isBuilder: false,
      characterDescription: ''
    };

    this.player = player;
    this.emit('playerChanged', this.player);

    // Load the player's room (skip display - let socket system handle it)
    console.log('[Login Debug] Loading room for player:', lastLocation);
    await this.loadRoom(lastLocation, true);
    
    // If socket system isn't ready yet, display room after a short delay
    setTimeout(() => {
      if (this.currentRoom && !this.lastDisplayedRoom) {
        console.log('[Login Debug] Socket system not ready, displaying room manually:', this.currentRoom.title);
        this.displayRoom();
      }
    }, 1000);
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

      console.log('[LoadRoom Debug] Loading room from blockchain:', { author, permlink });

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

      console.log('[LoadRoom Debug] Room loaded from blockchain:', room.title);

      // Use game map data for exits if available
      if (this.gameMap && this.gameMap[permlink]) {
        room.exits = this.gameMap[permlink].exits || {};
        console.log('[LoadRoom Debug] Using game map exits:', room.exits);
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
      console.log('[LoadRoom Debug] Current room set to:', this.currentRoom?.title);
      
      // Fetch comments for room details
      let comments: any[] = [];
      let authorCommentDetails: any[] = [];
      try {
        comments = await this.hiveClient.getComments(author, permlink);
        console.log('[LoadRoom Debug] Fetched comments:', comments.length);
        
        // Filter for comments by the room author only
        const authorComments = comments.filter(comment => comment.author === author);
        console.log('[LoadRoom Debug] Comments by room author:', authorComments.length);
        
        // Extract key names and body from author comments
        authorCommentDetails = authorComments.map(comment => {
          // Extract key from text before colon, fallback to permlink if no colon found
          const colonIndex = comment.body.indexOf(':');
          const key = colonIndex > 0 ? comment.body.substring(0, colonIndex).trim() : comment.permlink;
          const body = colonIndex > 0 ? comment.body.substring(colonIndex + 1).trim() : comment.body;
          
          return { key, body };
        });
        
        console.log('[LoadRoom Debug] Author comment details:', authorCommentDetails);
      } catch (error) {
        console.error('[LoadRoom Debug] Error fetching comments:', error);
      }
      
      // Send room data to server if socket manager is available
      if (this.socketManager) {
        const roomId = `${room.author}/${room.permlink}`;
        console.log('[LoadRoom Debug] Sending room data to server:', roomId);
        console.log('[LoadRoom Debug] Socket manager available:', !!this.socketManager);
        console.log('[LoadRoom Debug] Room title:', room.title);
        console.log('[LoadRoom Debug] Room description:', room.description);
        console.log('[LoadRoom Debug] Room ID:', roomId);
        console.log('[LoadRoom Debug] Title !== roomId:', room.title !== roomId);
        
        // Only send if we have actual content (not placeholder data)
        if (room.title && room.description && room.title !== roomId) {
          // Convert author comments to details object
          const details: { [key: string]: string } = {};
          authorCommentDetails.forEach(comment => {
            details[comment.key] = comment.body;
          });
          
          // Add details to the local room object
          room.details = details;
          
          this.socketManager.emitEvent('updateRoomData', {
            room: roomId,
            roomData: {
              title: room.title,
              body: room.description,
              exits: room.exits,
              author: room.author,
              permlink: room.permlink,
              details: details
            }
          });
        } else {
          console.log('[LoadRoom Debug] Skipping updateRoomData - room appears to have placeholder data');
        }
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
  }

  // Method to reset room display tracking (called when changing rooms)
  public resetRoomDisplayTracking(): void {
    this.lastDisplayedRoom = null;
  }
} 