// 登录失败封禁 — 失败次数递增、封禁时长指数退避
// 与「固定速率限制」互补：慢速撞库不会被 N 次/分拦住，但会被失败计数拦住。
import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 15 * 60 * 1000;     // 失败计数窗口
const MAX_FAILURES = 5;               // 达到该次数开始封禁
const BASE_BLOCK_MS = 60 * 1000;      // 首次封禁 1 分钟
const MAX_BLOCK_MS = 30 * 60 * 1000;  // 最长封禁 30 分钟

interface Attempt {
  failures: number;
  windowStart: number;
  blockedUntil: number;
}

const attempts = new Map<string, Attempt>();

// 定期清理过期记录，避免 Map 无限增长
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of attempts) {
    const idle = now > val.windowStart + WINDOW_MS && now > val.blockedUntil;
    if (idle) attempts.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export function clientKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export interface LoginGuardState {
  allowed: boolean;
  retryAfterSec?: number;
  message?: string;
}

export function checkLogin(key: string): LoginGuardState {
  const entry = attempts.get(key);
  if (!entry) return { allowed: true };
  const now = Date.now();
  if (entry.blockedUntil > now) {
    const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
    return {
      allowed: false,
      retryAfterSec,
      message: `登录失败次数过多，请在 ${Math.ceil(retryAfterSec / 60)} 分钟后再试`,
    };
  }
  return { allowed: true };
}

/** 记录一次登录失败；返回本次是否触发了新的封禁 */
export function recordFailure(key: string): { blocked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now > entry.windowStart + WINDOW_MS) {
    entry = { failures: 0, windowStart: now, blockedUntil: 0 };
  }
  entry.failures++;

  if (entry.failures >= MAX_FAILURES) {
    const over = entry.failures - MAX_FAILURES;          // 0,1,2...
    const blockMs = Math.min(MAX_BLOCK_MS, BASE_BLOCK_MS * Math.pow(2, over));
    entry.blockedUntil = now + blockMs;
    attempts.set(key, entry);
    return { blocked: true, retryAfterSec: Math.ceil(blockMs / 1000) };
  }

  attempts.set(key, entry);
  return { blocked: false };
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}

/** Express 中间件：命中封禁直接 429 */
export function loginGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
  const state = checkLogin(clientKey(req));
  if (!state.allowed) {
    res.setHeader('Retry-After', String(state.retryAfterSec || 60));
    res.status(429).json({ ok: false, error: state.message, retryAfterSec: state.retryAfterSec });
    return;
  }
  next();
}
