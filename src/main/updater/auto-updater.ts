import { app, BrowserWindow, ipcMain } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { logger } from '../utils/logger';

const CURRENT_VERSION = '3.0.0';
const DEFAULT_UPDATE_URL = '';  // 空 = 不联网检查，需手动在设置中配置

interface UpdateInfo { version: string; downloadUrl: string; releaseNotes: string; sha256?: string; }
interface Announcement { id: string; title: string; content: string; level: 'info' | 'warning' | 'important'; validUntil?: string; }

// 内置欢迎公告——即使连不上网络也显示
const BUILTIN_ANNOUNCEMENT: Announcement = {
  id: 'v1.5-welcome',
  title: ' 小小榆 v1.5 发布',
  content: 'v1.5 重磅更新：\n\n 技能市场正式上线\n• 主页直接浏览安装28个技能\n• 聊天框输入"技能列表"查看全部\n• 输入"安装技能 名字"一键安装\n• 远程仓库自动同步最新技能\n\n 窗口控制创意升级\n• 最小化=橙色 · 最大化=绿色 · 关闭=红色\n\n 深色主题全面覆盖\n• 所有组件完美适配暗色模式\n\n 全新首页 + 对话信息栏\n\n 12个内置技能 + 16个社区技能',
  level: 'important',
};

function httpGet(url: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let body = '';
      res.on('data', (chunk: Buffer) => body += chunk.toString());
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 600000 }, (res) => {
      if (res.statusCode === 302 && res.headers.location) return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const ws = fs.createWriteStream(dest);
      res.on('data', (chunk: Buffer) => { downloaded += chunk.length; ws.write(chunk); if (total && onProgress) onProgress(Math.round((downloaded / total) * 100)); });
      res.on('end', () => { ws.end(); resolve(); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
  });
}

function getUpdateUrl(): string {
  try {
    const { getDatabase } = require('../store/database');
    const db = getDatabase();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind(['updateUrl']);
    let url = '';
    if (stmt.step()) url = stmt.getAsObject().value as string;
    stmt.free();
    return url || DEFAULT_UPDATE_URL;
  } catch { return DEFAULT_UPDATE_URL; }
}

function saveUpdateUrl(url: string): void {
  try {
    const { getDatabase, saveDatabase } = require('../store/database');
    getDatabase().run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['updateUrl', url]);
    saveDatabase();
  } catch {}
}

function compareVersions(v1: string, v2: string): number {
  const a = v1.split('.').map(Number), b = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d !== 0) return d; }
  return 0;
}

function notify(channel: string, data: unknown): void {
  // 等窗口就绪
  const send = () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send(channel, data);
  };
  if (BrowserWindow.getAllWindows().length > 0) { send(); }
  else { setTimeout(send, 3000); }
}

/** 获取已读公告 ID */
function getReadAnnouncementIds(): Set<string> {
  try {
    const { getDatabase } = require('../store/database');
    const db = getDatabase();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind(['readAnnouncements']);
    if (stmt.step()) {
      const raw = stmt.getAsObject().value as string;
      stmt.free();
      return new Set(raw ? raw.split(',') : []);
    }
    stmt.free();
  } catch {}
  return new Set();
}

function markAnnouncementRead(id: string): void {
  const read = getReadAnnouncementIds();
  read.add(id);
  try {
    const { getDatabase, saveDatabase } = require('../store/database');
    getDatabase().run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['readAnnouncements', [...read].join(',')]);
    saveDatabase();
  } catch {}
}

// ==================== 主入口 ====================

