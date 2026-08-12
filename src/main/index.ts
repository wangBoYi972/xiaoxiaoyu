import { app, BrowserWindow, globalShortcut } from 'electron';
import { createMainWindow, getMainWindow } from './window/main-window';
import { registerIpcHandlers } from './ipc/index';
import { setupTray } from './tray/tray-manager';
import { checkForUpdates, registerUpdateIpc } from './updater/auto-updater';
import { initDatabase } from './store/database';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';
import {
  isOllamaInstalled, checkOllamaRunning, startOllamaServe,
  openOllamaDownloadPage, pullModel, hasModel, DEFAULT_MODEL,
  importModelFromBundle, getBundledModelPath,
} from './ollama/ollama-launcher';
import { updateOllamaProgress } from './ipc/ollama.ipc';

const isMac = process.platform === 'darwin';

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
    registerIpcHandlers();
    registerUpdateIpc();

    const mainWindow = createMainWindow();
    setupTray(mainWindow);

    // 后台自动初始化 Ollama（不阻塞启动）
    setupOllamaInBackground(mainWindow);

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

// ===== 后台自动初始化 Ollama =====
function setupOllamaInBackground(mainWindow: BrowserWindow): void {
  setTimeout(async () => {
    try {
      const send = (ch: string, data: any) => mainWindow.webContents.send(ch, data);

      // 1. 检查 Ollama — 不自动安装，让用户装（GitHub 国内下不动）
      if (!isOllamaInstalled()) {
        logger.info('Ollama 未安装');
        updateOllamaProgress({ active: false });
        send('ollama:status', { installed: false, running: false, modelReady: false });
        return; // renderer 会显示"需要安装 Ollama"引导
      }

      // 2. 启动服务
      if (!(await checkOllamaRunning())) {
        logger.info('启动 Ollama 服务...');
        updateOllamaProgress({ stage: 'starting', message: '正在启动 Ollama 服务...' });
        send('ollama:progress', { stage: 'starting', message: '正在启动 Ollama 服务...' });
        startOllamaServe();
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2000));
          if (await checkOllamaRunning()) break;
        }
      }

      const running = await checkOllamaRunning();
      if (!running) {
        updateOllamaProgress({ active: false });
        send('ollama:status', { installed: true, running: false, modelReady: false });
        return;
      }

      logger.info('Ollama 服务已就绪');
      send('ollama:status', { installed: true, running: true, modelReady: false });

      // 3. 获取模型 — 优先从安装包导入，失败再网络下载
      let modelReady = await hasModel(DEFAULT_MODEL);
      if (!modelReady) {
        // 检查安装包是否内置了模型文件
        const bundledPath = getBundledModelPath();
        if (bundledPath) {
          logger.info(`从安装包导入模型: ${bundledPath}`);
          updateOllamaProgress({ stage: 'importing', message: '正在从安装包导入 AI 模型...', percent: 0 });
          send('ollama:progress', { stage: 'importing', message: '正在从安装包导入 AI 模型...', percent: 0 });

          modelReady = await importModelFromBundle((msg, percent) => {
            updateOllamaProgress({ stage: 'importing', message: msg, percent });
            send('ollama:progress', { stage: 'importing', message: msg, percent });
          });
        }

        // fallback：从网络下载
        if (!modelReady) {
          logger.info(`内置模型不可用，从网络下载 ${DEFAULT_MODEL}...`);
          updateOllamaProgress({ stage: 'pulling', message: '正在下载 qwen2.5 模型（约400MB）...', percent: 0 });
          send('ollama:progress', { stage: 'pulling', message: '正在下载 qwen2.5 模型（约400MB）...', percent: 0 });
          await pullModel(DEFAULT_MODEL, (p) => {
            updateOllamaProgress({ stage: 'pulling', message: p.status, percent: p.percent });
            send('ollama:progress', { stage: 'pulling', message: p.status, percent: p.percent });
          });
          modelReady = await hasModel(DEFAULT_MODEL);
        }
      }

      updateOllamaProgress({ active: false, done: true, modelReady: true, percent: 100 });
      send('ollama:status', { installed: true, running: true, modelReady: true, defaultModel: DEFAULT_MODEL });
      logger.info('Ollama 初始化完成');
    } catch (e) {
      updateOllamaProgress({ active: false });
      logger.error('Ollama 初始化失败', e as Error);
    }
  }, 3000);
}
