// VSC GameKernel Contract for Leaf Text Adventure Games
// This contract handles dynamic game logic and verb execution

import { Storage, Context, Contract, generateEvent } from '@massalabs/massa-as-sdk';

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

// Room state tracking
export class RoomState {
  constructor(
    public roomId: string,
    public players: string[],
    public details: Map<string, string>,
    public exits: Map<string, string>,
    public lastUpdated: u64
  ) {}
}

// Main contract class
export class GameKernel extends Contract {
  private storage: Storage;
  private rooms: Map<string, RoomState>;

  constructor() {
    super();
    this.storage = new Storage();
    this.rooms = new Map<string, RoomState>();
  }

  // Core hook: Player enters a room
  on_enter(roomId: string, player: string): VerbResult {
    const context = Context.get();
    const timestamp = context.timestamp;
    
    // Get or create room state
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new RoomState(roomId, [], new Map<string, string>(), new Map<string, string>(), timestamp);
      this.rooms.set(roomId, room);
    }
    
    // Add player to room if not already present
    if (!room.players.includes(player)) {
      room.players.push(player);
      room.lastUpdated = timestamp;
    }
    
    // Emit verb output event
    const outputEvent = new VerbOutputEvent(roomId, [`${player} enters the room.`], timestamp);
    generateEvent(JSON.stringify(outputEvent));
    
    // Return welcome message and any room-specific effects
    const output = [`Welcome to ${roomId}!`];
    const effects: Effect[] = [];
    
    return new VerbResult(output, effects);
  }

  // Core hook: Player leaves a room
  on_leave(roomId: string, player: string): VerbResult {
    const context = Context.get();
    const timestamp = context.timestamp;
    
    const room = this.rooms.get(roomId);
    if (room) {
      // Remove player from room
      const playerIndex = room.players.indexOf(player);
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        room.lastUpdated = timestamp;
      }
      
      // Emit verb output event
      const outputEvent = new VerbOutputEvent(roomId, [`${player} leaves the room.`], timestamp);
      generateEvent(JSON.stringify(outputEvent));
    }
    
    return new VerbResult([], []);
  }

  // Core hook: Player says something
  on_say(roomId: string, player: string, message: string): VerbResult {
    const context = Context.get();
    const timestamp = context.timestamp;
    
    // Emit verb output event for the message
    const outputEvent = new VerbOutputEvent(roomId, [`${player} says: "${message}"`], timestamp);
    generateEvent(JSON.stringify(outputEvent));
    
    // Check for special commands in messages
    if (message.startsWith('!')) {
      return this.handleSpecialCommand(roomId, player, message.substring(1));
    }
    
    return new VerbResult([], []);
  }

  // Core hook: Player emotes
  on_emote(roomId: string, player: string, emote: string): VerbResult {
    const context = Context.get();
    const timestamp = context.timestamp;
    
    // Emit verb output event for the emote
    const outputEvent = new VerbOutputEvent(roomId, [`${player} ${emote}`], timestamp);
    generateEvent(JSON.stringify(outputEvent));
    
    return new VerbResult([], []);
  }

  // Core hook: Player executes a command
  on_command(roomId: string, player: string, commandText: string): VerbResult {
    const context = Context.get();
    const timestamp = context.timestamp;
    
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
      default:
        return new VerbResult([`Unknown command: ${verb}. Try 'inspect', 'toggle_exit', 'set_detail', or 'clear_detail'.`], []);
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
      const effectEvent = new RoomEffectEvent(roomId, [effect], Context.get().timestamp);
      generateEvent(JSON.stringify(effectEvent));
      return new VerbResult([`Exit ${direction} removed.`], [effect]);
    } else {
      room.exits.set(direction, destination);
      const effect = new Effect('SetExit', JSON.stringify({ direction, destination }));
      const effectEvent = new RoomEffectEvent(roomId, [effect], Context.get().timestamp);
      generateEvent(JSON.stringify(effectEvent));
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
    const effectEvent = new RoomEffectEvent(roomId, [effect], Context.get().timestamp);
    generateEvent(JSON.stringify(effectEvent));
    
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
      const effectEvent = new RoomEffectEvent(roomId, [effect], Context.get().timestamp);
      generateEvent(JSON.stringify(effectEvent));
      return new VerbResult([`Detail '${key}' cleared.`], [effect]);
    } else {
      return new VerbResult([`Detail '${key}' not found.`], []);
    }
  }

  // Helper: Handle special commands (commands starting with !)
  private handleSpecialCommand(roomId: string, player: string, command: string): VerbResult {
    // This could be expanded for admin commands, etc.
    return new VerbResult([`Special command '${command}' received.`], []);
  }

  // Utility: Get room state (for external queries)
  get_room_state(roomId: string): RoomState | null {
    return this.rooms.get(roomId) || null;
  }

  // Utility: List all rooms
  list_rooms(): string[] {
    const roomIds: string[] = [];
    this.rooms.forEach((_, roomId) => {
      roomIds.push(roomId);
    });
    return roomIds;
  }
}
