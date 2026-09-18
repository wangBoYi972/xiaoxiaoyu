import { app, BrowserWindow, ipcMain } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { logger } from '../utils/logger';

// 跟随 package.json，避免版本判断失真（此前写死 3.0.0，实际版本早已超过）
const CURRENT_VERSION = app.getVersion();
const DEFAULT_UPDATE_URL = '';  // 空 = 不联网检查，需手动在设置中配置

interface UpdateInfo { version: string; downloadUrl: string; releaseNotes: string; sha256?: string; }
interface Announcement { id: string; title: string; content: string; level: 'info' | 'warning' | 'important'; validUntil?: string; }

// 内置公告——即使连不上网络也显示。
// id 变更即视为「新公告」会重新弹出；旧 id 已被标记为已读，自动隐藏，无需额外处理。
const BUILTIN_ANNOUNCEMENT: Announcement = {
  id: 'v3.1.0-rag',
  title: '小小榆 v3.1.0 发布',
  content:
    'v3.1.0 更新：\n\n' +
    ' RAG 向量检索（知识库）\n' +
    '• 工作区代码可被向量化索引，支持语义检索「登录校验在哪」这类自然语言提问\n' +
    '• 嵌入后端三选一：Ollama 本地模型 / OpenAI 兼容 embeddings / 本地哈希兜底（离线可用）\n' +
    '• Agent 新增 search_codebase、build_codebase_index 两个工具，自动检索相关代码注入上下文\n' +
    '• 设置 → 知识库(RAG) 可一键建索引；输入框顶部 chip 显示已索引块数\n\n' +
    ' 项目启动器（真启动器）\n' +
    '• 「启动项目」直接拉起进程跑 npm script，不再只是把命令丢给 AI\n' +
    '• 完整继承系统环境：JDK / Node / Python / Git / Maven 都能读到\n' +
    '• 新增终端面板：实时输出、自动滚动、localhost 链接可点、随时停止\n\n' +
    ' 供应商完全自定义\n' +
    '• 不再只有内置几家：任意中转站 / 企业网关 / 本地推理服务都能加\n' +
    '• 填 名称 + Base URL + API Key + 模型 ID 即可，内置常用端点模板\n\n' +
    ' 界面\n' +
    '• 浅色主题玻璃质感重调，面板边界与层次更清晰',
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

    // 使用 spawn 数组参数避免命令注入，并真正等待解压结果
    // （旧实现不等待、只轮询目录，解压失败会无限循环且用户无感知）
    await new Promise<void>((resolve, reject) => {
      const proc = childProcess.spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ], { windowsHide: true });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      const timer = setTimeout(() => { proc.kill(); reject(new Error('解压超时（120 秒）')); }, 120000);
      proc.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`解压失败（退出码 ${code}）: ${stderr.slice(0, 200)}`));
      });
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
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

/** 手动显示公告（渲染层 mount 后补发 / 标题栏入口）：只弹未读的，已读的自动隐藏 */
export function showAnnouncements(): void {
  const read = getReadAnnouncementIds();
  if (read.has(BUILTIN_ANNOUNCEMENT.id)) return;
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
