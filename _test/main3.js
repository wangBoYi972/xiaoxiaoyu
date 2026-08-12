const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  console.log('App ready, creating window...');
  
  try {
    // Create our app's window the same way main-window.ts does
    const preloadPath = path.join(__dirname, '..', 'dist', 'preload', 'index.js');
    const rendererPath = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
    
    console.log('preload:', preloadPath, 'exists:', require('fs').existsSync(preloadPath));
    console.log('renderer:', rendererPath, 'exists:', require('fs').existsSync(rendererPath));
    
    const win = new BrowserWindow({
      width: 1200, height: 800,
      title: '小小榆',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    
    console.log('Window created, loading file...');
    await win.loadFile(rendererPath);
    console.log('Loaded! Window should be visible');
    
    win.webContents.on('did-fail-load', (e, code, desc) => {
      console.error('LOAD FAILED:', code, desc);
    });
    
    win.on('closed', () => { console.log('Window closed'); app.quit(); });
  } catch(e) {
    console.error('ERROR:', e.message);
    app.quit();
  }
});
