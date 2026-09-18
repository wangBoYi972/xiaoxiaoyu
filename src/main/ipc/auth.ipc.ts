// 桌面版认证 IPC — PBKDF2 密码哈希 · QQ 邮箱 + 邮箱验证码
// 哈希与验证码逻辑复用 src/shared/email-code.ts（与 Web 服务端同源）
import { ipcMain } from 'electron';
import { getDatabase, saveDatabase } from '../store/database';
import { sendVerificationMail, getSmtpConfig, isSmtpConfigured } from '../utils/mailer';
import { logger } from '../utils/logger';
import {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  isQQEmail,
  normalizeEmail,
  VerificationCodeStore,
} from '../../shared/email-code';
import { ADMIN_EMAILS, isAdminAccount } from '../../shared/admin-config';
import { onlineAuthEnabled, onlineSendCode, onlineVerifyCode } from '../../shared/online-auth';

export { isQQEmail };

// 验证码仓库：10 分钟有效 / 60 秒重发间隔 / 最多 5 次校验
const codeStore = new VerificationCodeStore();

function queryOne(sql: string, params: any[] = []): any | null {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result: any = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

/** 按邮箱或历史用户名查用户（新注册用户邮箱同时写入 username 与 email 两列） */
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

export function registerAuthHandlers(): void {
  // 确保用户表存在
  const db = getDatabase();
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL DEFAULT 0
  )`);

  // 兼容旧表结构（必须在 INSERT 之前执行）
  try { db.run('ALTER TABLE users ADD COLUMN must_change_pwd INTEGER DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE users ADD COLUMN email TEXT'); } catch {}
  // 会话按用户隔离（旧数据 user_id 为空串 → 对所有账号可见，避免升级后历史会话消失）
  try { db.run("ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}

  /** 校验 userId 对应用户是否管理员（SMTP 等系统级配置的门槛） */
  const isAdminUser = (userId: unknown): boolean => {
    if (userId === undefined || userId === null || userId === '') return false;
    const u = queryOne('SELECT username, email, role FROM users WHERE id = ?', [userId]) as any;
    if (!u) return false;
    return u.role === 'admin' || isAdminAccount(u.email || u.username);
  };

  // 白名单管理员兜底：真实管理员可能因"默认 admin 账号先存在"而落成 user 角色，
  // 启动时按 ADMIN_EMAILS 自动提升（幂等）
  try {
    for (const email of ADMIN_EMAILS) {
      db.run('UPDATE users SET role = ? WHERE LOWER(username) = ? OR LOWER(email) = ?', ['admin', email, email]);
    }
  } catch { /* 忽略表结构差异 */ }
  saveDatabase();

  // 创建默认管理员（PBKDF2 哈希）
  const admin = queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    const now = Math.floor(Date.now() / 1000);
    db.run('INSERT INTO users (username, password_hash, role, created_at, must_change_pwd) VALUES (?, ?, ?, ?, ?)',
      ['admin', hashPassword('admin123'), 'admin', now, 1]);
  }
  saveDatabase();

  // 发送邮箱验证码（注册 / 重置密码共用）
  ipcMain.handle('auth:send-code', async (_event, { email, purpose }: { email: string; purpose?: 'register' | 'reset' }) => {
    try {
      const normalized = normalizeEmail(email);
      if (!isQQEmail(normalized)) {
        return { ok: false, error: '请输入正确的 QQ 邮箱（例如 123456789@qq.com）' };
      }
      const mode: 'register' | 'reset' = purpose === 'reset' ? 'reset' : 'register';

      // 重置密码：账号必须已存在
      if (mode === 'reset') {
        if (!findUserByAccount(normalized)) return { ok: false, error: '该邮箱尚未注册' };
      }
      // 注册：账号已存在时直接提示，省一次发信
      if (mode === 'register') {
        if (findUserByAccount(normalized)) return { ok: false, error: '该 QQ 邮箱已注册，请直接登录' };
      }

      // 本机没配 SMTP（典型：别人装的分发包）→ 走在线发码服务，
      // 服务端持有发件邮箱，客户端拿不到任何授权码
      if (!isSmtpConfigured() && onlineAuthEnabled()) {
        const online = await onlineSendCode(normalized, mode);
        return online.ok
          ? { ok: true, message: online.message || '验证码已发送，请查收 QQ 邮箱（注意垃圾邮件箱）' }
          : { ok: false, error: online.error || '验证码发送失败', code: online.code };
      }

      if (!isSmtpConfigured()) {
        return {
          ok: false,
          error: '发件邮箱未配置：请先填写 SMTP 发件邮箱与授权码（设置 → 邮件服务）',
          code: 'SMTP_NOT_CONFIGURED',
        };
      }

      const issued = codeStore.issue(normalized);
      if (!issued.ok || !issued.code) return { ok: false, error: issued.error };

      try {
        await sendVerificationMail(normalized, issued.code, mode);
      } catch (mailErr: any) {
        codeStore.revoke(normalized); // 发信失败作废，允许立即重试
        throw mailErr;
      }
      return { ok: true, message: '验证码已发送，请查收 QQ 邮箱（注意垃圾邮件箱）' };
    } catch (e: any) {
      logger.error('发送验证码失败', e as Error);
      return { ok: false, error: e.message || '验证码发送失败，请稍后再试' };
    }
  });

  // 查询 SMTP 配置状态。
  // 详情（发件邮箱等）仅管理员可见；未登录/普通用户只拿 configured 布尔（登录页提示用）
  ipcMain.handle('auth:smtp-status', (_event, userId?: number) => {
    const cfg = getSmtpConfig();
    const base: any = { configured: isSmtpConfigured() };
    if (isAdminUser(userId)) {
      base.smtpUser = cfg.user;
      base.smtpHost = cfg.host;
      base.smtpPort = cfg.port;
    }
    return base;
  });

  // 保存 SMTP 配置 —— 仅管理员（系统级配置，不该由普通账号改动）
  ipcMain.handle('auth:set-smtp', (_event, cfg: { user?: string; pass?: string; host?: string; port?: number }, userId?: number) => {
    try {
      if (!isAdminUser(userId)) {
        return { ok: false, error: '只有管理员可以配置邮件服务' };
      }
      const rows: Array<[string, string]> = [];
      if (cfg?.user !== undefined) rows.push(['smtp_user', String(cfg.user).trim()]);
      if (cfg?.pass !== undefined && cfg.pass !== '') rows.push(['smtp_pass', String(cfg.pass).trim()]);
      if (cfg?.host) rows.push(['smtp_host', String(cfg.host).trim()]);
      if (cfg?.port) rows.push(['smtp_port', String(cfg.port)]);
      for (const [k, v] of rows) {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, v]);
      }
      saveDatabase();
      return { ok: true, configured: isSmtpConfigured() };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // 注册 — QQ 邮箱 + 邮箱验证码
  ipcMain.handle('auth:register', async (_event, { username, password, code }: { username: string; password: string; code?: string }) => {
    try {
      const email = normalizeEmail(username);
      if (!email || !password) return { ok: false, error: '邮箱和密码不能为空' };
      if (!isQQEmail(email)) return { ok: false, error: '请使用 QQ 邮箱注册（例如 123456789@qq.com）' };
      if (password.length < 6) return { ok: false, error: '密码至少 6 位' };
      if (password.length > 64) return { ok: false, error: '密码过长（最多 64 位）' };

      // 桌面端引导：本地还没有任何账号时，首个注册账号免验证码并成为管理员。
      // 否则会死锁——配置 SMTP 发件邮箱需要先进设置页，而进设置页又需要先登录。
      // （仅限桌面端本地库；Web 服务端保持严格验证码校验。）
      const countRow = queryOne('SELECT COUNT(*) AS c FROM users') as any;
      const isFirstAccount = !countRow || Number(countRow.c) === 0;

      if (!isFirstAccount) {
        if (!code) return { ok: false, error: '请输入邮箱验证码' };

        // 本机没发过码（码是服务端发的）→ 交给在线服务校验
        if (!isSmtpConfigured() && onlineAuthEnabled()) {
          const online = await onlineVerifyCode(email, String(code), 'register');
          if (!online.ok) return { ok: false, error: online.error || '验证码不正确' };
        } else {
          const codeCheck = codeStore.verify(email, String(code));
          if (!codeCheck.ok) return { ok: false, error: codeCheck.error };
        }
      }

      if (findUserByAccount(email)) return { ok: false, error: '该 QQ 邮箱已注册，请直接登录' };

      const now = Math.floor(Date.now() / 1000);
      db.run('INSERT INTO users (username, password_hash, email, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [email, hashPassword(password), email, isFirstAccount ? 'admin' : 'user', now]);
      const user = queryOne('SELECT id, username, email, role FROM users WHERE username = ?', [email]);
      saveDatabase();
      return { ok: true, user };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // 重置密码 — 邮箱验证码 + 新密码
  ipcMain.handle('auth:reset-password', async (_event, { email, code, newPassword }: { email: string; code: string; newPassword: string }) => {
    const normalized = normalizeEmail(email);
    if (!isQQEmail(normalized)) return { ok: false, error: '请输入正确的 QQ 邮箱' };
    if (!code) return { ok: false, error: '请输入邮箱验证码' };
    if (!newPassword || newPassword.length < 6) return { ok: false, error: '新密码至少 6 位' };

    if (!isSmtpConfigured() && onlineAuthEnabled()) {
      const online = await onlineVerifyCode(normalized, String(code), 'reset');
      if (!online.ok) return { ok: false, error: online.error || '验证码不正确' };
    } else {
      const codeCheck = codeStore.verify(normalized, String(code));
      if (!codeCheck.ok) return { ok: false, error: codeCheck.error };
    }

    const user = findUserByAccount(normalized);
    if (!user) return { ok: false, error: '该邮箱尚未注册' };

    db.run('UPDATE users SET password_hash = ?, must_change_pwd = 0 WHERE id = ?', [hashPassword(newPassword), user.id]);
    saveDatabase();
    return { ok: true, message: '密码已重置，请使用新密码登录' };
  });

  // 登录 — QQ 邮箱或历史用户名
  ipcMain.handle('auth:login', (_event, { username, password }: { username: string; password: string }) => {
    const account = (username || '').trim();
    if (!account || !password) return { ok: false, error: '请输入邮箱和密码' };

    const user = findUserByAccount(account);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return { ok: false, error: '邮箱或密码错误' };
    }
    // 自动升级旧格式哈希
    if (isLegacyHash(user.password_hash)) {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
      saveDatabase();
    }
    return { ok: true, user: { id: user.id, username: user.username, email: user.email || user.username, role: user.role } };
  });

  // 获取当前用户（通过存储的 userId）
  ipcMain.handle('auth:me', (_event, userId: number) => {
    const user = queryOne('SELECT id, username, email, role FROM users WHERE id = ?', [userId]);
    return user || null;
  });

  // 注册模式：本地还没有任何账号 → 首个注册免验证码（自动成为管理员）
  ipcMain.handle('auth:registration-mode', () => {
    const countRow = queryOne('SELECT COUNT(*) AS c FROM users') as any;
    return { firstAccount: !countRow || Number(countRow.c) === 0 };
  });
}
