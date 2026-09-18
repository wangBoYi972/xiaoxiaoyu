import { ipcMain } from 'electron';
import { getDatabase, saveDatabase } from '../store/database';
import { randomUUID as uuidv4 } from 'crypto';

// sql.js 辅助函数
function queryAll(sql: string, params: any[] = []): any[] {
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

function queryOne(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql: string, params: any[] = [], skipSave = false): void {
  const db = getDatabase();
  db.run(sql, params);
  if (!skipSave) {
    saveDatabase();
  }
}

export function registerConversationHandlers(): void {
  // 多账号数据隔离：会话按创建者（user_id）过滤。
  // 旧数据 user_id 为空串 → 对所有账号可见，保证升级后历史会话不消失。
  const ownerFilter = (userId?: number | string): string =>
    userId === undefined || userId === null || userId === ''
      ? "user_id = ''"
      : "(user_id = ? OR user_id = '')";
  const ownerParams = (userId?: number | string): string[] =>
    userId === undefined || userId === null || userId === '' ? [] : [String(userId)];

  ipcMain.handle('conv:list', (_event, userId?: number | string) => {
    const rows = queryAll(
      `SELECT id, title, model_id as modelId, provider_id as providerId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, is_pinned as isPinned FROM conversations WHERE ${ownerFilter(userId)} ORDER BY updated_at DESC`,
      ownerParams(userId)
    );
    return rows;
  });

  ipcMain.handle('conv:get', (_event, id: string, userId?: number | string) => {
    return queryOne(
      `SELECT id, title, model_id as modelId, provider_id as providerId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, is_pinned as isPinned FROM conversations WHERE id = ? AND ${ownerFilter(userId)}`,
      [id, ...ownerParams(userId)]
    );
  });

  ipcMain.handle('conv:create', (_event, data: { title?: string; modelId: string; providerId: string; userId?: number | string }) => {
    const id = uuidv4();
    const title = data.title || '新对话';
    const now = Math.floor(Date.now() / 1000);
    const uid = data.userId === undefined || data.userId === null ? '' : String(data.userId);
    execute(
      'INSERT INTO conversations (id, user_id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, uid, title, data.modelId, data.providerId, now, now]
    );
    return { id, title, modelId: data.modelId, providerId: data.providerId, createdAt: now, updatedAt: now, messageCount: 0, isPinned: false };
  });

  ipcMain.handle('conv:delete', (_event, id: string, userId?: number | string) => {
    const target = queryOne('SELECT user_id FROM conversations WHERE id = ?', [id]) as any;
    if (!target) return;
    // 空 user_id（历史会话）任何账号都能删；有归属的只有归属者能删
    if (target.user_id && String(target.user_id) !== String(userId ?? '')) return;
    execute('DELETE FROM messages WHERE conversation_id = ?', [id], true);
    execute('DELETE FROM conversations WHERE id = ?', [id]);
  });

  ipcMain.handle('conv:rename', (_event, id: string, title: string, userId?: number | string) => {
    const target = queryOne('SELECT user_id FROM conversations WHERE id = ?', [id]) as any;
    if (!target) return;
    if (target.user_id && String(target.user_id) !== String(userId ?? '')) return;
    const now = Math.floor(Date.now() / 1000);
    execute('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [title, now, id]);
  });

  ipcMain.handle('msg:list', (_event, conversationId: string) => {
    return queryAll(
      'SELECT id, conversation_id as conversationId, role, content, token_count as tokenCount, files, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversationId]
    );
  });
}
