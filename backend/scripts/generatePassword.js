import bcrypt from 'bcryptjs';

const password = 'admin123';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
    process.exit(1);
  }
  
  console.log('\n✅ Password Hash Generated!\n');
  console.log('Password (plain text):', password);
  console.log('\nHash (use this in MongoDB):');
  console.log(hash);
  console.log('\n📋 Complete JSON for MongoDB Atlas:\n');
  console.log(JSON.stringify({
    name: "Admin User",
    email: "admin@voimlepehmelt.ee",
    password: hash,
    role: "admin",
    roles: ["admin"],
    createdAt: new Date(),
    updatedAt: new Date()
  }, null, 2));
  console.log('\n');
  
  // Test the hash
  bcrypt.compare(password, hash, (err, isMatch) => {
    if (err) {
      console.error('Error testing hash:', err);
      process.exit(1);
    }
    console.log('✅ Password verification test:', isMatch ? 'PASSED' : 'FAILED');
    console.log('\n');
    process.exit(0);
  });
});

