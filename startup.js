const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting Scholargy MVP on Azure App Service...');

// Set environment variables for Azure
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 8080;

// Start the backend server
const serverPath = path.join(__dirname, 'backend', 'server.js');
console.log(`📡 Starting backend server at: ${serverPath}`);

// Check if we're in the deployment directory structure
const isDeployment = fs.existsSync(path.join(__dirname, 'server.js'));
const actualServerPath = isDeployment ? path.join(__dirname, 'server.js') : serverPath;
console.log(`📡 Using server path: ${actualServerPath}`);

const server = spawn('node', [actualServerPath], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`📡 Server exited with code: ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.kill('SIGINT');
}); 