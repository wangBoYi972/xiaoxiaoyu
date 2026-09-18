const electron = require('electron');
console.log('type:', typeof electron);
console.log('protocol type:', typeof electron.protocol);
console.log('app type:', typeof electron.app);
process.exit(0);
