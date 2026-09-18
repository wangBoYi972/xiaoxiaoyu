// 对话管理路由
import { Router, Request, Response } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import { authMiddleware, getUserId } from '../middleware/auth';
import { queryAll, queryOne, execute } from '../store/database';

export function conversationRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  // GET /api/conversations — 只看自己的对话
  router.get('/', (req: Request, res: Response) => {
    const uid = getUserId(req);
    const rows = queryAll(
      'SELECT id, title, model_id as modelId, provider_id as providerId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, is_pinned as isPinned FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
      [uid]
    );
    res.json(rows);
  });

  // GET /api/conversations/:id — 单个
  router.get('/:id', (req: Request, res: Response) => {
    const uid = getUserId(req);
    const row = queryOne(
      'SELECT id, title, model_id as modelId, provider_id as providerId, created_at as createdAt, updated_at as updatedAt, message_count as messageCount, is_pinned as isPinned FROM conversations WHERE id = ? AND user_id = ?',
      [req.params.id, uid]
    );
    if (!row) { res.status(404).json({ error: '对话不存在' }); return; }
    res.json(row);
  });

  // POST /api/conversations — 创建（带 user_id）
  router.post('/', (req: Request, res: Response) => {
    const { title, modelId, providerId } = req.body;
    const uid = getUserId(req);
    if (!modelId || !providerId) {
      res.status(400).json({ error: '缺少 modelId 或 providerId' }); return;
    }
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const convTitle = title || '新对话';
    execute(
      'INSERT INTO conversations (id, user_id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, uid, convTitle, modelId, providerId, now, now]
    );
    res.json({ id, title: convTitle, modelId, providerId, createdAt: now, updatedAt: now, messageCount: 0, isPinned: 0 });
  });

  // PUT /api/conversations/:id — 重命名（验证归属）
  router.put('/:id', (req: Request, res: Response) => {
    const { title } = req.body;
    const uid = getUserId(req);
    if (!title) { res.status(400).json({ error: '缺少 title' }); return; }
    const now = Math.floor(Date.now() / 1000);
    execute('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?', [title, now, req.params.id, uid]);
    res.json({ ok: true });
  });

  // DELETE /api/conversations/:id — 删除（验证归属）
  router.delete('/:id', (req: Request, res: Response) => {
    const uid = getUserId(req);
    execute('DELETE FROM messages WHERE conversation_id = ?', [req.params.id], true);
    execute('DELETE FROM conversations WHERE id = ? AND user_id = ?', [req.params.id, uid]);
    res.json({ ok: true });
  });

  // GET /api/conversations/:id/messages — 消息列表
  router.get('/:id/messages', (req: Request, res: Response) => {
    const rows = queryAll(
      'SELECT id, conversation_id as conversationId, role, content, token_count as tokenCount, files, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  });

  return router;
}