export async function checkForUpdates(): Promise<void> {
  // 1. 先检查内置公告（欢迎公告只显示一次）
  const read = getReadAnnouncementIds();
  if (!read.has(BUILTIN_ANNOUNCEMENT.id)) {
    logger.info('显示内置欢迎公告');
    notify('announcement:show', BUILTIN_ANNOUNCEMENT);
  }

  // 2. 尝试远程拉取
  try {
    const baseUrl = getUpdateUrl();
    const raw = await httpGet(`${baseUrl}/version.json`);
    const data: { version: string; downloadUrl: string; releaseNotes: string; announcements?: Announcement[] } = JSON.parse(raw);

    // 远程公告——只显示未读的
    if (data.announcements?.length) {
      const unread = data.announcements.filter((a: Announcement) => !read.has(a.id));
      if (unread.length > 0) {
        logger.info(`远程公告: ${unread[0].title}`);
        notify('announcement:show', unread[0]);
      }
    }

    // 远程版本更新
    if (compareVersions(data.version, CURRENT_VERSION) > 0) {
      logger.info(`新版本: ${data.version}`);
      notify('update:available', {
        version: data.version, currentVersion: CURRENT_VERSION,
        releaseNotes: data.releaseNotes, downloadUrl: data.downloadUrl,
        sha256: (data as any).sha256 || '',
      });
    }
  } catch {
    // 远程拉取失败——内置公告已显示，忽略
  }
}

function verifySha256(filePath: string, expected: string): boolean {
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    const computed = hash.digest('hex');
    return computed === expected.toLowerCase();
  } catch { return false; }
}

export async function downloadAndInstall(downloadUrl: string, expectedSha256?: string): Promise<void> {
  const tmpDir = os.tmpdir();
  const zipPath = path.join(tmpDir, `xxy-update-${Date.now()}.zip`);
  const extractDir = path.join(tmpDir, `xxy-update-extract`);
  try {
    notify('update:progress', { stage: 'downloading', percent: 0 });
    await downloadFile(downloadUrl, zipPath, (pct) => notify('update:progress', { stage: 'downloading', percent: pct }));

    // SHA256 签名验证
    if (expectedSha256) {
      notify('update:progress', { stage: 'verifying', percent: 0 });
      if (!verifySha256(zipPath, expectedSha256)) {
        throw new Error('更新包签名验证失败，文件可能被篡改');
      }
      logger.info('SHA256 签名验证通过');
    }

    notify('update:progress', { stage: 'extracting', percent: 0 });
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    // 使用 spawn 数组参数避免命令注入
    childProcess.spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
    ], { windowsHide: true, timeout: 120000 });

    // 等待解压完成
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        try {
          if (fs.readdirSync(extractDir).length > 0) resolve();
          else setTimeout(check, 500);
        } catch { setTimeout(check, 500); }
      };
      setTimeout(check, 1000);
    });

    notify('update:progress', { stage: 'installing', percent: 50 });
    const appDir = path.dirname(app.getPath('exe'));
    const batPath = path.join(tmpDir, 'xxy-update.bat');

    // Windows batch 文件内容固定，不接受外部输入
    const batContent = [
      '@echo off',
      'timeout /t 3 /nobreak >nul',
      `xcopy /E /Y /Q "${extractDir}\\*" "${appDir}\\"`,
      `start "" "${appDir}\\小小榆.exe"`,
      'del "%~f0"',
    ].join('\r\n');
    fs.writeFileSync(batPath, batContent, 'utf-8');

    childProcess.spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    notify('update:progress', { stage: 'done', percent: 100 });
    setTimeout(() => app.quit(), 1500);
  } catch (e) {
    logger.error('更新失败', e as Error);
    notify('update:error', { message: (e as Error).message });
  } finally {
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch {}
  }
}

/** 手动显示公告（从标题栏入口） */
export function showAnnouncements(): void {
  const read = getReadAnnouncementIds();
  // 手动查看时显示内置公告（即使已读）
  notify('announcement:show', BUILTIN_ANNOUNCEMENT);
}

export function registerUpdateIpc(): void {
  ipcMain.handle('update:check', async () => { await checkForUpdates(); });
  ipcMain.handle('update:install', async (_e, downloadUrl: string, sha256?: string) => { await downloadAndInstall(downloadUrl, sha256); });
  ipcMain.handle('update:getUrl', () => getUpdateUrl());
  ipcMain.handle('update:setUrl', (_e, url: string) => saveUpdateUrl(url));
  ipcMain.handle('announcement:read', (_e, id: string) => markAnnouncementRead(id));
  ipcMain.handle('announcement:show', () => showAnnouncements());
}
