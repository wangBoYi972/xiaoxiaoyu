// 桌面版认证 IPC — PBKDF2 密码哈希
import { ipcMain } from 'electron';
import { getDatabase, saveDatabase } from '../store/database';
import crypto from 'crypto';

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith('pbkdf2:')) {
    const legacy = crypto.createHash('sha256').update(password + 'xiaoxiaoyu-salt').digest('hex');
    return storedHash === legacy;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const computed = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return hash === computed;
}

function isLegacyHash(storedHash: string): boolean {
  return !storedHash.startsWith('pbkdf2:');
}

function queryOne(sql: string, params: any[] = []): any | null {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result: any = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

export function registerAuthHandlers(): void {
  // 确保用户表存在
  const db = getDatabase();
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL DEFAULT 0
  )`);

  // 兼容旧表结构（必须在 INSERT 之前执行）
  try { db.run('ALTER TABLE users ADD COLUMN must_change_pwd INTEGER DEFAULT 0'); } catch {}

  // 创建默认管理员（PBKDF2 哈希）
  const admin = queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    const now = Math.floor(Date.now() / 1000);
    db.run('INSERT INTO users (username, password_hash, role, created_at, must_change_pwd) VALUES (?, ?, ?, ?, ?)',
      ['admin', hashPassword('admin123'), 'admin', now, 1]);
  }
  saveDatabase();

  // 注册
  ipcMain.handle('auth:register', (_event, { username, password }: { username: string; password: string }) => {
    try {
      if (!username || !password) return { ok: false, error: '用户名和密码不能为空' };
      if (username.length < 2) return { ok: false, error: '用户名至少2个字符' };
      if (password.length < 4) return { ok: false, error: '密码至少4个字符' };

      const exists = queryOne('SELECT id FROM users WHERE username = ?', [username]);
      if (exists) return { ok: false, error: '用户名已被占用' };

      const now = Math.floor(Date.now() / 1000);
      db.run('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
        [username, hashPassword(password), 'user', now]);
      const user = queryOne('SELECT id, username, role FROM users WHERE username = ?', [username]);
      saveDatabase();
      return { ok: true, user };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // 登录
  ipcMain.handle('auth:login', (_event, { username, password }: { username: string; password: string }) => {
    const user = queryOne('SELECT id, username, role, password_hash FROM users WHERE username = ?', [username]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return { ok: false, error: '用户名或密码错误' };
    }
    // 自动升级旧格式哈希
    if (isLegacyHash(user.password_hash)) {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
      saveDatabase();
    }
    return { ok: true, user: { id: user.id, username: user.username, role: user.role } };
  });

  // 获取当前用户（通过存储的 userId）
  ipcMain.handle('auth:me', (_event, userId: number) => {
    const user = queryOne('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    return user || null;
  });
}
