// 设置管理路由
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { queryAll, queryOne, execute } from '../store/database';

const DENIED_KEYS = new Set([
  'jwt_secret', 'admin_token', 'admin_password_hash',
  'encryption_key', 'master_key',
]);

const DENIED_PREFIXES = ['secret_', 'private_', 'internal_'];

function isKeyDenied(key: string): boolean {
  if (DENIED_KEYS.has(key)) return true;
  if (DENIED_PREFIXES.some(p => key.startsWith(p))) return true;
  return false;
}

export function settingsRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  // GET /api/settings — 获取所有设置
  router.get('/', (_req: Request, res: Response) => {
    const rows = queryAll('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      if (!isKeyDenied(row.key)) {
        settings[row.key] = row.value;
      }
    }
    res.json(settings);
  });

  // GET /api/settings/:key — 获取单个设置（敏感key拒绝访问）
  router.get('/:key', (req: Request, res: Response) => {
    if (isKeyDenied(req.params.key)) {
      res.status(403).json({ error: '无权访问此设置' });
      return;
    }
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [req.params.key]);
    res.json({ value: row?.value || null });
  });

  // PUT /api/settings/:key — 设置（敏感key拒绝修改）
  router.put('/:key', (req: Request, res: Response) => {
    if (isKeyDenied(req.params.key)) {
      res.status(403).json({ error: '无权修改此设置' });
      return;
    }
    const { value } = req.body;
    if (value === undefined) {
      res.status(400).json({ error: '缺少 value' });
      return;
    }
    execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [req.params.key, value]);
    res.json({ ok: true });
  });

  return router;
}
