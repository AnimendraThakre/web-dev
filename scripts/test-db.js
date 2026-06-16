/**
 * Test MongoDB Atlas connection.
 * Usage: node scripts/test-db.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;

async function main() {
  if (!uri || uri.includes('127.0.0.1') || uri.includes('localhost')) {
    console.error('Set MONGODB_URI in .env to your Atlas connection string first.');
    console.error('Format: mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/mfa_auth');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('SUCCESS: Connected to MongoDB Atlas');
    console.log('Database:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
}

main();
