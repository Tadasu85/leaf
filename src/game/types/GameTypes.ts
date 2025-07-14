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
}

export interface GameMap {
  [key: string]: {
    author: string;
    permlink: string;
    title: string;
    description: string;
    exits: Record<string, string>;
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

// New types for blockchain-based time events
export interface TimeEventConfig {
  type: 'ferry' | 'market' | 'weather' | 'custom';
  intervalBlocks: number; // How many blocks between changes
  lastChangeBlock: number; // Last block when the event changed
  currentPhase: number; // Current phase/state of the event
  phases: TimeEventPhase[];
}

export interface TimeEventPhase {
  phase: number;
  name: string;
  description: string;
  exits: Record<string, string>;
  duration: number; // Duration in blocks
}

export interface BlockchainTimeEvent {
  type: 'timeEvent';
  roomPermlink: string;
  author: string;
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
  | 'describeshort';

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