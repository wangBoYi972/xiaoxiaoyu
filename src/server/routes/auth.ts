// 认证路由 — 注册 + 登录（PBKDF2 密码哈希）
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { queryOne, execute } from '../store/database';
import { getJwtSecret, authMiddleware, getUserId } from '../middleware/auth';
import { verifyCaptcha } from './captcha';
import { logger } from '../utils/logger';

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  // 兼容旧版 SHA-256 格式
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

export function authRoutes(): Router {
  const router = Router();

  // POST /api/auth/register — 注册新用户
  router.post('/register', (req: Request, res: Response) => {
    const { username, password, captchaKey, captchaCode } = req.body;

    // 验证码（仅注册需要）
    if (!captchaKey || !captchaCode) {
      res.status(400).json({ error: '请输入验证码' }); return;
    }
    if (!verifyCaptcha(captchaKey, captchaCode)) {
      res.status(400).json({ error: '验证码错误或已过期，已自动刷新' }); return;
    }

    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }
    if (username.length < 2 || username.length > 20) {
      res.status(400).json({ error: '用户名需要2-20个字符' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: '密码至少需要4个字符' });
      return;
    }

    // 检查是否已存在
    const existing = queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      res.status(400).json({ error: '用户名已被占用' });
      return;
    }

    const passwordHash = hashPassword(password);
    const now = Math.floor(Date.now() / 1000);
    execute('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
      [username, passwordHash, 'user', now]);

    // 注册完直接登录
    const user = queryOne('SELECT id, username, role FROM users WHERE username = ?', [username]);
    const jwtToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    logger.info(`新用户注册: ${username} (ID:${user.id})`);
    res.json({ token: jwtToken, user: { id: user.id, username: user.username, role: user.role }, message: '注册成功' });
  });

  // POST /api/auth/login — 用户名密码登录（无需验证码）
  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: '请输入用户名和密码' });
      return;
    }

    const user = queryOne('SELECT id, username, password_hash, role FROM users WHERE username = ?', [username]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    // 登录成功后如果是旧格式哈希，自动升级到 PBKDF2
    if (isLegacyHash(user.password_hash)) {
      execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
      logger.info(`已升级密码哈希: ${username}`);
    }

    const jwtToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    logger.info(`用户登录: ${username} (ID:${user.id})`);
    res.json({ token: jwtToken, user: { id: user.id, username: user.username, role: user.role }, message: '登录成功' });
  });

  // GET /api/auth/me — 当前用户信息
  router.get('/me', authMiddleware, (req: Request, res: Response) => {
    const userId = getUserId(req);
    const user = queryOne('SELECT id, username, role, created_at FROM users WHERE id = ?', [userId]);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
    res.json({ id: user.id, username: user.username, role: user.role, createdAt: user.created_at });
  });

  // PUT /api/auth/password — 修改密码
  router.put('/password', authMiddleware, (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: '新密码至少需要8个字符' }); return;
    }
    const user = queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user || !verifyPassword(oldPassword, user.password_hash)) {
      res.status(400).json({ error: '原密码错误' }); return;
    }
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), userId]);
    logger.info(`用户 ${userId} 已修改密码`);
    res.json({ message: '密码已修改' });
  });

  return router;
}
