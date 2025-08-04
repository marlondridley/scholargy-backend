// cache.js - Handles the connection to the Azure Redis Cache.

// Import the redis library.
const redis = require('redis');
// Import and configure dotenv to read variables from the .env file.
require('dotenv').config();

// Retrieve the Redis connection string from environment variables.
const redisConnectionString = process.env.AZURE_REDIS_CONNECTION_STRING;

// If the connection string is not provided, log a warning. Caching will be disabled.
if (!redisConnectionString) {
  console.warn('AZURE_REDIS_CONNECTION_STRING is not defined. Caching will be disabled.');
}

// Create a Redis client instance only if the connection string exists.
const redisClient = redisConnectionString ? redis.createClient({ url: redisConnectionString }) : null;

/**
 * Asynchronously connects to the Redis server with retry logic.
 * This function is called once when the server starts.
 */
const connectCache = async () => {
  // Do nothing if the client was not created.
  if (!redisClient) {
    console.log('Redis client not created - caching disabled');
    return;
  }
  
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to connect to Redis (attempt ${attempt}/${maxRetries})...`);
      await redisClient.connect();
      console.log('✅ Successfully connected to Azure Redis Cache.');
      return;
    } catch (error) {
      console.error(`❌ Redis connection attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.error('❌ All Redis connection attempts failed. Caching will be disabled.');
        throw error;
      }
    }
  }
};

// Set up an error listener for the Redis client to log any runtime errors.
redisClient?.on('error', (err) => console.error('Redis Client Error', err));

// Export the connect function and the client instance.
module.exports = { connectCache, redisClient };
