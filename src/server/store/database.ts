// 服务器端数据库 — 从 main/store/database.ts 适配
// 数据库路径：优先环境变量 → 项目根目录下的 data/ 文件夹
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

// 项目根目录：dist/server/server/store/ → 向上4级到 xiaoxiaoyu/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// data 目录固定在项目根目录（dist 之外，确保部署不会清除用户数据）
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');

export async function initDatabase(): Promise<void> {
  // 数据目录（独立于 dist，部署不会清除用户数据）
  const dataDir = DATA_DIR;
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}

  dbPath = process.env.DB_PATH || path.join(dataDir, 'ai-chat.db');

  logger.info(`初始化数据库: ${dbPath}`);

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    logger.info('已加载现有数据库');
  } else {
    db = new SQL.Database();
    logger.info('创建新数据库');
  }

  db.run('PRAGMA foreign_keys = ON');

  // ===== 用户表 =====
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  // 创建表（与桌面版完全一致，conversations 和 provider_configs 增加 user_id）
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '新对话',
      model_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      files TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      api_key_enc TEXT,
      base_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      models_json TEXT,
      extra_headers_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // 索引
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_provider_configs_user ON provider_configs(user_id)');

  // 兼容旧数据库：添加可能缺失的列（SQLite ALTER TABLE 不支持 NOT NULL）
  try { db.run('ALTER TABLE conversations ADD COLUMN user_id INTEGER DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE provider_configs ADD COLUMN user_id INTEGER DEFAULT 0'); } catch {}

  // 为新版本兼容：先尝试添加可能缺失的列
  try { db.run('ALTER TABLE users ADD COLUMN must_change_pwd INTEGER DEFAULT 0'); } catch {}

  // 创建默认管理员（PBKDF2 哈希）
  const adminRow = queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminRow) {
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 100000, 64, 'sha512').toString('hex');
    const passwordHash = `pbkdf2:${salt}:${hash}`;
    const now = Math.floor(Date.now() / 1000);
    db.run('INSERT INTO users (username, password_hash, role, created_at, must_change_pwd) VALUES (?, ?, ?, ?, ?)',
      ['admin', passwordHash, 'admin', now, 1]);
    logger.info('==========================================');
    logger.info('  默认管理员: admin / admin123');
    logger.info('  首次登录后请立即修改密码！');
    logger.info('==========================================');
  }

  // 确保加密密钥已生成（在 DB 就绪后立即初始化）
  try {
    const { encryptApiKey } = require('./crypto');
    encryptApiKey('__init_check__'); // 触发 deriveKey，确保密钥已持久化
  } catch {}

  // 默认设置
  const defaultSettings: Record<string, string> = {
    language: 'zh-CN',
    theme: 'auto',
    fontSize: '14',
    sendWithEnter: 'true',
    streamEnabled: 'true',
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // 默认管理员 token（如未设置过）
  if (!process.env.ADMIN_TOKEN) {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['admin_token', token]);
    logger.info(`==========================================`);
    logger.info(`  管理员 Token: ${token}`);
    logger.info(`  请妥善保存！首次登录需要此 Token`);
    logger.info(`==========================================`);
  }

  saveDatabase();
  logger.info('数据库初始化完成');
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

/** 持久化数据库到文件 */
export function saveDatabase(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    logger.error('保存数据库失败', e as Error);
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    logger.info('数据库已关闭');
  }
}

// 辅助函数
export function queryAll(sql: string, params: any[] = []): any[] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function queryOne(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function execute(sql: string, params: any[] = [], skipSave = false): void {
  const db = getDatabase();
  db.run(sql, params);
  if (!skipSave) {
    saveDatabase();
  }
}

export function executeBatch(statements: Array<{ sql: string; params: any[] }>): void {
  const db = getDatabase();
  for (const stmt of statements) {
    db.run(stmt.sql, stmt.params);
  }
  saveDatabase();
}
