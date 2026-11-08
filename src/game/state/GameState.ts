import { EventEmitter } from 'events';
import { FeedbackKind } from '../rooms/roomFeedback';
import {
  Player,
  GameMap,
  Location,
  GameOutputMessage,
  RoomData,
  TimeEventConfig,
  BlockchainTimeEvent
} from '../types/GameTypes';
import { findRoom, resolveExit, splitKey } from '../rooms/mapKeys';
import config from '../../config';
import { guestSession, GuestIdentity, isGuestName } from '../guest/GuestSession';
import { MuteList } from '../social/MuteList';
import { HiveClient } from '../blockchain/HiveClient';
import { readHomeFromAccount, loadGuestHome, saveGuestHome } from '../rooms/home';
import { SocketManager } from '../network/SocketManager';
import { findHelpTopic, helpIndexLine } from '../help/topics';
import logger from '../../utils/Logger';
import { renderExitMessage } from '../rooms/exitMessages';
import { conjugateEmoteForSender } from '../../utils/conjugate';
import { signupLines } from '../guest/signup';

import { matchObjectAction, renderObjectLine } from '../rooms/roomObjects';

export class GameState extends EventEmitter {
  private player: Player | null = null;
  private currentRoom: RoomData | null = null;
  private gameMap: GameMap = {};
  private outputMessages: GameOutputMessage[] = [];
  private currentRoomIdentifier: string | null = null;
  private hiveClient: HiveClient;
  private socketManager: SocketManager | null;
  private mutes: MuteList = new MuteList();
  private lastDisplayedRoom: string | null = null;
  private lastRoomDisplayTimestamp: number = 0;
  private isLoggingIn: boolean = false;
  private hasNotifiedChatOffline: boolean = false;
  private isProcessingMovement: boolean = false;
  private isBulkDataLoaded: boolean = false;
  private lastOptimisticRoomKey: string | null = null;
  private hasReceivedInitialPlayerList: boolean = false;
  private timeEventRooms: Map<string, TimeEventConfig> = new Map();
  private disconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(hiveClient: HiveClient, socketManager?: SocketManager) {
    super();
    this.hiveClient = hiveClient;
    this.socketManager = socketManager || new SocketManager(this);
    
    // Listen for time events from the blockchain
    this.hiveClient.on('timeEventDetected', this.handleTimeEvent.bind(this));
  }

  /**
   * A room's key in the game map: `permlink`, or `author/permlink` for a room
   * whose permlink another author already uses. Time-event rooms are
   * registered under this key.
   */
  private roomKeyOf(location: Location): string {
    const map = this.hiveClient.getGameMap?.() ?? {};
    return findRoom(map, location.author, location.permlink)?.key ?? location.permlink;
  }

  /**
   * Handle time-based events from the blockchain
   */
  private handleTimeEvent(timeEvent: BlockchainTimeEvent): void {
    logger.debug('Time event detected:', timeEvent);
    
    // Update the room's exits based on the new phase
    const config = this.hiveClient.getTimeEventConfig(timeEvent.roomPermlink);
    if (config && config.phases?.[timeEvent.phase]) {
      const phase = config.phases[timeEvent.phase];
      
      // Update the room data with new exits
      if (this.currentRoom && this.roomKeyOf(this.currentRoom) === timeEvent.roomPermlink) {
        const updatedRoom: RoomData = {
          ...this.currentRoom,
          exits: phase.exits
        };
        
        this.setCurrentRoom(updatedRoom);
        
        // Display the room update to the player
        this.addOutputMessage(`\n${phase.name}`, true);
        this.addOutputMessage(phase.description, false);
        this.displayRoom();
      }
      
      // Emit room state change for other components
      this.emit('roomStateChanged', this.currentRoom);
    }
  }

  /**
   * Register a room for time-based events
   */
  public registerTimeEventRoom(roomPermlink: string, config: TimeEventConfig): void {
    this.timeEventRooms.set(roomPermlink, config);
    this.hiveClient.registerTimeEventRoom(roomPermlink, config);
    logger.debug(`Registered time event room in GameState: ${roomPermlink}`);
  }

