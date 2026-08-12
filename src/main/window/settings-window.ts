import { BrowserWindow, app } from 'electron';
import path from 'path';

export function createSettingsWindow(parent: BrowserWindow): BrowserWindow {
  const preloadPath = path.join(__dirname, '..', '..', 'preload', 'index.js');
  const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  const isDev = !app.isPackaged;

  const settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    parent,
    modal: true,
    title: '设置',
    frame: false,
    resizable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    settingsWindow.loadURL('http://localhost:5173#/settings');
  } else {
    settingsWindow.loadFile(rendererPath, { hash: '/settings' });
  }

  return settingsWindow;
}
