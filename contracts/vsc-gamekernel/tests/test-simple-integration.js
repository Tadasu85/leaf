/**
 * Simple Leaf + VSC Integration Test
 * Clean, minimal test of the simplified VSC adapter
 */

import { SimpleVSCAdapter } from '../core/simple-vsc-adapter.js';

console.log('🧪 Testing Simple Leaf + VSC Integration...\n');

// Simple mock game state
class SimpleGameState {
  constructor() {
    this.players = new Map();
    this.rooms = new Map();
    this.vscAdapter = null;
    
    console.log('🎮 Simple Game State initialized');
  }

  // Set up VSC integration
  setupVSC(adapter) {
    this.vscAdapter = adapter;
    
    // Listen for VSC events
    this.vscAdapter.on('verb:executed', (data) => {
      this.handleVSCEvent(data);
    });
    
    console.log('🔌 VSC integration set up');
  }

  // Handle VSC events
  handleVSCEvent(data) {
    console.log('📡 VSC Event:', data.verb, data.params);
    
    // Update game state based on verb
    switch (data.verb) {
      case 'on_enter':
        this.addPlayerToRoom(data.params.roomId, data.params.player);
        break;
      case 'on_leave':
        this.removePlayerFromRoom(data.params.roomId, data.params.player);
        break;
      case 'on_say':
        this.handlePlayerMessage(data.params.roomId, data.params.player, data.params.message);
        break;
    }
  }

  // Simple player management
  addPlayerToRoom(roomId, player) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { id: roomId, players: [] });
    }
    
    const room = this.rooms.get(roomId);
    if (!room.players.includes(player)) {
      room.players.push(player);
    }
    
    this.players.set(player, { username: player, currentRoom: roomId });
    console.log(`🚪 ${player} entered ${roomId}`);
  }

  removePlayerFromRoom(roomId, player) {
    const room = this.rooms.get(roomId);
    if (room) {
      const index = room.players.indexOf(player);
      if (index > -1) {
        room.players.splice(index, 1);
      }
    }
    
    this.players.delete(player);
    console.log(`🚪 ${player} left ${roomId}`);
  }

  handlePlayerMessage(roomId, player, message) {
    console.log(`💬 ${player} in ${roomId}: ${message}`);
  }

  // Get current state
  getState() {
    return {
      players: Array.from(this.players.values()),
      rooms: Array.from(this.rooms.values()).map(room => ({
        id: room.id,
        playerCount: room.players.length
      }))
    };
  }
}

// Test the simplified integration
async function testSimpleIntegration() {
  console.log('🚀 Starting simple integration test...\n');

  // Create VSC adapter
  const vscAdapter = new SimpleVSCAdapter({
    contractId: 'leaf-game-v1'
  });

  // Create game state
  const gameState = new SimpleGameState();
  gameState.setupVSC(vscAdapter);

  // Connect
  await vscAdapter.connect();

  // Test basic verbs
  console.log('\n📝 Testing basic verbs...');
  
  await vscAdapter.onPlayerEnter('tavern', 'alice');
  await vscAdapter.onPlayerEnter('tavern', 'bob');
  await vscAdapter.onPlayerSay('tavern', 'alice', 'Hello everyone!');
  await vscAdapter.onPlayerEmote('tavern', 'bob', 'waves');
  await vscAdapter.onPlayerLeave('tavern', 'alice');

  // Show final state
  console.log('\n📊 Final Game State:');
  console.log(JSON.stringify(gameState.getState(), null, 2));

  // Clean up
  vscAdapter.disconnect();
  
  console.log('\n✅ Simple integration test completed!');
}

// Run the test
testSimpleIntegration().catch(console.error);
