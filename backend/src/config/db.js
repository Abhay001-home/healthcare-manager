const mongoose = require('mongoose');
const logger = require('./logger');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/healthcare_db';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    logger.error('MongoDB connection failed', { err: err.message });
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => logger.info('MongoDB reconnected'));

module.exports = { connectDB, mongoose };
