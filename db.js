// db.js - Handles the connection to the MongoDB database.

// Import the MongoClient class from the mongodb library.
const { MongoClient } = require('mongodb');
// Import and configure dotenv to read variables from the .env file.
require('dotenv').config();

// Retrieve the database connection string from environment variables.
const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
// If the connection string is missing, throw an error to prevent the app from starting incorrectly.
if (!connectionString) {
  throw new Error('COSMOS_DB_CONNECTION_STRING is not defined in the .env file.');
}

// Create a new instance of the MongoClient with the connection string.
const client = new MongoClient(connectionString);
// Declare a variable 'db' that will hold the database connection object once established.
let db;

/**
 * Asynchronously connects to the MongoDB cluster and initializes the 'db' object.
 * This function is called once when the server starts.
 */
const connectDB = async () => {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to connect to Cosmos DB (attempt ${attempt}/${maxRetries})...`);
      // Await the connection to the MongoDB cluster.
      await client.connect();
      // Get the database object using the name specified in the .env file.
      db = client.db(process.env.DB_NAME);
      console.log(`✅ Successfully connected to Azure Cosmos DB: ${db.databaseName}`);
      return;
    } catch (err) {
      console.error(`❌ Cosmos DB connection attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.error('❌ All Cosmos DB connection attempts failed.');
        throw err;
      }
    }
  }
};

/**
 * Returns the initialized database object.
 * This is a getter function used by other parts of the application to interact with the database.
 * @returns {Db} The MongoDB database instance.
 */
const getDB = () => {
  // If the database object hasn't been initialized, throw an error.
  if (!db) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return db;
};

// Export the functions to be used in other files.
module.exports = { connectDB, getDB };