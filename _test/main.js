const { app, BrowserWindow } = require('electron');
console.log('App starting, isPackaged=', app.isPackaged);
app.whenReady().then(() => {
  console.log('App ready!');
  const win = new BrowserWindow({ width: 400, height: 300 });
  win.loadURL('about:blank');
  console.log('Window created');
});
