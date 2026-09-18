// 认证路由 — QQ 邮箱 + 邮箱验证码（注册 / 登录 / 重置密码）
// 密码哈希与验证码逻辑与桌面端共用 src/shared/email-code.ts，避免两端行为漂移。
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne, execute } from '../store/database';
import { getJwtSecret, authMiddleware, getUserId } from '../middleware/auth';
import { clientKey, recordFailure, recordSuccess } from '../middleware/login-guard';
import { verifyCaptcha } from './captcha';
import { logger } from '../utils/logger';
import { sendVerificationMail, isSmtpConfigured } from '../utils/mailer';
import {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  isQQEmail,
  normalizeEmail,
  maskEmail,
  VerificationCodeStore,
} from '../../shared/email-code';
import { ADMIN_EMAILS } from '../../shared/admin-config';

// 进程内验证码仓库：10 分钟有效 / 60 秒重发间隔 / 最多 5 次校验
const codeStore = new VerificationCodeStore();

// 白名单管理员兜底：真实管理员可能因"默认 admin 账号先存在"而落成 user 角色，
// 服务启动时按 ADMIN_EMAILS 自动提升（幂等）
export function promoteAdminAccounts(): void {
  for (const email of ADMIN_EMAILS) {
    execute(
      'UPDATE users SET role = ? WHERE LOWER(username) = ? OR LOWER(email) = ?',
      ['admin', email, email]
    );
  }
}
promoteAdminAccounts();

function issueJwt(user: any): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
}

/** 按邮箱或历史用户名查找用户（注册新用户会把邮箱同时写入 username 与 email 两列） */
function findUserByAccount(account: string): any | null {
  const normalized = normalizeEmail(account);
  return queryOne(
    'SELECT id, username, email, role, password_hash FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
    [normalized, normalized]
  ) || queryOne(
    'SELECT id, username, email, role, password_hash FROM users WHERE username = ?',
    [account.trim()]
  );
}

