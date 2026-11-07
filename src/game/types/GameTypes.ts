export interface Location {
  author: string;
  permlink: string;
}

export interface Player {
  username: string;
  location: Location | null; // Admin users can have null location
  isAdmin: boolean;
  isBuilder: boolean;
  characterDescription: string;
  /** Guest without a Hive account: position is kept in this browser, nothing is written to Hive. */
  isGuest?: boolean;
}

export interface GameMap {
  [key: string]: {
    author: string;
    permlink?: string;
    title?: string;
    description?: string;
    exits: Record<string, string>;
    timeEvent?: StoredTimeEventConfig;
  };
}

export interface GameOutputMessage {
  output: string;
  bold: boolean;
}

export interface RoomData {
  id: string;
  title: string;
  description: string;
  author: string;
  permlink: string;
  exits: Record<string, string>;
  items?: string[];
  npcs?: string[];
  players?: string[];
  details?: Record<string, string>;
  // New properties for time-based events
  isTimeBased?: boolean;
  timeEventConfig?: TimeEventConfig;
}

// Stored in blockchain (game account metadata) — no runtime state
export interface StoredTimeEventConfig {
  type: 'ferry' | 'market' | 'weather' | 'custom';
  intervalBlocks: number;
  startBlock: number; // Block at which the phase schedule begins (defaults to approval block)
  startPhase?: number; // Phase the schedule begins in at startBlock (default 0)
  phases: TimeEventPhase[];
}

// Runtime representation — adds currentPhase computed from block number
export interface TimeEventConfig extends StoredTimeEventConfig {
  currentPhase: number;
}

export interface TimeEventPhase {
  phase: number;
  name: string;
  description: string;
  exits: Record<string, string>;
  duration?: number; // Optional per-phase override; if absent, intervalBlocks is used
}

export interface BlockchainTimeEvent {
  type: 'timeEvent';
  roomPermlink: string;
  currentBlock: number;
  eventType: string;
  phase: number;
  timestamp: string;
}

export interface MoveEvent {
  username: string;
  location: Location;
  transactionId: string;
  timestamp: string;
}

// Union type for all blockchain events
export type BlockchainEvent = MoveEvent | BlockchainTimeEvent;

export type CommandType = 
  | 'login'
  | 'move'
  | 'say'
  | 'emote'
  | 'look'
  | 'lookAt'
  | 'help'
  | 'describe'
  | 'describeshort'
  | 'feedback';

export interface Command {
  type: CommandType;
  args: string[];
  timestamp: number;
}

export interface UserProfileJSON {
  egodeathplayer?: {
    Name?: string;
    Description?: string;
    ShortDesc?: string;
  };
  profile_image?: string;
}

// Legacy types that will be deprecated
export interface LegacyRoomData {
  body: string;
  title: string;
  players: string[];
  details: {
    [key: string]: string;
  };
  exits: {
    [key: string]: string;
  };
  author: string;
  permlink: string;
}

// Alias for backward compatibility
export type GameJSON = GameMap;
export type PlayerLocation = { Location: Location }; 