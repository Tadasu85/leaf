/**
 * Simple test to verify VSC client imports work
 */

console.log('🧪 Testing VSC Client imports...')

try {
  // Test basic import
  const { vClient, vTransaction } = await import('@vsc.eco/client')
  console.log('✅ VSC Client imports successful')
  console.log('📦 vClient:', typeof vClient)
  console.log('📦 vTransaction:', typeof vTransaction)
  
  // Test client creation
  const client = new vClient({
    api: 'https://vsc.hive-engine.com/api/v1/graphql',
    loginType: 'offchain'
  })
  console.log('✅ VSC Client created successfully')
  
  // Test transaction creation
  const tx = new vTransaction()
  console.log('✅ Transaction object created successfully')
  
  console.log('\n🎉 VSC Toolchain is working correctly!')
  
} catch (error) {
  console.error('❌ VSC Toolchain test failed:', error.message)
  console.error('Stack:', error.stack)
  process.exit(1)
}
