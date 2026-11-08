/**
 * Configuration interface for Hive blockchain connection settings
 */
export interface HiveConfig {
  /** Array of Hive node URLs for blockchain connection */
  nodes: string[];
}

/**
 * Configuration interface for game-specific settings
 */
export interface GameConfig {
  /** Unique identifier for the game used in custom JSON operations */
  idName: string;
  /** Main game account name used for admin checks and blockchain operations */
  account: string;
  /** Starting room configuration for new players */
  startRoom: {
    /** Author of the starting room post */
    author: string;
    /** Permlink of the starting room post */
    permlink: string;
  };
}

/**
 * Main configuration interface for the Leaf game application
 */
export interface Config {
  /** Hive blockchain connection settings */
  hive: HiveConfig;
  /** Game-specific configuration */
  game: GameConfig;
  /** WebSocket signaling server URL for real-time communication */
  signalingServer: string;
  /** Array of admin usernames with full access */
  admins: string[];
  /** Array of builder usernames with room creation permissions */
  builders: string[];
  /**
   * Leaf verbs contract on VSC (Magi). Off until a contract is deployed and
   * REACT_APP_VSC_CONTRACT is set; see contracts/leaf-verbs.
   */
  vsc: {
    contractId: string;
    netId: string;
    /** GraphQL endpoints of VSC nodes, tried in order */
    graphqlUrls: string[];
    rcLimit: number;
  };
}

/**
 * Application configuration with environment variable support
 * All unused configuration properties have been removed for clarity
 */
const config: Config = {
  hive: {
    nodes: [
      process.env.REACT_APP_HIVE_NODE || 'https://api.hive.blog',
      'https://api.hivekings.com',
      'https://anyx.io',
      'https://api.openhive.network'
    ],
  },
  game: {
    idName: process.env.REACT_APP_GAME_ID_NAME || 'ego-death',
    account: process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456',
    startRoom: {
      author: process.env.REACT_APP_GAME_STARTING_ROOM_AUTHOR || 'raymonjohnstone',
      permlink: process.env.REACT_APP_GAME_STARTING_ROOM_PERMLINK || 'genesis-scaffold-precipice'
    },
  },
  signalingServer: process.env.REACT_APP_SIGNALING_SERVER || 
    (process.env.NODE_ENV === 'production' 
      ? (process.env.REACT_APP_PRODUCTION_SIGNALING_SERVER || 'https://leaf-server-23ov.onrender.com')
      : 'http://localhost:4001'),
  admins: ['hive-109456'],
  builders: ['raymonjohnstone'],
  vsc: {
    contractId: process.env.REACT_APP_VSC_CONTRACT || '',
    netId: process.env.REACT_APP_VSC_NET_ID || 'vsc-mainnet',
    graphqlUrls: (process.env.REACT_APP_VSC_GRAPHQL || 'https://vsc.techcoderx.com/api/v1/graphql')
      .split(',').map(u => u.trim()).filter(Boolean),
    rcLimit: Number(process.env.REACT_APP_VSC_RC_LIMIT) || 1000,
  },
};

export default config; 