export function authRoutes(): Router {
  const router = Router();

  // GET /api/auth/smtp-status — 发件邮箱是否已配置（前端据此提示）
  router.get('/smtp-status', (_req: Request, res: Response) => {
    res.json({ configured: isSmtpConfigured() });
  });

  // POST /api/auth/send-code — 发送邮箱验证码（注册 / 重置密码共用）
  router.post('/send-code', async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const purpose: 'register' | 'reset' = req.body?.purpose === 'reset' ? 'reset' : 'register';

    if (!isQQEmail(email)) {
      res.status(400).json({ ok: false, error: '请输入正确的 QQ 邮箱（例如 123456789@qq.com）' });
      return;
    }

    // 重置密码：账号必须已存在（避免暴露注册状态以外的信息泄露）
    if (purpose === 'reset') {
      const exists = findUserByAccount(email);
      if (!exists) {
        res.status(400).json({ ok: false, error: '该邮箱尚未注册' });
        return;
      }
    }

    if (!isSmtpConfigured()) {
      res.status(503).json({
        ok: false,
        error: '服务端未配置发件邮箱，暂时无法发送验证码。请管理员在设置中配置 smtp_user / smtp_pass。',
        code: 'SMTP_NOT_CONFIGURED',
      });
      return;
    }

    const issued = codeStore.issue(email);
    if (!issued.ok || !issued.code) {
      res.status(429).json({ ok: false, error: issued.error || '发送过于频繁' });
      return;
    }

    try {
      await sendVerificationMail(email, issued.code, purpose);
      res.json({ ok: true, message: '验证码已发送，请查收 QQ 邮箱（注意垃圾邮件箱）' });
    } catch (e: any) {
      codeStore.revoke(email); // 发信失败则作废，允许立即重试
      logger.error(`发送验证码失败: ${maskEmail(email)}`, e as Error);
      res.status(500).json({ ok: false, error: e?.message || '验证码发送失败，请稍后再试' });
    }
  });

  // POST /api/auth/register — QQ 邮箱注册（需邮箱验证码）
  // 注册模式：库里还没有任何账号 → 首个注册免验证码并成为管理员（首账号引导）
  router.get('/registration-mode', (_req: Request, res: Response) => {
    const row = queryOne('SELECT COUNT(*) AS c FROM users') as any;
    res.json({ firstAccount: !row || Number(row.c) === 0 });
  });

  router.post('/register', (req: Request, res: Response) => {
    const { username, password, code, captchaKey, captchaCode } = req.body || {};
    const email = normalizeEmail(username);

    if (!email || !password) {
      res.status(400).json({ ok: false, error: '邮箱和密码不能为空' });
      return;
    }
    if (!isQQEmail(email)) {
      res.status(400).json({ ok: false, error: '请使用 QQ 邮箱注册（例如 123456789@qq.com）' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ ok: false, error: '密码至少需要 6 个字符' });
      return;
    }
    if (password.length > 64) {
      res.status(400).json({ ok: false, error: '密码过长（最多 64 位）' });
      return;
    }
    // 首账号引导：库里还没有任何用户时，首个注册免验证码并成为管理员
    const countRow = queryOne('SELECT COUNT(*) AS c FROM users') as any;
    const isFirstAccount = !countRow || Number(countRow.c) === 0;

    if (!isFirstAccount) {
      if (!code) {
        res.status(400).json({ ok: false, error: '请输入邮箱验证码' });
        return;
      }
      // 图形验证码为可选加固：前端传了才校验，便于平滑迁移
      if (captchaKey && captchaCode) {
        if (!verifyCaptcha(captchaKey, captchaCode)) {
          res.status(400).json({ ok: false, error: '图形验证码错误或已过期' });
          return;
        }
      }
      const codeCheck = codeStore.verify(email, String(code));
      if (!codeCheck.ok) {
        res.status(400).json({ ok: false, error: codeCheck.error });
        return;
      }
    }

    if (findUserByAccount(email)) {
      res.status(400).json({ ok: false, error: '该 QQ 邮箱已注册，请直接登录' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    execute(
      'INSERT INTO users (username, password_hash, email, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [email, hashPassword(password), email, isFirstAccount ? 'admin' : 'user', now]
    );

    const user = queryOne('SELECT id, username, email, role FROM users WHERE username = ?', [email]);
    logger.info(`新用户注册: ${maskEmail(email)} (ID:${user.id})`);
    res.json({
      token: issueJwt(user),
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      message: '注册成功',
    });
  });

  // POST /api/auth/login — QQ 邮箱（或历史用户名）+ 密码
  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      res.status(400).json({ ok: false, error: '请输入邮箱和密码' });
      return;
    }

    const key = clientKey(req);
    const user = findUserByAccount(String(username));
    if (!user || !verifyPassword(password, user.password_hash)) {
      // 失败计数：慢速撞库也能被封禁；文案统一，不给出账号枚举线索
      const state = recordFailure(key);
      const suffix = state.blocked
        ? `，失败次数过多，已临时封禁 ${Math.ceil((state.retryAfterSec || 60) / 60)} 分钟`
        : '';
      logger.warn(`登录失败: ${maskEmail(String(username))}${suffix}`);
      res.status(401).json({ ok: false, error: `邮箱或密码错误${suffix}` });
      return;
    }

    recordSuccess(key);

    // 旧格式哈希登录成功后自动升级到 PBKDF2
    if (isLegacyHash(user.password_hash)) {
      execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
      logger.info(`已升级密码哈希: ${maskEmail(user.email || user.username)}`);
    }

    logger.info(`用户登录: ${maskEmail(user.email || user.username)} (ID:${user.id})`);
    res.json({
      token: issueJwt(user),
      user: { id: user.id, username: user.username, email: user.email || user.username, role: user.role },
      message: '登录成功',
    });
  });

  // POST /api/auth/reset-password — 邮箱验证码 + 新密码
  router.post('/reset-password', (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const { code, newPassword } = req.body || {};

    if (!isQQEmail(email)) {
      res.status(400).json({ ok: false, error: '请输入正确的 QQ 邮箱' });
      return;
    }
    if (!code) {
      res.status(400).json({ ok: false, error: '请输入邮箱验证码' });
      return;
    }
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ ok: false, error: '新密码至少需要 6 个字符' });
      return;
    }

    const codeCheck = codeStore.verify(email, String(code));
    if (!codeCheck.ok) {
      res.status(400).json({ ok: false, error: codeCheck.error });
      return;
    }

    const user = findUserByAccount(email);
    if (!user) {
      res.status(400).json({ ok: false, error: '该邮箱尚未注册' });
      return;
    }

    execute('UPDATE users SET password_hash = ?, must_change_pwd = 0 WHERE id = ?', [
      hashPassword(String(newPassword)),
      user.id,
    ]);
    logger.info(`用户 ${maskEmail(user.email || user.username)} 已重置密码`);
    res.json({ ok: true, message: '密码已重置，请使用新密码登录' });
  });

  // GET /api/auth/me — 当前用户信息
  router.get('/me', authMiddleware, (req: Request, res: Response) => {
    const userId = getUserId(req);
    const user = queryOne('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [userId]);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
    res.json({
      id: user.id,
      username: user.username,
      email: user.email || user.username,
      role: user.role,
      createdAt: user.created_at,
    });
  });

  // PUT /api/auth/password — 修改密码
  router.put('/password', authMiddleware, (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: '新密码至少需要8个字符' }); return;
    }
    const user = queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user || !verifyPassword(oldPassword, user.password_hash)) {
      res.status(400).json({ error: '原密码错误' }); return;
    }
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(String(newPassword)), userId]);
    logger.info(`用户 ${userId} 已修改密码`);
    res.json({ message: '密码已修改' });
  });

  return router;
}
