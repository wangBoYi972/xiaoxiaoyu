// This IS the app entry point - simulate what electron does with "main": "dist/main/index.js"
const { app } = require('electron');

process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT:', e.message);
  console.error(e.stack?.split('\n').slice(0,5).join('\n'));
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  app.quit();
});

// Load the actual app
require('../dist/main/index');

// Keep alive - don't quit
console.log('Main module loaded, waiting for app ready...');
