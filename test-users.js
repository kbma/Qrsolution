const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    
    const users = await User.find({ role: 'client_admin' }).select('+password').limit(3);
    console.log('\n=== Utilisateurs trouvés ===');
    users.forEach(u => {
      console.log(`Email: ${u.email}`);
      console.log(`Password hash: ${u.password.substring(0, 60)}...`);
      console.log(`TenantId: ${u.tenantId}`);
      console.log('---');
    });
    
    const count = await User.countDocuments({ role: 'client_admin' });
    console.log(`\nTotal: ${count} client_admin trouvés`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

checkUsers();
