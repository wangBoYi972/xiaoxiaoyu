import { app, BrowserWindow, globalShortcut } from 'electron';
import { createMainWindow, getMainWindow } from './window/main-window';
import { registerIpcHandlers } from './ipc/index';
import { setupTray } from './tray/tray-manager';
import { checkForUpdates, registerUpdateIpc } from './updater/auto-updater';
import { initDatabase } from './store/database';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';
import { initializeOllamaInBackground } from './services/ollama-service';
import { registerAppProtocolScheme, registerAppProtocolHandler } from './window/app-protocol';

const isMac = process.platform === 'darwin';

// 自定义协议 app:// 必须先于 app ready 注册
registerAppProtocolScheme();

// ===== 全局异常兜底 =====
// 主进程崩溃会静默杀掉整个应用，这里至少保证异常落到日志里便于排查
process.on('uncaughtException', (err) => {
  logger.error('主进程未捕获异常', err instanceof Error ? err : new Error(String(err)));
});
process.on('unhandledRejection', (reason) => {
  logger.error('主进程未处理的 Promise 拒绝', reason instanceof Error ? reason : new Error(String(reason)));
});

// ===== 单实例锁 =====
// 优先使用 Electron 原生 singleInstanceLock，备选文件锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 已有实例在运行，直接退出（second-instance 事件不会触发）
  app.quit();
} else {
  // 当用户尝试启动第二个实例时，激活已有窗口
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      // 窗口不存在，可能崩溃了 → 重启
      createMainWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });

  // ===== 文件锁 (备选) =====
  // 用于在 requestSingleInstanceLock 失效时的额外保护
  const LOCK_FILE = path.join(app.getPath('userData'), 'app.lock');
  let lockFd: number | null = null;

  try {
    lockFd = fs.openSync(LOCK_FILE, 'w');
    fs.writeFileSync(LOCK_FILE, String(process.pid));
  } catch {}

  app.whenReady().then(async () => {
    logger.info('小小榆启动中...');

    // 清理旧版残留锁文件（防止旧版本遗留的幽灵锁阻止启动）
    const userDataPath = app.getPath('userData');
    const oldLockPath = path.join(userDataPath, 'app.lock');
    try {
      if (fs.existsSync(oldLockPath)) {
        const oldPid = parseInt(fs.readFileSync(oldLockPath, 'utf-8').trim());
        try { process.kill(oldPid, 0); } catch { fs.unlinkSync(oldLockPath); }
      }
    } catch {}

    await initDatabase();
    registerAppProtocolHandler();
    registerIpcHandlers();
    registerUpdateIpc();

    const mainWindow = createMainWindow();
    setupTray(mainWindow);

    // 后台自动初始化 Ollama（不阻塞启动）
    initializeOllamaInBackground({
      progress: (p) => mainWindow.webContents.send('ollama:progress', p),
      status: (s) => mainWindow.webContents.send('ollama:status', s),
    });

    // 渲染进程崩溃/无响应时留痕，便于排查
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      logger.error(`渲染进程退出: reason=${details.reason} exitCode=${details.exitCode}`);
    });
    mainWindow.webContents.on('unresponsive', () => {
      logger.warn('渲染进程无响应');
    });

    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      const win = getMainWindow() || BrowserWindow.getAllWindows()[0];
      if (!win) return;
      if (win.isVisible() && win.isFocused()) { win.hide(); }
      else { win.show(); win.focus(); }
    });

    // 延迟检查更新，避免阻塞启动
    setTimeout(() => checkForUpdates(), 2000);
    logger.info('小小榆启动完成');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    try { if (lockFd !== null) { fs.closeSync(lockFd); fs.unlinkSync(LOCK_FILE); } } catch {}
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    try { require('./store/database').closeDatabase(); } catch {}
  });
}