  /**
   * Unregister a room from time-based events
   */
  public unregisterTimeEventRoom(roomPermlink: string): void {
    this.timeEventRooms.delete(roomPermlink);
    this.hiveClient.unregisterTimeEventRoom(roomPermlink);
    logger.debug(`Unregistered time event room in GameState: ${roomPermlink}`);
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
      const [accounts, accountHistory] = await Promise.all([
        this.hiveClient.database.call('get_accounts', [[username]]),
        this.hiveClient.database.getAccountHistory(username, -1, 100)
      ]);

      if (!accounts || accounts.length === 0 || !accounts[0]) {
        throw new Error(`Account '${username}' not found on Hive blockchain`);
      }
      
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
      // A new Hive player who played as a guest in this browser starts where the guest left off
      const fromGuest = !isAdmin && !lastLocation ? this.guestStartFor() : null;
      this.player = {
        username,
        location: isAdmin ? null : (lastLocation || fromGuest || config.game.startRoom),
        isAdmin,
        isBuilder: false,
        characterDescription: ''
      };
      this.mutes.setViewer(username);

      // Load player descriptions from already-fetched account data
      await this.loadPlayerDescriptions(accounts[0]);
      this.homeLocation = readHomeFromAccount(accounts[0]);

      // Load the player's current room using bulk data (skip display during login)
      // Admin users don't have a location, so skip room loading
      if (this.player.location) {
        await this.loadRoom(this.player.location, true);
        // If the last known location is no longer in the game map (e.g. move_to op fell
        // outside account history window, or room was deregistered), fall back to the
        // starting room. This is in-memory only — no blockchain write occurs.
        if (!this.currentRoom && (lastLocation || fromGuest)) {
          this.player.location = config.game.startRoom;
          await this.loadRoom(this.player.location, true);
        }
      }
      
      // Emit player changed event
      this.emit('playerChanged', this.player);
      
      // Mark login as complete
      this.isLoggingIn = false;

      // Display the room immediately. Mark hasReceivedInitialPlayerList so the guard
      // in displayRoom() doesn't suppress it while waiting for a socket event.
      // updateRoomPlayers() will still refresh the display if other players are present.
      if (this.player?.location && this.currentRoom) {
        if (fromGuest && this.player.location.permlink === fromGuest.permlink) {
          this.addOutputMessage('Welcome to Hive! You start where your guest left off.', false);
        }
        this.hasReceivedInitialPlayerList = true;
        this.displayRoom();
      }

      // Start block stream for time-based room events
      this.hiveClient.startBlockStream();

      // Async builder eligibility check — does not block login
      this.checkBuilderEligibility(username);

    } catch (error) {
      this.isLoggingIn = false;
      logger.error('[Login Debug] Error during login:', error);
      throw error;
    }
  }



  /**
   * Play as a guest (no Hive account). Nothing is read from or written to the
   * player's Hive account; position comes from this browser.
   */
  async loginAsGuest(identity: GuestIdentity): Promise<void> {
    this.isLoggingIn = true;
    try {
      if (!this.isBulkDataLoaded) {
        await this.initialize();
      }

      const saved = identity.location;
      const savedInMap = saved && !!findRoom(this.hiveClient.getGameMap(), saved.author, saved.permlink);
      this.player = {
        username: identity.username,
        location: savedInMap ? saved! : config.game.startRoom,
        isAdmin: false,
        isBuilder: false,
        characterDescription: '',
        isGuest: true
      };
      this.mutes.setViewer(identity.username);

      await this.loadRoom(this.player.location!, true);
      if (!this.currentRoom && savedInMap) {
        this.player.location = config.game.startRoom;
        await this.loadRoom(this.player.location, true);
      }

      this.emit('playerChanged', this.player);
      this.isLoggingIn = false;

      if (this.player.location && this.currentRoom) {
        this.hasReceivedInitialPlayerList = true;
        this.displayRoom();
      }

      this.hiveClient.startBlockStream();
    } catch (error) {
      this.isLoggingIn = false;
      logger.error('[GameState] Guest login failed:', error);
      throw error;
    }
  }

  private guestOnly(action: string): boolean {
    if (!this.player?.isGuest) return false;
    this.addOutputMessage(`Guests can't ${action}. Log in with a Hive account to do that.`, true);
    return true;
  }

  // ----- Exit narration (lines other players see) -----
  private narrated = new Map<string, number>();

  private markNarrated(key: string): void {
    this.narrated.set(key, Date.now() + 5000);
  }

  /** True once if a room-authored line replaced the generic "has entered/left" line. */
  private wasNarrated(key: string): boolean {
    const until = this.narrated.get(key);
    if (until === undefined) return false;
    this.narrated.delete(key);
    return until > Date.now();
  }

  /** Players muted in this browser (the mute feature adds `this.mutes`). Hive mutes are applied by the server. */
  private isNarrationHidden(name: string): boolean {
    const mutes = (this as unknown as { mutes?: { isMuted(n: string): boolean } }).mutes;
    return Boolean(mutes && mutes.isMuted(name));
  }

  /** Fetch a room's post again, bypassing the cache (e.g. after Edit Room). */
  async reloadRoom(location: Location): Promise<void> {
    this.hiveClient.invalidateRoom(location.author, location.permlink);
    await this.loadRoom(location);
  }

  async loadRoom(location: Location, skipDisplay: boolean = false): Promise<void> {
    try {
      const room = await this.hiveClient.getRoomData(location);

      if (!room) {
        logger.error(`[GameState] getRoomData returned null for ${location.author}/${location.permlink}`);
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

      // Check if this is a time-based room and apply dynamic exits
      const timeEventConfig = this.hiveClient.getTimeEventConfig(this.roomKeyOf(location));
      if (timeEventConfig && timeEventConfig.phases?.[timeEventConfig.currentPhase]) {
        const currentPhase = timeEventConfig.phases[timeEventConfig.currentPhase];
        roomCopy.exits = currentPhase.exits;
        roomCopy.isTimeBased = true;
        roomCopy.timeEventConfig = timeEventConfig;
        
        logger.debug(`Applied time-based exits for room ${location.permlink}:`, currentPhase.exits);
      }
      
      this.setCurrentRoom(roomCopy);

      // Only display room if not skipped
      if (!skipDisplay) {
        // Don't wait for socket player list on movement — display immediately
        this.hasReceivedInitialPlayerList = true;
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
      // Exits hold a map key (`permlink` or `author/permlink`); fall back to
      // the current room's author for a permlink that isn't on the map.
      const target = resolveExit(this.hiveClient.getGameMap(), destination);
      const location: Location = target
        ? { author: target.author, permlink: target.permlink }
        : splitKey(destination) ?? { author: this.currentRoom.author, permlink: destination };

      // Exit messages set by the room's author (LambdaMOO-style leave/arrive lines)
      const exitMessage = this.currentRoom.exitMessages?.[direction];
      if (exitMessage?.leave) {
        this.addOutputMessage(renderExitMessage(exitMessage.leave, this.player.username), false);
      }
      if ((exitMessage?.othersLeave || exitMessage?.othersArrive) && typeof this.socketManager?.announceExit === 'function') {
        this.socketManager.announceExit({
          from: `${this.currentRoom.author}/${this.currentRoom.permlink}`,
          to: `${location.author}/${location.permlink}`,
          direction,
          othersLeave: Boolean(exitMessage.othersLeave),
          othersArrive: Boolean(exitMessage.othersArrive)
        });
      }

      // OPTIMISTIC UPDATE: Update local state immediately for instant feedback
      this.player.location = location;
      this.emit('playerChanged', this.player);
      
      // Load new room optimistically (using cached data)
      await this.loadRoom(location);

      if (exitMessage?.arrive) {
        this.addOutputMessage(renderExitMessage(exitMessage.arrive, this.player.username), false);
      }
      
      // Update player location: guests keep it in this browser, everyone else on Hive
      if (this.player.isGuest) {
        guestSession.saveLocation(location);
      } else {
        await this.hiveClient.moveTo(this.player.username, location);
      }
      
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

  // ----- Home (LambdaMOO's @sethome / home) -----
  private homeLocation: Location | null = null;

  private isOnMap(location: Location | null | undefined): location is Location {
    return Boolean(location && this.hiveClient.getGameMap()[location.permlink]?.author === location.author);
  }

  /** sethome: make the current room home. Saved on Hive, or in this browser for guests. */
  public async setHome(): Promise<void> {
    if (!this.player || !this.currentRoom) {
      this.addOutputMessage('You must be in a room to make it your home.', true);
      return;
    }
    const here: Location = { author: this.currentRoom.author, permlink: this.currentRoom.permlink };
    if (!this.isOnMap(here)) {
      this.addOutputMessage("This room isn't on the map, so it can't be your home.", true);
      return;
    }
    try {
      if (this.player.isGuest) {
        saveGuestHome(this.player.username, here);
      } else {
        await this.hiveClient.setPlayerHome(this.player.username, here);
      }
      this.homeLocation = here;
      this.addOutputMessage(`${this.currentRoom.title} is now your home. Type 'home' to come back here from anywhere.`, false);
    } catch (error) {
      logger.warn('[GameState] Could not save home:', error);
      this.addOutputMessage(`Couldn't save your home: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  /** home: go to your home room (or the start room if you haven't set one). */
  public async goHome(): Promise<void> {
    if (!this.player || !this.player.location) {
      this.addOutputMessage('You must be in the world to go home.', true);
      return;
    }
    const saved = this.player.isGuest ? loadGuestHome(this.player.username) : this.homeLocation;
    const hasHome = this.isOnMap(saved);
    const home = hasHome ? saved : config.game.startRoom;
    if (this.currentRoom && this.currentRoom.author === home.author && this.currentRoom.permlink === home.permlink) {
      this.addOutputMessage("You're already home.", false);
      return;
    }
    this.addOutputMessage(hasHome
      ? 'You head home.'
      : saved
        ? "Your home isn't on the map any more, so you head back to where you started. Type 'sethome' in a room to make it home."
        : "You haven't set a home, so you head back to where you started. Type 'sethome' in a room to make it home.", false);
    const previous = this.player.location;
    this.player.location = { author: home.author, permlink: home.permlink };
    this.emit('playerChanged', this.player);
    await this.loadRoom(this.player.location);
    try {
      if (this.player.isGuest) {
        guestSession.saveLocation(this.player.location);
      } else {
        await this.hiveClient.moveTo(this.player.username, this.player.location);
      }
    } catch (error) {
      logger.warn('[GameState] Could not save the move home:', error);
      this.addOutputMessage('Failed to move.', true);
      this.player.location = previous;
      await this.loadRoom(previous);
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

    const guestName = roomPlayers.find(player => player.toLowerCase() === targetUsername.toLowerCase());
    if (guestName && /^Guest-\d{6}$/.test(guestName)) {
      this.addOutputMessage(`${guestName} is a guest, looking around without a Hive account.`, false);
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

  /** eject <player>: the current room's author removes someone (server checks it). */
  public ejectPlayer(target: string): void {
    if (!this.player || !this.currentRoom) {
      this.addOutputMessage('You must be in a room to do that.', true);
      return;
    }
    if (this.currentRoom.author !== this.player.username) {
      this.addOutputMessage('You can only remove people from rooms you built.', true);
      return;
    }
    if (!this.socketManager || typeof this.socketManager.ejectPlayer !== 'function' || !this.socketManager.ejectPlayer(target)) {
      this.addOutputMessage("Chat isn't connected, so you can't remove anyone right now.", true);
      return;
    }
  }

  /** The room's author removed this player: send them to the start room. */
  private async handleEjected(data: { channelId: string; by: string; until: number }): Promise<void> {
    if (!this.player) return;
    const here = this.currentRoom ? `${this.currentRoom.author}/${this.currentRoom.permlink}` : null;
    if (here !== data.channelId) return; // already left that room
    const roomName = this.currentRoom?.title ?? 'that room';
    const minutes = Math.max(1, Math.ceil((data.until - Date.now()) / 60000));
    this.addOutputMessage(`${data.by} has removed you from ${roomName}. You can return in ${minutes} minute${minutes === 1 ? '' : 's'}.`, true);
    const start = config.game.startRoom;
    if (data.channelId === `${start.author}/${start.permlink}`) return; // nowhere else to send them
    this.player.location = { ...start };
    this.emit('playerChanged', this.player);
    await this.loadRoom(this.player.location);
    try {
      if (this.player.isGuest) {
        guestSession.saveLocation(this.player.location);
      } else {
        await this.hiveClient.moveTo(this.player.username, this.player.location);
      }
    } catch (error) {
      logger.warn('[GameState] Could not save the move to the start room:', error);
    }
  }

  public async setDescription(description: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to set your description.', true);
      return;
    }
    if (this.guestOnly('set a description')) return;

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
    if (this.guestOnly('set a description')) return;

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

  private async loadPlayerDescriptions(account?: any): Promise<void> {
    if (!this.player) return;

    try {
      const resolved = account || (await this.hiveClient.database.call('get_accounts', [[this.player.username]]))?.[0];
      if (resolved?.posting_json_metadata) {
        const metadata = JSON.parse(resolved.posting_json_metadata);
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

    // Update player location: guests keep it in this browser, everyone else on Hive
    if (this.player.isGuest) {
      guestSession.saveLocation(location);
    } else {
      await this.hiveClient.moveTo(this.player.username, location);
    }
    
    // Update local state
    this.player.location = location;
  }

  /** Where a guest in this browser last was, if that room is still on the map. */
  private guestStartFor(): Location | null {
    const saved = guestSession.load()?.location;
    if (!saved) return null;
    return this.hiveClient.getGameMap()[saved.permlink]?.author === saved.author ? saved : null;
  }

  /** signup: how to go from guest to Hive player. */
  public showSignup(): void {
    for (const line of signupLines()) this.addOutputMessage(line, false);
  }

  // Getters
  public getPlayer(): Player | null {
    return this.player;
  }

  /** help <topic> */
  public helpTopic(name: string): void {
    const topic = findHelpTopic(name);
    if (!topic) {
      this.addOutputMessage(`There's no help on "${name}". ${helpIndexLine()}`, true);
      return;
    }
    this.addOutputMessage(`\n${topic.title}`, true);
    for (const line of topic.lines) this.addOutputMessage(line, false);
  }

  /** The line after plain `help` pointing at the topics. */
  public helpIndex(): void {
    this.addOutputMessage(helpIndexLine(), false);
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
  /**
   * Players hidden by this browser's mute list (the mute feature adds
   * `this.mutes`). Hive mutes are already applied by the server.
   */
  private isPrivateSenderHidden(name: string): boolean {
    const mutes = (this as unknown as { mutes?: { isMuted(n: string): boolean } }).mutes;
    return Boolean(mutes && mutes.isMuted(name));
  }

  /** page / whisper: private messages through the chat server, never written to Hive. */
  public sendPrivate(kind: 'page' | 'whisper', target: string, message: string): void {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to do that.', true);
      return;
    }
    if (!this.socketManager || typeof this.socketManager.sendPrivate !== 'function' || !this.socketManager.sendPrivate(kind, target, message)) {
      this.addOutputMessage("Chat isn't connected right now.", true);
    }
  }

  public requestWho(): void {
    if (!this.socketManager || typeof this.socketManager.requestWho !== 'function' || !this.socketManager.requestWho()) {
      this.addOutputMessage("Chat isn't connected right now.", true);
    }
  }

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

    this.addOutputMessage(`You ${conjugateEmoteForSender(emote)}`, false);

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
    this.addOutputMessage('page <player> <message> - Send a private message to someone online, anywhere', false);
    this.addOutputMessage('whisper <player> <message> - Say something privately to someone in this room', false);
    this.addOutputMessage('who - List who is online', false);
    this.addOutputMessage('emote <action> - Perform an action in the current room', false);
    this.addOutputMessage('sethome - Make this room your home; home - Go back there from anywhere', false);
    this.addOutputMessage('look - Look around the current room', false);
    this.addOutputMessage('eject <player> - Remove someone from a room you built, for 10 minutes', false);
    this.addOutputMessage('look self - View your character description', false);
    this.addOutputMessage('look <player> - View another player\'s description', false);
    this.addOutputMessage('typo <note>, bug <note>, idea <note> - Send feedback to the author of this room', false);
    this.addOutputMessage('@describe <description> - Set your character description', false);
    this.addOutputMessage('signup - How to get a Hive account (for guests)', false);
    this.addOutputMessage('@describeshort <short description> - Set your character short description', false);
    this.addOutputMessage('mute <player> - Stop seeing a player\'s chat, emotes and comings and goings', false);
    this.addOutputMessage('unmute <player> - See them again', false);
    this.addOutputMessage('muted - List the players you have muted', false);
    this.addOutputMessage('help - Show this help message', false);
  }

  private lastFeedbackAt: number = 0;
  private static readonly FEEDBACK_COOLDOWN_MS = 20 * 1000;

  /**
   * typo / bug / idea: send a note to the author of the current room as a
   * Hive comment on the room's post.
   */
  public async sendRoomFeedback(kind: FeedbackKind, text: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to send feedback.', true);
      return;
    }
    if (this.player.isGuest) {
      this.addOutputMessage("Feedback goes to the room's author as a Hive comment, so it needs a Hive account. Type 'signup' to find out how to get one.", true);
      return;
    }
    const room = this.currentRoom;
    if (!room) {
      this.addOutputMessage("You're not in a room.", true);
      return;
    }
    if (!text) {
      this.addOutputMessage(`Usage: ${kind} <note>. For example: ${kind} ${kind === 'typo' ? '"anicent" should be "ancient"' : kind === 'bug' ? 'the north exit goes nowhere' : 'a bench by the window would be nice'}`, true);
      return;
    }
    const now = Date.now();
    if (now - this.lastFeedbackAt < GameState.FEEDBACK_COOLDOWN_MS) {
      this.addOutputMessage('Please wait a few seconds before sending more feedback.', true);
      return;
    }
    try {
      await this.hiveClient.postRoomFeedback(this.player.username, { author: room.author, permlink: room.permlink, title: room.title }, kind, text);
      this.lastFeedbackAt = now;
      const what = kind === 'idea' ? 'idea' : `${kind} report`;
      this.addOutputMessage(`Sent your ${what} to ${room.author} as a comment on "${room.title}". Hive will notify them.`, false);
    } catch (error) {
      logger.warn('[GameState] Feedback failed:', error);
      this.addOutputMessage(`Couldn't send your feedback: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private async checkBuilderEligibility(username: string): Promise<void> {
    if (this.player?.isBuilder) return;
    try {
      const progress = await this.hiveClient.getBuilderProgress(username);
      logger.debug(`[Builder] ${username} progress — rooms: ${progress.uniqueRooms}, hours: ${(progress.totalSeconds / 3600).toFixed(1)}`);
      if (progress.explorerMet && progress.chroniclerMet && this.socketManager?.isConnected()) {
        this.socketManager.claimBuilder();
      }
    } catch (error) {
      logger.error('[Builder] Error checking builder eligibility:', error);
    }
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
      socketManager.on('playerUsedExit', (data: { username: string; channelId: string; direction: string }) => {
        const room = this.currentRoom;
        if (!room || `${room.author}/${room.permlink}` !== data.channelId || this.isNarrationHidden(data.username)) return;
        const line = room.exitMessages?.[data.direction]?.othersLeave;
        if (!line) return;
        this.markNarrated(`leave:${data.username}`);
        this.addOutputMessage(renderExitMessage(line, data.username), false);
      });

      socketManager.on('playerArrivedVia', (data: { username: string; channelId: string; from: string; direction: string }) => {
        const room = this.currentRoom;
        if (!room || `${room.author}/${room.permlink}` !== data.channelId || this.isNarrationHidden(data.username)) return;
        const slash = data.from.indexOf('/');
        if (slash < 1) return;
        this.markNarrated(`join:${data.username}`);
        void this.hiveClient.getRoomData({ author: data.from.slice(0, slash), permlink: data.from.slice(slash + 1) })
          .then(source => {
            const line = source?.exitMessages?.[data.direction]?.othersArrive;
            if (line) this.addOutputMessage(renderExitMessage(line, data.username), false);
            else this.addOutputMessage(`${data.username} has entered the room.`, false);
          })
          .catch(() => this.addOutputMessage(`${data.username} has entered the room.`, false));
      });

      socketManager.on('chatUnavailable', (data: { message: string }) => {
        if (!this.hasNotifiedChatOffline) {
          this.addOutputMessage(data.message, true);
          this.hasNotifiedChatOffline = true;
        }
      });
      
      socketManager.on('ejectResult', (data: { ok: boolean; message: string }) => {
        this.addOutputMessage(data.message, !data.ok);
      });

      socketManager.on('playerEjected', (data: { channelId: string; target: string; by: string }) => {
        if (!this.player || data.target === this.player.username) return;
        this.addOutputMessage(`${data.target} has been removed from the room by ${data.by}.`, false);
      });

      socketManager.on('ejected', (data: { channelId: string; by: string; until: number }) => {
        void this.handleEjected(data);
      });

      socketManager.on('builderGranted', (data: { username: string }) => {
        if (this.player && this.player.username === data.username && !this.player.isBuilder) {
          this.player.isBuilder = true;
          this.emit('playerChanged', this.player);
          this.addOutputMessage('*Something shifts in the fabric of this world. You sense it now — the power to shape it is yours. You are a Builder.*', false);
        }
      });

      socketManager.on('privateMessage', (data: { kind: 'page' | 'whisper'; from: string; message: string }) => {
        if (this.isPrivateSenderHidden(data.from)) return;
        const verb = data.kind === 'page' ? 'pages you from afar' : 'whispers to you';
        this.addOutputMessage(`${data.from} ${verb}: "${data.message}"`, false);
      });

      socketManager.on('privateResult', (data: { ok: boolean; kind: 'page' | 'whisper'; target: string; message: string }) => {
        if (data.ok) {
          this.addOutputMessage(`You ${data.kind} ${data.target}: "${data.message}"`, false);
        } else {
          this.addOutputMessage(data.message, true);
        }
      });

      socketManager.on('whoList', (data: { players: string[] }) => {
        const players = (data.players || []).filter(p => !this.isPrivateSenderHidden(p));
        this.addOutputMessage(players.length
          ? `Online now (${players.length}): ${players.join(', ')}`
          : 'Nobody else is online right now.', false);
      });

      socketManager.on('connectionStatusChanged', (data: { status: string; error?: string }) => {
        if (data.status === 'failed') {
          if (this.disconnectDebounceTimer) {
            clearTimeout(this.disconnectDebounceTimer);
            this.disconnectDebounceTimer = null;
          }
          if (!this.hasNotifiedChatOffline) {
            this.addOutputMessage('Chat server is unavailable. You can still navigate and play the game.', true);
            this.hasNotifiedChatOffline = true;
          }
        } else if (data.status === 'connected') {
          if (this.disconnectDebounceTimer) {
            clearTimeout(this.disconnectDebounceTimer);
            this.disconnectDebounceTimer = null;
          }
          this.addOutputMessage('Chat server connected. Chat is now available.', false);
          this.hasNotifiedChatOffline = false; // Reset flag when chat comes back online
        } else if (data.status === 'disconnected') {
          if (this.disconnectDebounceTimer) {
            clearTimeout(this.disconnectDebounceTimer);
          }
          this.disconnectDebounceTimer = setTimeout(() => {
            if (!this.hasNotifiedChatOffline) {
              this.addOutputMessage('Chat server disconnected. Chat is no longer available.', true);
              this.hasNotifiedChatOffline = true;
            }
          }, 5000);
        }
      });

      socketManager.on('playerUsedObject', (data: { username: string; channelId: string; object: string; verb: string }) => {
        const room = this.currentRoom;
        if (!room || `${room.author}/${room.permlink}` !== data.channelId || data.username === this.player?.username) return;
        const mutes = (this as unknown as { mutes?: { isMuted(n: string): boolean } }).mutes; // from the mute feature, if present
        if (mutes?.isMuted(data.username)) return;
        const line = room.objects?.[data.object]?.[data.verb]?.others;
        if (line) this.addOutputMessage(renderObjectLine(line, data.username), false);
      });
    }
  }

  /**
   * "ring bell": run one of the current room's author-written object actions.
   * Returns false if the input isn't one, so the caller can say "Invalid command".
   */
  public tryRoomObject(input: string): boolean {
    if (!this.player || !this.currentRoom) return false;
    const match = matchObjectAction(this.currentRoom.objects, input);
    if (!match) return false;
    this.addOutputMessage(renderObjectLine(match.action.self, this.player.username), false);
    if (match.action.others && typeof this.socketManager?.announceObjectUse === 'function') {
      this.socketManager.announceObjectUse({
        channelId: `${this.currentRoom.author}/${this.currentRoom.permlink}`,
        object: match.object,
        verb: match.verb
      });
    }
    return true;
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

  // Method to update room players (called by socket events)
  // ----- Mutes -----

  public isMuted(username: string | undefined | null): boolean {
    return this.mutes.isMuted(username);
  }

  private hideFromRoom(target: string): void {
    if (this.currentRoom?.players) {
      this.currentRoom.players = this.currentRoom.players.filter(p => p.toLowerCase() !== target.toLowerCase());
      this.emit('roomPlayersUpdated', { players: this.currentRoom.players });
    }
  }

  public async mute(target: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to mute someone.', true);
      return;
    }
    if (target.toLowerCase() === this.player.username.toLowerCase()) {
      this.addOutputMessage("You can't mute yourself.", true);
      return;
    }

    // Guests can't write to Hive, and guests have no Hive account to mute.
    if (this.player.isGuest || isGuestName(String(target))) {
      this.mutes.addLocal(target);
      this.hideFromRoom(target);
      this.addOutputMessage(`You muted ${target}. This is saved in this browser.`, false);
      return;
    }

    const name = target.toLowerCase();
    try {
      await this.hiveClient.setHiveMute(this.player.username, name, true);
    } catch (error) {
      logger.warn('[GameState] Hive mute failed:', error);
      this.addOutputMessage(`Couldn't mute ${name} on Hive: ${error instanceof Error ? error.message : String(error)}`, true);
      return;
    }
    this.mutes.addSessionHive(name);
    this.hideFromRoom(name);
    this.socketManager?.refreshMutes();
    this.addOutputMessage(`You muted ${name}. It's saved to your Hive mute list, so it applies across Hive too.`, false);
  }

  public async unmute(target: string): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to unmute someone.', true);
      return;
    }
    if (this.player.isGuest || isGuestName(String(target))) {
      if (this.mutes.removeLocal(target)) {
        this.addOutputMessage(`You unmuted ${target}.`, false);
      } else {
        this.addOutputMessage(`${target} isn't muted.`, true);
      }
      return;
    }

    const name = target.toLowerCase();
    // A Hive name could also have been muted locally by an older client; clear both.
    const hadLocal = this.mutes.removeLocal(name);
    try {
      await this.hiveClient.setHiveMute(this.player.username, name, false);
    } catch (error) {
      logger.warn('[GameState] Hive unmute failed:', error);
      this.addOutputMessage(`Couldn't unmute ${name} on Hive: ${error instanceof Error ? error.message : String(error)}`, true);
      if (!hadLocal) return;
    }
    this.mutes.removeSessionHive(name);
    this.socketManager?.refreshMutes();
    this.addOutputMessage(`You unmuted ${name}. It can take a minute for their messages to reach you again.`, false);
  }

  public async listMuted(): Promise<void> {
    if (!this.player) {
      this.addOutputMessage('You must be logged in to see your mutes.', true);
      return;
    }
    const local = this.mutes.localNames();
    let hive: string[] = [];
    if (!this.player.isGuest) {
      try {
        hive = await this.hiveClient.getHiveMutes(this.player.username);
      } catch (error) {
        logger.warn('[GameState] Could not load Hive mutes:', error);
        this.addOutputMessage("Couldn't load your Hive mute list right now.", true);
      }
    }
    if (local.length === 0 && hive.length === 0) {
      this.addOutputMessage("You haven't muted anyone.", false);
      return;
    }
    if (hive.length > 0) {
      this.addOutputMessage(`Muted on Hive (${hive.length}): ${hive.sort().join(', ')}`, false);
    }
    if (local.length > 0) {
      this.addOutputMessage(`Muted in this browser (${local.length}): ${local.join(', ')}`, false);
    }
  }

  public updateRoomPlayers(incoming: string[]): void {
    // Players muted in this browser aren't shown (Hive mutes are filtered by the server).
    const players = incoming.filter(p => !this.mutes.isMuted(p));
    if (this.currentRoom) {
      const oldPlayers = this.currentRoom.players || [];
      logger.debug('[GameState] updateRoomPlayers called:', { oldPlayers, newPlayers: players });
      this.currentRoom.players = players;
      
      // Emit event to notify UI of player list update
      this.emit('roomPlayersUpdated', { players });
      
      // Mark that we've received the initial player list
      if (!this.hasReceivedInitialPlayerList) {
        this.hasReceivedInitialPlayerList = true;
      } else if (!this.isLoggingIn && players.filter(p => p !== this.player?.username).length > oldPlayers.filter(p => p !== this.player?.username).length) {
        logger.debug('[GameState] Other players found on socket connect, refreshing room display');
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
    if (this.wasNarrated(`join:${username}`)) return; // the room's own arrival line was shown
    if (username !== this.player?.username) {
      this.addOutputMessage(`${username} has entered the room.`, false);
    }
  }

  // Method to notify when a player leaves the room
  public notifyPlayerLeft(username: string): void {
    if (this.wasNarrated(`leave:${username}`)) return; // the room's own exit line was shown
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
    
    // Clean up timers
    if (this.disconnectDebounceTimer) {
      clearTimeout(this.disconnectDebounceTimer);
      this.disconnectDebounceTimer = null;
    }
    
    // Stop block stream
    this.hiveClient.stopMoveListener();

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
    this.mutes.setViewer(null);
    
    // Reset flags
    this.isLoggingIn = false;
    this.isProcessingMovement = false;
    this.isBulkDataLoaded = false;
    this.hasNotifiedChatOffline = false;
    this.hasReceivedInitialPlayerList = false;
    this.lastDisplayedRoom = null;
    this.lastOptimisticRoomKey = null;
    this.currentRoomIdentifier = null;
  }
} 