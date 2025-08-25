// VSC GameKernel Contract for Leaf Text Adventure Games
// This contract handles dynamic game logic and verb execution
// Simplified version for testing without Massa SDK dependencies

// Event types for client consumption
export class VerbOutputEvent {
  constructor(
    public roomId: string,
    public lines: string[],
    public timestamp: u64
  ) {}
}

export class RoomEffectEvent {
  constructor(
    public roomId: string,
    public effects: Effect[],
    public timestamp: u64
  ) {}
}

export class PlayerEffectEvent {
  constructor(
    public player: string,
    public effects: Effect[],
    public timestamp: u64
  ) {}
}

// Effect types for dynamic room modifications
export class Effect {
  constructor(
    public type: string,
    public data: string
  ) {}
}

// Verb result structure
export class VerbResult {
  constructor(
    public output: string[],
    public effects: Effect[]
  ) {}
}

// Player state tracking
export class PlayerState {
  constructor(
    public player: string,
    public currentRoom: string,
    public inventory: Map<string, string>,
    public stats: Map<string, u32>,
    public lastSeen: u64
  ) {}
}

// Room state tracking
export class RoomState {
  constructor(
    public roomId: string,
    public players: string[],
    public details: Map<string, string>,
    public exits: Map<string, string>,
    public items: Map<string, string>,
    public lastUpdated: u64
  ) {}
}

// Main contract class
export class GameKernel {
  private rooms: Map<string, RoomState>;
  private players: Map<string, PlayerState>;

  constructor() {
    this.rooms = new Map<string, RoomState>();
    this.players = new Map<string, PlayerState>();
  }

  // Core hook: Player enters a room
  on_enter(roomId: string, player: string): VerbResult {
    const timestamp = this.getTimestamp();
    
    // Get or create room state
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new RoomState(roomId, [], new Map<string, string>(), new Map<string, string>(), new Map<string, string>(), timestamp);
      this.rooms.set(roomId, room);
    }
    
    // Get or create player state
    let playerState = this.players.get(player);
    if (!playerState) {
      playerState = new PlayerState(player, roomId, new Map<string, string>(), new Map<string, string>(), timestamp);
      this.players.set(player, playerState);
    }
    
    // Handle room transition if player was in another room
    if (playerState.currentRoom !== roomId) {
      this.handleRoomTransition(player, playerState.currentRoom, roomId);
    }
    
    // Update player state
    playerState.currentRoom = roomId;
    playerState.lastSeen = timestamp;
    
    // Add player to room if not already present
    if (!room.players.includes(player)) {
      room.players.push(player);
      room.lastUpdated = timestamp;
    }
    
    // Return welcome message and any room-specific effects
    const output = [`Welcome to ${roomId}!`];
    const effects: Effect[] = [];
    
