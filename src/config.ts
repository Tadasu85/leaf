interface Config {
  hive: {
    node: string;
    chainId: string;
    accountPrefix: string;
  };
  game: {
    name: string;
    idName: string;
    accountName: string;
    startingRoom: string;
    defaultCharacterDescription: string;
  };
  ui: {
    theme: 'light' | 'dark';
    fontFamily: string;
    fontSize: string;
  };
  development: {
    debugMode: boolean;
    testMode: boolean;
  };
}

const config: Config = {
  hive: {
    node: process.env.REACT_APP_HIVE_NODE || 'https://api.hive.blog',
    chainId: process.env.REACT_APP_HIVE_CHAIN_ID || '782aae9d92bb56fd3b6a25d4f8f260357c0e64b3',
    accountPrefix: process.env.REACT_APP_HIVE_ACCOUNT_PREFIX || '@',
  },
  game: {
    name: process.env.REACT_APP_GAME_NAME || 'Ego Death',
    idName: process.env.REACT_APP_GAME_ID_NAME || 'ego-death',
    accountName: process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456',
    startingRoom: process.env.REACT_APP_GAME_STARTING_ROOM || 'genesis-scaffold-precipice',
    defaultCharacterDescription: process.env.REACT_APP_GAME_DEFAULT_CHARACTER_DESCRIPTION || 'A mysterious figure stands before you.',
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
};

export default config; 