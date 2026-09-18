// 认证公共逻辑 — 桌面端(main) 与 Web 服务端(server) 共用
// 纯逻辑，无 Electron / Express / 数据库依赖，可被两边同时引入。

import crypto from 'crypto';

// ============ 密码哈希（PBKDF2-SHA512） ============

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

/** 校验密码，兼容历史 SHA-256 单盐格式 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (isLegacyHash(storedHash)) {
    const legacy = crypto.createHash('sha256').update(password + 'xiaoxiaoyu-salt').digest('hex');
    return storedHash === legacy;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const computed = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  return hash === computed;
}

export function isLegacyHash(storedHash: string): boolean {
  return !storedHash.startsWith('pbkdf2:');
}

// ============ QQ 邮箱 ============

/** QQ 邮箱：QQ 号 5-11 位、不以 0 开头 */
export const QQ_EMAIL_RE = /^[1-9]\d{4,10}@qq\.com$/i;

export function isQQEmail(account: string): boolean {
  return QQ_EMAIL_RE.test((account || '').trim());
}

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/** 日志用脱敏：123456789@qq.com → 12***89@qq.com */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at <= 0) return normalized ? '***' : '';
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  if (local.length <= 4) return `${local.slice(0, 1)}***${local.slice(-1)}${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}${domain}`;
}

// ============ 邮箱验证码仓库（进程内，重启失效无碍） ============

export interface CodeEntry {
  /** 验证码哈希（不存明文，防内存转储/日志泄露） */
  codeHash: string;
  /** 哈希盐 */
  salt: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  /** 当日已发送次数 */
  dailyCount: number;
  /** 当日计数归属的日期（YYYY-MM-DD，本地时区） */
  dailyKey: string;
}

export interface CodeResult {
  ok: boolean;
  error?: string;
  /** 仅 issue() 返回一次，用于发信，不落库不入日志 */
  code?: string;
}

export interface CodeStoreOptions {
  /** 验证码有效期 */
  ttlMs?: number;
  /** 同一邮箱重发间隔 */
  resendMs?: number;
  /** 最多校验次数，超过则作废 */
  maxAttempts?: number;
  /** 同一邮箱每日最多发送次数 */
  dailyLimit?: number;
}

export const DEFAULT_CODE_OPTIONS: Required<CodeStoreOptions> = {
  ttlMs: 10 * 60 * 1000,
  resendMs: 60 * 1000,
  maxAttempts: 5,
  dailyLimit: 10,
};

function hashCode(salt: string, code: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function localDayKey(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class VerificationCodeStore {
  private store = new Map<string, CodeEntry>();
  private opts: Required<CodeStoreOptions>;

  constructor(options: CodeStoreOptions = {}) {
    this.opts = { ...DEFAULT_CODE_OPTIONS, ...options };
    // 定期清理过期验证码（unref 避免拖住进程退出）
    const timer = setInterval(() => this.cleanup(), 60_000);
    (timer as any).unref?.();
  }

  /** 生成并暂存验证码，返回明文用于发信（明文只在本函数返回值里出现一次） */
  issue(email: string): CodeResult {
    const key = normalizeEmail(email);
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && now - existing.lastSentAt < this.opts.resendMs) {
      const waitSec = Math.ceil((this.opts.resendMs - (now - existing.lastSentAt)) / 1000);
      return { ok: false, error: `发送过于频繁，请 ${waitSec} 秒后再试` };
    }

    const today = localDayKey(now);
    const dailyCount = existing && existing.dailyKey === today ? existing.dailyCount : 0;
    if (dailyCount >= this.opts.dailyLimit) {
      return { ok: false, error: `今日验证码发送次数已达上限（${this.opts.dailyLimit} 次），请明天再试或联系管理员` };
    }

    // crypto.randomInt：密码学安全随机源，避免 Math.random 可预测
    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');

    this.store.set(key, {
      codeHash: hashCode(salt, code),
      salt,
      expiresAt: now + this.opts.ttlMs,
      attempts: 0,
      lastSentAt: now,
      dailyCount: dailyCount + 1,
      dailyKey: today,
    });
    return { ok: true, code };
  }

  /** 校验验证码（一次性使用） */
  verify(email: string, code: string): CodeResult {
    const key = normalizeEmail(email);
    const entry = this.store.get(key);
    if (!entry) return { ok: false, error: '请先获取邮箱验证码' };

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return { ok: false, error: '验证码已过期，请重新获取' };
    }
    if (entry.attempts >= this.opts.maxAttempts) {
      this.store.delete(key);
      return { ok: false, error: '验证码错误次数过多，请重新获取' };
    }

    entry.attempts++;
    const input = String(code || '').trim();
    const matched = /^\d{6}$/.test(input)
      && timingSafeEqualHex(entry.codeHash, hashCode(entry.salt, input));
    if (!matched) {
      return { ok: false, error: '验证码错误' };
    }
    this.store.delete(key); // 一次性使用
    return { ok: true };
  }

  /** 撤销某邮箱的验证码（例如发信失败时回滚） */
  revoke(email: string): void {
    this.store.delete(normalizeEmail(email));
  }

  has(email: string): boolean {
    return this.store.has(normalizeEmail(email));
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(key);
    }
  }
}
