import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logger } from '../utils/logger';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'ai-chat.db');

  logger.info(`初始化数据库: ${dbPath}`);

  const SQL = await initSqlJs();

  // 如果已有数据库文件，加载它
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
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

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC)');

  // 默认设置
  const defaultSettings: Record<string, string> = {
    language: 'zh-CN',
    theme: 'auto',
    fontSize: '14',
    autoLaunch: 'false',
    sendWithEnter: 'true',
    streamEnabled: 'true',
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // 保存到文件
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
