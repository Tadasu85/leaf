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
}

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