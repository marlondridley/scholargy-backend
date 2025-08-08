// backend/db.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
let db = null;
let client = null;

const connectDB = async () => {
  if (!connectionString) {
    console.warn('⚠️ COSMOS_DB_CONNECTION_STRING not defined. Running without database.');
    return null;
  }

  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to connect to Cosmos DB (attempt ${attempt}/${maxRetries})...`);
      client = new MongoClient(connectionString);
      await client.connect();
      db = client.db(process.env.DB_NAME || 'scholargy');
      console.log(`✅ Successfully connected to Azure Cosmos DB: ${db.databaseName}`);
      return db;
    } catch (err) {
      console.error(`❌ Cosmos DB connection attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.error('❌ All Cosmos DB connection attempts failed.');
        // Don't throw - allow app to run without database
        return null;
      }
    }
  }
};

const getDB = () => {
  // Return null instead of throwing if DB not connected
  if (!db) {
    console.warn('⚠️ Database not initialized. Some features may be unavailable.');
    return null;
  }
  return db;
};

module.exports = { connectDB, getDB };