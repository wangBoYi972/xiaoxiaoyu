import { ipcMain } from 'electron';
import { getDatabase, saveDatabase } from '../store/database';
import { v4 as uuidv4 } from 'uuid';

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
  ipcMain.handle('conv:list', () => {
    const rows = queryAll(
      'SELECT id, title, model_id as modelId, provider_id as providerId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, is_pinned as isPinned FROM conversations ORDER BY updated_at DESC'
    );
    return rows;
  });

  ipcMain.handle('conv:get', (_event, id: string) => {
    return queryOne(
      'SELECT id, title, model_id as modelId, provider_id as providerId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, is_pinned as isPinned FROM conversations WHERE id = ?',
      [id]
    );
  });

  ipcMain.handle('conv:create', (_event, data: { title?: string; modelId: string; providerId: string }) => {
    const id = uuidv4();
    const title = data.title || '新对话';
    const now = Math.floor(Date.now() / 1000);
    execute(
      'INSERT INTO conversations (id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, title, data.modelId, data.providerId, now, now]
    );
    return { id, title, modelId: data.modelId, providerId: data.providerId, createdAt: now, updatedAt: now, messageCount: 0, isPinned: false };
  });

  ipcMain.handle('conv:delete', (_event, id: string) => {
    execute('DELETE FROM messages WHERE conversation_id = ?', [id], true);
    execute('DELETE FROM conversations WHERE id = ?', [id]);
  });

  ipcMain.handle('conv:rename', (_event, id: string, title: string) => {
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
