// JWT 认证中间件
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../store/database';
import { logger } from '../utils/logger';

let jwtSecret: string = '';

export function initAuth(): void {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', ['jwt_secret']);
  if (row) {
    jwtSecret = row.value;
  } else {
    const crypto = require('crypto');
    jwtSecret = crypto.randomBytes(32).toString('hex');
    const db = require('../store/database');
    db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['jwt_secret', jwtSecret]);
    logger.info('已生成新的 JWT 密钥');
  }
}

export function getJwtSecret(): string { return jwtSecret; }

// 从请求中提取用户信息
export function getUserId(req: Request): number | null {
  return (req as any).user?.userId ?? null;
}

// 获取 admin token（环境变量优先，数据库兜底）
export function getAdminToken(): string {
  return process.env.ADMIN_TOKEN || '';
}

// JWT 验证中间件
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // 支持 Bearer token 或直接传 admin_token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, jwtSecret);
      (req as any).user = payload;
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Token 无效或已过期' });
      return;
    }
  }

  res.status(401).json({ error: '请先登录' });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), jwtSecret);
      (req as any).user = payload;
    } catch {}
  }
  next();
}
