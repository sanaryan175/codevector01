const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI from environment variables.
 * We separate this from app.js so it can be reused in the seed script too.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

module.exports = connectDB;
