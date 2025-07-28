// db.js - Handles the connection to the MongoDB database.
// Import the MongoClient class from the mongodb library.
const { MongoClient } = require('mongodb');
require('dotenv').config();

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
if (!connectionString) {
  throw new Error('COSMOS_DB_CONNECTION_STRING is not defined in the .env file.');
}

const client = new MongoClient(connectionString);
let db;

const connectDB = async () => {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME);
    console.log(`Successfully connected to Azure Cosmos DB: ${db.databaseName}`);
  } catch (err) {
    console.error('Failed to connect to Cosmos DB', err);
    process.exit(1);
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return db;
};

module.exports = { connectDB, getDB };
