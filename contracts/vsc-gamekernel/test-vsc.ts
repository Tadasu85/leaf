/**
 * Test script for VSC toolchain
 * 
 * This script tests the basic VSC client functionality to ensure
 * the toolchain is properly set up.
 */

import { vClient, vTransaction } from '@vsc.eco/client'

async function testVSCClient() {
  console.log('🧪 Testing VSC Client...')
  
  try {
    // Test client creation
    const client = new vClient({
      api: 'https://vsc.hive-engine.com/api/v1/graphql',
      loginType: 'offchain'
    })
    
    console.log('✅ VSC Client created successfully')
    console.log('📡 API URL:', client._args.api)
    console.log('🔐 Login Type:', client._args.loginType)
    
    // Test transaction creation
    const tx = new vTransaction()
    console.log('✅ Transaction object created successfully')
    
    // Test transaction setup (without broadcasting)
    tx.setTx({
      op: 'call_contract',
      action: 'test',
      contract_id: 'test-contract-id',
      payload: { test: 'data' }
    })
    
    console.log('✅ Transaction setup successful')
    console.log('📝 Transaction data:', tx.txData)
    
    console.log('\n🎉 VSC Toolchain is working correctly!')
    console.log('\nNext steps:')
    console.log('1. Deploy your game contract to VSC network')
    console.log('2. Get the contract ID')
    console.log('3. Update Leaf config with the contract ID')
    console.log('4. Test real contract interactions')
    
  } catch (error) {
    console.error('❌ VSC Toolchain test failed:', error)
    process.exit(1)
  }
}

// Run the test
testVSCClient().catch(console.error)
