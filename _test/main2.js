try {
  const { app } = require('electron');
  console.log('Step 1: electron loaded');
  
  // Try loading our modules one by one
  console.log('Step 2: loading database...');
  require('../dist/main/store/database');
  
  console.log('Step 3: loading IPC...');
  require('../dist/main/ipc/index');
  
  console.log('Step 4: loading tray...');
  require('../dist/main/tray/tray-manager');
  
  console.log('Step 5: loading updater...');
  require('../dist/main/updater/auto-updater');
  
  console.log('Step 6: loading window...');
  require('../dist/main/window/main-window');
  
  console.log('Step 7: loading main index...');
  require('../dist/main/index');
  
  console.log('ALL OK!');
  app.quit();
} catch(e) {
  console.error('CRASH:', e.message);
  console.error(e.stack);
  process.exit(1);
}
