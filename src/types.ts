export interface GameJSON {
  [key: string]: {
    exits: {
      [key: string]: string;
    };
    author: string;
  };
}

export interface RoomData {
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

export interface PlayerLocation {
  Location: {
    permlink: string;
    author: string;
  };
}

export interface UserProfileJSON {
  egodeathplayer?: {
    Name?: string;
    Description?: string;
    ShortDesc?: string;
  };
  profile_image?: string;
} 