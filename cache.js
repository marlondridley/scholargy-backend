// cache.js - Handles the connection to the Azure Redis Cache.
// Import the redis library.
const redis = require('redis');
require('dotenv').config();

const redisConnectionString = process.env.AZURE_REDIS_CONNECTION_STRING;

if (!redisConnectionString) {
  console.warn('AZURE_REDIS_CONNECTION_STRING is not defined. Caching will be disabled.');
}

const redisClient = redisConnectionString ? redis.createClient({ url: redisConnectionString }) : null;

const connectCache = async () => {
  if (!redisClient) return;
  try {
    await redisClient.connect();
    console.log('Successfully connected to Azure Redis Cache.');
  } catch (error) {
    console.error('Failed to connect to Redis Cache:', error);
  }
};

redisClient?.on('error', (err) => console.error('Redis Client Error', err));

module.exports = { connectCache, redisClient };