import { BrowserWindow, shell, app } from 'electron';
import path from 'path';
import { getAppRendererURL } from './app-protocol';
import { logger } from '../utils/logger';

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
      // 内置浏览器使用独立、无 Node 权限的访客渲染进程，避免站点的 iframe 限制。
      webviewTag: true,
    },
  });

  // 监听渲染进程错误
  let fellBackToFile = false;
  mainWindow.webContents.on('did-fail-load' as any, (_event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
    logger.error(`页面加载失败: ${errorDescription} (${errorCode}) URL: ${validatedURL}`);
    // app:// 万一不可用（协议处理异常等），退回 file:// 保底能打开
    if (!fellBackToFile && typeof validatedURL === 'string' && validatedURL.startsWith('app://')) {
      fellBackToFile = true;
      logger.warn('回退到 file:// 加载渲染层');
      mainWindow?.loadFile(rendererPath).catch(() => {});
    }
  });
  mainWindow.webContents.on('render-process-gone' as any, (_event: any, details: any) => {
    console.error(`[main-window] 渲染进程退出: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  if (isDev && (process.argv.includes('--dev') || process.env.NODE_ENV === 'development')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境用 app:// 自定义协议加载：
    // file:// 是 opaque origin，Web Worker（Monaco 语言服务必需）会被同源策略拦
    mainWindow.loadURL(getAppRendererURL()).catch(async (err) => {
      logger.error(`app:// 加载失败，回退 loadFile: ${err?.message || err}`);
      fellBackToFile = true;
      await mainWindow!.loadFile(rendererPath).catch(() => {});
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