    return new VerbResult(output, effects);
  }

  // Core hook: Player leaves a room
  on_leave(roomId: string, player: string): VerbResult {
    const timestamp = this.getTimestamp();
    
    const room = this.rooms.get(roomId);
    if (room) {
      // Remove player from room
      const playerIndex = room.players.indexOf(player);
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        room.lastUpdated = timestamp;
      }
    }
    
    return new VerbResult([], []);
  }

  // Core hook: Player says something
  on_say(roomId: string, player: string, message: string): VerbResult {
    const timestamp = this.getTimestamp();
    
    // Check for special commands in messages
    if (message.startsWith('!')) {
      return this.handleSpecialCommand(roomId, player, message.substring(1));
    }
    
    return new VerbResult([], []);
  }

  // Core hook: Player emotes
  on_emote(roomId: string, player: string, emote: string): VerbResult {
    const timestamp = this.getTimestamp();
    
    return new VerbResult([], []);
  }

  // Core hook: Player executes a command
  on_command(roomId: string, player: string, commandText: string): VerbResult {
    const timestamp = this.getTimestamp();
    
    // Parse command
    const parts = commandText.split(' ');
    const verb = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Route to appropriate verb handler
    switch (verb) {
      case 'inspect':
        return this.handleInspect(roomId, player, args);
      case 'toggle_exit':
        return this.handleToggleExit(roomId, player, args);
      case 'set_detail':
        return this.handleSetDetail(roomId, player, args);
      case 'clear_detail':
        return this.handleClearDetail(roomId, player, args);
      case 'take':
        return this.handleTake(roomId, player, args);
      case 'drop':
        return this.handleDrop(roomId, player, args);
      case 'inventory':
        return this.handleInventory(player);
      case 'stats':
        return this.handleStats(player);
      case 'give':
        return this.handleGive(roomId, player, args);
      default:
        return new VerbResult([`Unknown command: ${verb}. Try 'inspect', 'toggle_exit', 'set_detail', 'clear_detail', 'take', 'drop', 'inventory', 'stats', or 'give'.`], []);
    }
  }

  // Verb: Inspect room details
  private handleInspect(roomId: string, player: string, args: string[]): VerbResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return new VerbResult(['Room not found.'], []);
    }
    
    const output: string[] = [`Room: ${roomId}`];
    output.push(`Players present: ${room.players.join(', ')}`);
    
    if (room.details.size > 0) {
      output.push('Room details:');
      room.details.forEach((value, key) => {
        output.push(`  ${key}: ${value}`);
      });
    }
    
    if (room.exits.size > 0) {
      output.push('Exits:');
      room.exits.forEach((destination, direction) => {
        output.push(`  ${direction}: ${destination}`);
      });
    }
    
    if (room.items.size > 0) {
      output.push('Items in room:');
      room.items.forEach((description, item) => {
        output.push(`  ${item}: ${description}`);
      });
    }
    
    return new VerbResult(output, []);
  }

  // Verb: Toggle an exit (add/remove)
  private handleToggleExit(roomId: string, player: string, args: string[]): VerbResult {
    if (args.length < 2) {
      return new VerbResult(['Usage: toggle_exit <direction> <destination>'], []);
    }
    
    const direction = args[0];
    const destination = args[1];
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return new VerbResult(['Room not found.'], []);
    }
    
    // Check if exit already exists
    if (room.exits.has(direction)) {
      room.exits.delete(direction);
      const effect = new Effect('ClearExit', direction);
      return new VerbResult([`Exit ${direction} removed.`], [effect]);
    } else {
      room.exits.set(direction, destination);
      const effect = new Effect('SetExit', JSON.stringify({ direction, destination }));
      return new VerbResult([`Exit ${direction} added to ${destination}.`], [effect]);
    }
  }

  // Verb: Set a room detail
  private handleSetDetail(roomId: string, player: string, args: string[]): VerbResult {
    if (args.length < 2) {
      return new VerbResult(['Usage: set_detail <key> <value>'], []);
    }
    
    const key = args[0];
    const value = args.slice(1).join(' ');
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return new VerbResult(['Room not found.'], []);
    }
    
    room.details.set(key, value);
    const effect = new Effect('SetDetail', JSON.stringify({ key, value }));
    
    return new VerbResult([`Detail '${key}' set to '${value}'.`], [effect]);
  }

  // Verb: Clear a room detail
  private handleClearDetail(roomId: string, player: string, args: string[]): VerbResult {
    if (args.length < 1) {
      return new VerbResult(['Usage: clear_detail <key>'], []);
    }
    
    const key = args[0];
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return new VerbResult(['Room not found.'], []);
    }
    
    if (room.details.has(key)) {
      room.details.delete(key);
      const effect = new Effect('ClearDetail', key);
      return new VerbResult([`Detail '${key}' cleared.`], [effect]);
    } else {
      return new VerbResult([`Detail '${key}' not found.`], []);
    }
  }

  // Verb: Take an item from the room
  private handleTake(roomId: string, player: string, args: string[]): VerbResult {
    if (args.length < 1) {
      return new VerbResult(['Usage: take <item>'], []);
    }
    
    const item = args[0];
    const room = this.rooms.get(roomId);
    const playerState = this.players.get(player);
    
    if (!room || !playerState) {
      return new VerbResult(['Room or player not found.'], []);
    }
    
    if (!room.items.has(item)) {
      return new VerbResult([`Item '${item}' not found in this room.`], []);
    }
    
    const description = room.items.get(item)!;
    room.items.delete(item);
    playerState.inventory.set(item, description);
    
    const effect = new Effect('TakeItem', JSON.stringify({ item, description }));
    
    return new VerbResult([`You take the ${item}.`], [effect]);
  }

  // Verb: Drop an item in the room
  private handleDrop(roomId: string, player: string, args: string[]): VerbResult {
    if (args.length < 1) {
      return new VerbResult(['Usage: drop <item>'], []);
    }
    
    const item = args[0];
    const room = this.rooms.get(roomId);
    const playerState = this.players.get(player);
    
    if (!room || !playerState) {
      return new VerbResult(['Room or player not found.'], []);
    }
    
    if (!playerState.inventory.has(item)) {
      return new VerbResult([`You don't have '${item}'.`], []);
    }
    
    const description = playerState.inventory.get(item)!;
    playerState.inventory.delete(item);
    room.items.set(item, description);
    
    const effect = new Effect('DropItem', JSON.stringify({ item, description }));
    
    return new VerbResult([`You drop the ${item}.`], [effect]);
  }

  // Verb: Show player inventory
  private handleInventory(player: string): VerbResult {
    const playerState = this.players.get(player);
    if (!playerState) {
      return new VerbResult(['Player not found.'], []);
    }
    
    const output: string[] = [`${player}'s inventory:`];
    if (playerState.inventory.size === 0) {
      output.push('  (empty)');
    } else {
      playerState.inventory.forEach((description, item) => {
        output.push(`  ${item}: ${description}`);
      });
    }
    
    return new VerbResult(output, []);
  }

  // Verb: Show player stats
  private handleStats(player: string): VerbResult {
    const playerState = this.players.get(player);
    if (!playerState) {
      return new VerbResult(['Player not found.'], []);
    }
    
    const output: string[] = [`${player}'s stats:`];
    if (playerState.stats.size === 0) {
      output.push('  (no stats recorded)');
    } else {
      playerState.stats.forEach((value, stat) => {
        output.push(`  ${stat}: ${value}`);
      });
    }
    
    return new VerbResult(output, []);
  }

  // Verb: Give an item to another player
  private handleGive(roomId: string, player: string, args: string[]): VerbResult {
    if (args.length < 2) {
      return new VerbResult(['Usage: give <player> <item>'], []);
    }
    
    const targetPlayer = args[0];
    const item = args[1];
    const room = this.rooms.get(roomId);
    const playerState = this.players.get(player);
    const targetPlayerState = this.players.get(targetPlayer);
    
    if (!room || !playerState || !targetPlayerState) {
      return new VerbResult(['Room or player not found.'], []);
    }
    
    if (!room.players.includes(targetPlayer)) {
      return new VerbResult([`${targetPlayer} is not in this room.`], []);
    }
    
    if (!playerState.inventory.has(item)) {
      return new VerbResult([`You don't have '${item}'.`], []);
    }
    
    const description = playerState.inventory.get(item)!;
    playerState.inventory.delete(item);
    targetPlayerState.inventory.set(item, description);
    
    const effect = new Effect('GiveItem', JSON.stringify({ from: player, to: targetPlayer, item, description }));
    
    return new VerbResult([`You give the ${item} to ${targetPlayer}.`], [effect]);
  }

  // Helper: Handle room transitions
  private handleRoomTransition(player: string, fromRoomId: string, toRoomId: string): void {
    if (fromRoomId && fromRoomId !== toRoomId) {
      const fromRoom = this.rooms.get(fromRoomId);
      if (fromRoom) {
        const playerIndex = fromRoom.players.indexOf(player);
        if (playerIndex > -1) {
          fromRoom.players.splice(playerIndex, 1);
          fromRoom.lastUpdated = this.getTimestamp();
        }
      }
    }
  }

  // Helper: Handle special commands (commands starting with !)
  private handleSpecialCommand(roomId: string, player: string, command: string): VerbResult {
    // This could be expanded for admin commands, etc.
    return new VerbResult([`Special command '${command}' received.`], []);
  }

  // Helper: Get current timestamp (simplified)
  private getTimestamp(): u64 {
    return 0; // In a real implementation, this would get the actual timestamp
  }

  // Utility: Get room state (for external queries)
  get_room_state(roomId: string): RoomState | null {
    return this.rooms.get(roomId) || null;
  }

  // Utility: Get player state (for external queries)
  get_player_state(player: string): PlayerState | null {
    return this.players.get(player) || null;
  }

  // Utility: List all rooms
  list_rooms(): string[] {
    const roomIds: string[] = [];
    this.rooms.forEach((_, roomId) => {
      roomIds.push(roomId);
    });
    return roomIds;
  }

  // Utility: List all players
  list_players(): string[] {
    const playerNames: string[] = [];
    this.players.forEach((_, player) => {
      playerNames.push(player);
    });
    return playerNames;
  }
}
