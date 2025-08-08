// backend/services/cache.js
const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL, // Use rediss:// for TLS
  socket: {
    reconnectStrategy: retries => {
      if (retries > 10) return new Error('Retry limit exceeded');
      return Math.min(retries * 100, 3000);
    },
    keepAlive: 10000,
  },
});

redisClient.on('error', err => console.error('Redis Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Redis: Connected');

    // Prevent idle timeout with a regular ping
    setInterval(() => {
      redisClient.ping().catch(() => {});
    }, 30000);

  } catch (err) {
    console.error('❌ Redis: Failed to connect', err);
  }
})();

module.exports = { redisClient };
