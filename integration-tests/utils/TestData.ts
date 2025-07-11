import { faker } from '@faker-js/faker';

/**
 * Test data and mock users for integration tests
 */
export interface TestUser {
  username: string;
  role: 'regular' | 'builder' | 'admin';
  description?: string;
}

/**
 * Mock users for testing different roles
 */
export const TEST_USERS: TestUser[] = [
  {
    username: 'testuser1',
    role: 'regular',
    description: 'A regular player for testing basic functionality'
  },
  {
    username: 'testuser2',
    role: 'regular',
    description: 'Another regular player for testing social interactions'
  },
  {
    username: 'testbuilder',
    role: 'builder',
    description: 'A builder account for testing room creation features'
  },
  {
    username: 'testadmin',
    role: 'admin',
    description: 'An admin account for testing administrative features'
  },
  // Custom usernames - add your preferred usernames here
  {
    username: 'alice',
    role: 'regular',
    description: 'Alice - a friendly explorer'
  },
  {
    username: 'bob',
    role: 'regular',
    description: 'Bob - a curious adventurer'
  },
  {
    username: 'charlie',
    role: 'builder',
    description: 'Charlie - an experienced builder'
  },
  {
    username: 'diana',
    role: 'admin',
    description: 'Diana - a helpful administrator'
  }
];

/**
 * Generate a random test user
 */
export function generateRandomUser(): TestUser {
  const roles: Array<'regular' | 'builder' | 'admin'> = ['regular', 'builder', 'admin'];
  return {
    username: faker.internet.userName().toLowerCase().replace(/[^a-z0-9]/g, ''),
    role: faker.helpers.arrayElement(roles),
    description: faker.lorem.sentence()
  };
}

/**
 * Sample game commands for testing
 */
export const GAME_COMMANDS = {
  basic: [
    'look',
    'look self',
    'north',
    'south',
    'east',
    'west'
  ],
  social: [
    'say Hello, everyone!',
    'say How are you doing?',
    'say Nice to meet you all',
    'emote waves',
    'emote smiles',
    'emote nods',
    'emote shrugs'
  ],
  character: [
    '@describe A mysterious traveler exploring the digital realm',
    '@describe A curious adventurer seeking knowledge',
    '@describeshort A wanderer',
    '@describeshort An explorer'
  ]
};

/**
 * Sample room descriptions for testing
 */
export const SAMPLE_ROOM_DESCRIPTIONS = [
  'A dimly lit chamber with ancient runes on the walls.',
  'A vast open space filled with floating geometric shapes.',
  'A cozy corner with comfortable seating and warm lighting.',
  'A mysterious portal room with swirling energy patterns.',
  'A library filled with digital books and scrolls.'
];

/**
 * Sample chat messages for testing
 */
export const SAMPLE_CHAT_MESSAGES = [
  'Hello, is anyone here?',
  'This place is amazing!',
  'Has anyone explored the north area?',
  'I love the atmosphere here.',
  'Anyone want to explore together?',
  'What\'s the best way to get to the library?',
  'I found something interesting in the east room.',
  'The graphics are really impressive!'
];

/**
 * Sample emotes for testing
 */
export const SAMPLE_EMOTES = [
  'waves',
  'smiles',
  'nods',
  'shrugs',
  'looks around curiously',
  'stretches',
  'yawns',
  'claps',
  'bows',
  'dances'
];

/**
 * Test scenarios for different user types
 */
export const TEST_SCENARIOS = {
  newUser: {
    name: 'New User Experience',
    steps: [
      'Navigate to game',
      'Read welcome message',
      'Attempt login',
      'Look around',
      'Try basic movement',
      'Interact with environment'
    ]
  },
  regularPlayer: {
    name: 'Regular Player Session',
    steps: [
      'Login',
      'Explore rooms',
      'Chat with others',
      'Use emotes',
      'Set character description',
      'Move between locations'
    ]
  },
  builder: {
    name: 'Builder Session',
    steps: [
      'Login as builder',
      'Access build modal',
      'Create new room',
      'Edit room details',
      'Add exits',
      'Test room functionality'
    ]
  },
  admin: {
    name: 'Admin Session',
    steps: [
      'Login as admin',
      'Access queue modal',
      'Review build requests',
      'Manage users',
      'Monitor system status'
    ]
  }
};

/**
 * Performance test configurations
 */
export const PERFORMANCE_CONFIGS = {
  light: {
    users: 5,
    sessionDuration: 30000, // 30 seconds
    actionInterval: { min: 1000, max: 3000 }
  },
  medium: {
    users: 10,
    sessionDuration: 60000, // 1 minute
    actionInterval: { min: 2000, max: 5000 }
  },
  heavy: {
    users: 20,
    sessionDuration: 120000, // 2 minutes
    actionInterval: { min: 3000, max: 8000 }
  }
};

/**
 * Error scenarios to test
 */
export const ERROR_SCENARIOS = {
  invalidLogin: {
    username: 'nonexistentuser12345',
    expectedError: 'Login failed'
  },
  invalidCommand: {
    command: 'invalidcommand123',
    expectedError: 'Unknown command'
  },
  invalidMovement: {
    command: 'up',
    expectedError: 'Cannot go up'
  }
}; 