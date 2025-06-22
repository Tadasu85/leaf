export interface HiveConfig {
  nodes: string[];
  chainId: string;
  accountPrefix: string;
  key: string;
}

export interface GameConfig {
  name: string;
  idName: string;
  account: string;
  accountName: string;
  startRoom: {
    author: string;
    permlink: string;
  };
  defaultCharacterDescription: string;
  category: string;
}

export interface Config {
  hive: HiveConfig;
  game: GameConfig;
  ui: {
    theme: 'light' | 'dark';
    fontFamily: string;
    fontSize: string;
  };
  development: {
    debugMode: boolean;
    testMode: boolean;
  };
  signalingServer: string;
  admins: string[];
  builders: string[];
}

const config: Config = {
  hive: {
    nodes: [process.env.REACT_APP_HIVE_NODE || 'https://api.hive.blog'],
    chainId: process.env.REACT_APP_HIVE_CHAIN_ID || 'beeab0de00000000000000000000000000000000000000000000000000000000',
    accountPrefix: process.env.REACT_APP_HIVE_ACCOUNT_PREFIX || 'STM',
    key: process.env.REACT_APP_HIVE_KEY || ''
  },
  game: {
    name: process.env.REACT_APP_GAME_NAME || 'Leaf Game',
    idName: process.env.REACT_APP_GAME_ID_NAME || 'leaf_game',
    account: process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456',
    accountName: process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456',
    startRoom: {
      author: process.env.REACT_APP_GAME_STARTING_ROOM_AUTHOR || 'raymonjohnstone',
      permlink: process.env.REACT_APP_GAME_STARTING_ROOM_PERMLINK || 'genesis-scaffold-precipice'
    },
    defaultCharacterDescription: process.env.REACT_APP_DEFAULT_CHARACTER_DESCRIPTION || 'A mysterious traveler',
    category: process.env.REACT_APP_GAME_CATEGORY || 'leaf-game'
  },
  ui: {
    theme: (process.env.REACT_APP_UI_THEME as 'light' | 'dark') || 'light',
    fontFamily: process.env.REACT_APP_UI_FONT_FAMILY || 'monospace',
    fontSize: process.env.REACT_APP_UI_FONT_SIZE || '16px',
  },
  development: {
    debugMode: process.env.REACT_APP_DEBUG_MODE === 'false',
    testMode: process.env.REACT_APP_TEST_MODE === 'false',
  },
  signalingServer: process.env.REACT_APP_SIGNALING_SERVER || 'http://localhost:4001',
  admins: ['hive-109456'],
  builders: ['raymonjohnstone'],
};

export default config; 