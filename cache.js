// backend/cache.js
const redis = require('redis');
require('dotenv').config();

const redisConnectionString = process.env.AZURE_REDIS_CONNECTION_STRING;

if (!redisConnectionString) {
  console.warn('AZURE_REDIS_CONNECTION_STRING is not defined. Caching will be disabled.');
}

const redisClient = redisConnectionString ? redis.createClient({ 
    url: redisConnectionString,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 5000) // Reconnect with backoff
    }
}) : null;

// NEW: Add event listeners for better error handling and resilience
if (redisClient) {
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.on('end', () => console.log('Redis connection closed. Attempting to reconnect...'));
    redisClient.on('connect', () => console.log('Connecting to Redis...'));
    redisClient.on('ready', () => console.log('Redis client is ready.'));
}

const connectCache = async () => {
  if (!redisClient) {
    console.log('Redis client not created - caching disabled');
    return;
  }
  
  try {
    await redisClient.connect();
  } catch (error) {
    console.error(`❌ Initial Redis connection failed:`, error.message);
    // The client will attempt to reconnect automatically based on the strategy.
  }
};

module.exports = { connectCache, redisClient };
