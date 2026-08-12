import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import path from 'path';

let tray: Tray | null = null;
const isMac = process.platform === 'darwin';

export function setupTray(mainWindow: BrowserWindow): void {
  // macOS 托盘用 png，Windows 用 ico
  let iconPath: string;
  if (app.isPackaged) {
    iconPath = isMac
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(process.resourcesPath, 'icon.ico');
  } else {
    iconPath = isMac
      ? path.join(__dirname, '..', '..', '..', 'resources', 'icon.png')
      : path.join(__dirname, '..', '..', '..', 'resources', 'icon.ico');
  }

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }

  // macOS: 16x16, Windows: 16x16（如果 png 源大一点会自动缩放）
  const traySize = isMac ? 18 : 16;
  tray = new Tray(icon.resize({ width: traySize, height: traySize }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    {
      label: '新建对话',
      click: () => {
        mainWindow.show(); mainWindow.focus();
        mainWindow.webContents.send('app:new-chat');
      },
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => { mainWindow.show(); mainWindow.webContents.send('app:open-settings'); },
    },
    { type: 'separator' },
    {
      label: isMac ? '退出小小榆' : '退出',
      click: () => { app.quit(); },
    },
  ]);

  tray.setToolTip('小小榆');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
