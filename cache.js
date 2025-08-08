// backend/cache.js
const redis = require('redis');
const { RedisManagementClient } = require('@azure/arm-rediscache');
const { DefaultAzureCredential } = require('@azure/identity');
require('dotenv').config();

const redisConnectionString = process.env.AZURE_REDIS_CONNECTION_STRING;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP;
const redisCacheName = process.env.AZURE_REDIS_CACHE_NAME;

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

// Azure Redis Management Client for cache operations
let redisManagementClient = null;
if (subscriptionId && resourceGroupName && redisCacheName) {
    try {
        const credential = new DefaultAzureCredential();
        redisManagementClient = new RedisManagementClient(credential, subscriptionId);
        console.log('✅ Azure Redis Management Client initialized');
    } catch (error) {
        console.warn('⚠️ Failed to initialize Azure Redis Management Client:', error.message);
    }
}

const connectCache = async () => {
  if (!redisClient) {
    console.log('Redis client not created - caching disabled');
    return;
  }
  
  try {
    await redisClient.connect();
    console.log('✅ Redis cache connected successfully');
  } catch (error) {
    console.error(`❌ Initial Redis connection failed:`, error.message);
    // The client will attempt to reconnect automatically based on the strategy.
  }
};

// Function to get Redis cache status from Azure
const getRedisCacheStatus = async () => {
    if (!redisManagementClient || !resourceGroupName || !redisCacheName) {
        console.warn('⚠️ Redis management client not available or missing configuration');
        return null;
    }

    try {
        const cache = await redisManagementClient.redis.get(resourceGroupName, redisCacheName);
        return {
            name: cache.name,
            location: cache.location,
            sku: cache.sku?.name,
            capacity: cache.sku?.capacity,
            provisioningState: cache.provisioningState,
            enableNonSslPort: cache.enableNonSslPort,
            hostName: cache.hostName,
            port: cache.port,
            sslPort: cache.sslPort
        };
    } catch (error) {
        console.error('❌ Failed to get Redis cache status:', error.message);
        return null;
    }
};

// Function to check if Redis cache is healthy
const checkRedisHealth = async () => {
    if (!redisClient) {
        return { status: 'disabled', message: 'Redis client not configured' };
    }

    try {
        // Test basic operations
        await redisClient.ping();
        const status = await getRedisCacheStatus();
        
        return {
            status: 'healthy',
            message: 'Redis cache is operational',
            azureStatus: status
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            message: `Redis health check failed: ${error.message}`,
            error: error.message
        };
    }
};

module.exports = { 
    connectCache, 
    redisClient, 
    redisManagementClient,
    getRedisCacheStatus,
    checkRedisHealth 
};
