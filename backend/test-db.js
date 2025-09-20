const { testConnection, initSchema } = require('./db');

async function main() {
  console.log('🔧 Database Configuration Test');
  console.log('================================\n');
  
  // Test connection
  const connected = await testConnection();
  
  if (connected) {
    console.log('\n📋 Testing database schema initialization...');
    try {
      await initSchema();
      console.log('✅ Database schema initialized successfully!');
    } catch (error) {
      console.error('❌ Schema initialization failed:', error.message);
    }
  }
  
  console.log('\n🏁 Test completed.');
  process.exit(connected ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Test script failed:', error.message);
  process.exit(1);
});