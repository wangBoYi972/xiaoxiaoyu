import { BrowserWindow, shell, app } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

export function createMainWindow(): BrowserWindow {
  // 平台适配图标
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

  const preloadPath = path.join(__dirname, '..', '..', 'preload', 'index.js');
  const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');

  // macOS: 使用原生标题栏 traffic lights + 自定义高度
  // Windows: 完全无边框
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '小小榆',
    icon: iconPath,
    frame: !isMac,                         // Mac 保留原生 frame（traffic lights）
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    backgroundColor: isMac ? undefined : '#f5f5f5',
    ...(isMac ? { vibrancy: 'under-window' } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 监听渲染进程错误
  mainWindow.webContents.on('did-fail-load' as any, (_event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
    console.error(`[main-window] 页面加载失败: ${errorDescription} (${errorCode}) URL: ${validatedURL}`);
  });
  mainWindow.webContents.on('render-process-gone' as any, (_event: any, details: any) => {
    console.error(`[main-window] 渲染进程退出: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  if (isDev && (process.argv.includes('--dev') || process.env.NODE_ENV === 'development')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(rendererPath).catch(err => {
      console.error('[main-window] loadFile 失败:', err);
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
