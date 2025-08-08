// backend/cache.js
const redis = require('redis');
require('dotenv').config();

const redisConnectionString = process.env.AZURE_REDIS_CONNECTION_STRING;

let redisClient = null;

if (redisConnectionString) {
    redisClient = redis.createClient({
        url: redisConnectionString,
        socket: {
            reconnectStrategy: (retries) => {
                // A common strategy: wait a bit, then try again, but stop after a while.
                if (retries > 10) {
                    return new Error('Redis retry limit exceeded. Caching will be disabled.');
                }
                // Wait 100ms, then 200ms, then 400ms, etc., up to 3 seconds.
                return Math.min(retries * 100, 3000);
            }
        }
    });

    // Add event listeners for robust error handling and logging
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.on('connect', () => console.log('Connecting to Redis...'));
    redisClient.on('ready', () => console.log('✅ Redis client is ready.'));
    redisClient.on('end', () => console.log('Redis connection closed. Will attempt to reconnect...'));

} else {
    console.warn('⚠️ AZURE_REDIS_CONNECTION_STRING is not defined. Caching will be disabled.');
}

/**
 * Connects to the Redis cache. This function is called once at server startup.
 */
const connectCache = async () => {
    if (!redisClient) {
        console.log('Redis client not configured, caching is disabled.');
        return;
    }
    
    try {
        await redisClient.connect();
    } catch (error) {
        console.error(`❌ Initial Redis connection failed:`, error.message);
        // The client will automatically attempt to reconnect based on the strategy defined above.
    }
};

module.exports = { connectCache, redisClient };