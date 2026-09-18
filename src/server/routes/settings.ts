// 设置管理路由
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { queryAll, queryOne, execute } from '../store/database';
import { isAdminAccount } from '../../shared/admin-config';

const DENIED_KEYS = new Set([
  'jwt_secret', 'admin_token', 'admin_password_hash',
  'encryption_key', 'master_key',
]);

const DENIED_PREFIXES = ['secret_', 'private_', 'internal_'];

// 可写但不可读：写入后仅返回是否已配置，避免密钥泄露
const WRITE_ONLY_KEYS = new Set(['smtp_pass']);

// 系统级配置：仅管理员可读/可写（发件邮箱被任意用户改掉 = 全体用户验证码被劫持）
const ADMIN_ONLY_PREFIXES = ['smtp_'];

function isKeyDenied(key: string): boolean {
  if (DENIED_KEYS.has(key)) return true;
  if (DENIED_PREFIXES.some(p => key.startsWith(p))) return true;
  return false;
}

function isWriteOnly(key: string): boolean {
  return WRITE_ONLY_KEYS.has(key);
}

function isAdminOnly(key: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(p => key.startsWith(p));
}

/** JWT 里的角色 + 白名单邮箱兜底（旧 token 的 role 可能还是 user） */
function isAdminRequest(req: Request): boolean {
  const user = (req as any).user;
  if (!user) return false;
  return user.role === 'admin' || isAdminAccount(user.username);
}

export function settingsRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  // GET /api/settings — 获取所有设置
  router.get('/', (req: Request, res: Response) => {
    const admin = isAdminRequest(req);
    const rows = queryAll('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      if (isKeyDenied(row.key)) continue;
      if (!admin && isAdminOnly(row.key)) continue; // 非管理员：连"是否已配置"都不暴露
      settings[row.key] = isWriteOnly(row.key) ? (row.value ? '******' : '') : row.value;
    }
    res.json(settings);
  });

  // GET /api/settings/:key — 获取单个设置（敏感key拒绝访问）
  router.get('/:key', (req: Request, res: Response) => {
    if (isKeyDenied(String(req.params.key))) {
      res.status(403).json({ error: '无权访问此设置' });
      return;
    }
    if (isAdminOnly(String(req.params.key)) && !isAdminRequest(req)) {
      res.status(403).json({ error: '仅管理员可访问邮件服务配置' });
      return;
    }
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [req.params.key]);
    if (isWriteOnly(String(req.params.key))) {
      res.json({ value: null, hasValue: !!row?.value });
      return;
    }
    res.json({ value: row?.value || null });
  });

  // PUT /api/settings/:key — 设置（敏感key拒绝修改）
  router.put('/:key', (req: Request, res: Response) => {
    if (isKeyDenied(String(req.params.key))) {
      res.status(403).json({ error: '无权修改此设置' });
      return;
    }
    if (isAdminOnly(String(req.params.key)) && !isAdminRequest(req)) {
      res.status(403).json({ error: '仅管理员可修改邮件服务配置' });
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
