/**
 * Demo: Simple VSC Adapter Integration
 * This demonstrates how the simplified VSC adapter works with Leaf
 */

import { SimpleVSCAdapter } from './SimpleVSCAdapter';

// Mock configuration for demo
const mockConfig = {
  vsc: {
    contractAddress: 'demo-leaf-contract-v1',
    rpcUrl: 'https://demo.vsc.network/rpc',
    wsUrl: 'wss://demo.vsc.network/ws',
    network: 'testnet' as const
  }
};

// Mock the config module
jest.mock('../../config', () => mockConfig);

console.log('🚀 Leaf + Simple VSC Adapter Integration Demo\n');

async function runDemo() {
  console.log('1️⃣ Creating Simple VSC Adapter...');
  const adapter = new SimpleVSCAdapter();
  
  console.log('2️⃣ Checking adapter status...');
  const status = adapter.getStatus();
  console.log('   Status:', status);
  console.log('   Ready:', adapter.isReady());
  
  console.log('\n3️⃣ Setting up event listeners...');
  adapter.on('verb:executed', (data) => {
    console.log('   📡 Verb executed:', data.verb, 'with params:', data.params);
  });
  
  adapter.on('room:subscribed', (data) => {
    console.log('   🔌 Room subscribed:', data.roomId, data.success);
  });
  
  adapter.on('player:subscribed', (data) => {
    console.log('   👤 Player subscribed:', data.player, data.success);
  });
  
  console.log('\n4️⃣ Testing room subscription...');
  const unsubscribeRoom = adapter.subscribe('tavern', {
    onVerbOutput: (lines) => console.log('   📝 Room output:', lines),
    onRoomEffect: (effects) => console.log('   ✨ Room effects:', effects)
  });
  
  console.log('\n5️⃣ Testing player subscription...');
  const unsubscribePlayer = adapter.subscribeToPlayer('alice', {
    onPlayerEffect: (effects) => console.log('   🎭 Player effects:', effects)
  });
  
  console.log('\n6️⃣ Testing verb execution...');
  
  console.log('   🚪 Testing onEnter...');
  const enterResult = await adapter.onEnter('tavern', 'alice');
  console.log('   Result:', enterResult.success ? '✅' : '❌', enterResult.output);
  
  console.log('\n   💬 Testing onSay...');
  const sayResult = await adapter.onSay('tavern', 'alice', 'Hello everyone!');
  console.log('   Result:', sayResult.success ? '✅' : '❌', sayResult.output);
  
  console.log('\n   🎭 Testing onEmote...');
  const emoteResult = await adapter.onEmote('tavern', 'alice', 'waves');
  console.log('   Result:', emoteResult.success ? '✅' : '❌', emoteResult.output);
  
  console.log('\n   🎮 Testing onCommand...');
  const commandResult = await adapter.onCommand('tavern', 'alice', 'look');
  console.log('   Result:', commandResult.success ? '✅' : '❌', commandResult.output);
  
  console.log('\n   🚪 Testing onLeave...');
  const leaveResult = await adapter.onLeave('tavern', 'alice');
  console.log('   Result:', leaveResult.success ? '✅' : '❌', leaveResult.output);
  
  console.log('\n7️⃣ Checking final status...');
  const finalStatus = adapter.getStatus();
  console.log('   Final status:', finalStatus);
  
  console.log('\n8️⃣ Cleaning up...');
  unsubscribeRoom();
  unsubscribePlayer();
  adapter.disconnect();
  
  console.log('\n✅ Demo completed successfully!');
  console.log('\n📋 What we demonstrated:');
  console.log('   • Simple VSC adapter initialization');
  console.log('   • Event system setup');
  console.log('   • Room and player subscriptions');
  console.log('   • All core game verbs working');
  console.log('   • Clean event handling');
  console.log('   • Proper cleanup and disconnection');
  
  console.log('\n🎯 Next steps:');
  console.log('   • Set REACT_APP_VSC_CONTRACT environment variable');
  console.log('   • Replace simulation with real VSC calls');
  console.log('   • Add real authentication when ready');
}

// Run the demo
runDemo().catch(console.error);
