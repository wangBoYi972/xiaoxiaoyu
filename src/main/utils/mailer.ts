// 邮件发送 — 桌面端版（QQ SMTP 验证码）
// SMTP 配置优先级：settings 表 → 环境变量 → 打包内置（smtp-preset.local）→ 代码默认（host/port）
// 授权码属于机密，不写死在源码中：请在「设置 → 邮件服务」填写，或通过 auth:set-smtp 写入。
//
// 「打包内置」是给**分发包**用的：别人装完，本机 settings 表是空的，注册发不出验证码。
// 打包时注入 smtp-preset.local.ts（该文件已 gitignore，绝不入库），注册验证码就能用内置邮箱发出。
// 用户自己在设置里配过 SMTP 时，优先用他自己的。
import nodemailer from 'nodemailer';
import { getDatabase } from '../store/database';
import { logger } from '../utils/logger';
import { renderVerificationMail, type MailPurpose } from '../../shared/mail-template';
import { maskEmail } from '../../shared/email-code';

const DEFAULT_SMTP_HOST = 'smtp.qq.com';
const DEFAULT_SMTP_PORT = 465; // SSL
const CODE_TTL_MINUTES = 10;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
}

function readSetting(key: string): string {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);
    let value = '';
    if (stmt.step()) value = (stmt.getAsObject().value as string) || '';
    stmt.free();
    return value;
  } catch {
    return '';
  }
}

/**
 * 打包内置配置（分发包专用）。
 * 用 require 而不是 import：这样即使文件不存在（比如刚 clone 下来还没注入）
 * 也只是在运行时拿到空对象，不会让 tsc / 打包直接崩掉。
 */
const PRESET: Record<string, string> = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('./smtp-preset.local');
    const p = (m && m.SMTP_PRESET) || {};
    return {
      smtp_host: String(p.host || ''),
      smtp_port: String(p.port || ''),
      smtp_user: String(p.user || ''),
      smtp_pass: String(p.pass || ''),
    };
  } catch {
    return { smtp_host: '', smtp_port: '', smtp_user: '', smtp_pass: '' };
  }
})();

/** settings 表 → 环境变量 → 打包内置 → 代码默认 */
function pick(settingKey: string, envKey: string, fallback = ''): string {
  return (readSetting(settingKey) || process.env[envKey] || PRESET[settingKey] || fallback).trim();
}

export function getSmtpConfig(): SmtpConfig {
  return {
    host: pick('smtp_host', 'SMTP_HOST', DEFAULT_SMTP_HOST),
    port: parseInt(pick('smtp_port', 'SMTP_PORT'), 10) || DEFAULT_SMTP_PORT,
    user: pick('smtp_user', 'SMTP_USER'),
    pass: pick('smtp_pass', 'SMTP_PASS'),
    fromName: pick('smtp_from_name', 'SMTP_FROM_NAME', '小小榆'),
  };
}

/** 发件邮箱与授权码都已配置才认为可用 */
export function isSmtpConfigured(): boolean {
  const { user, pass } = getSmtpConfig();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) && !!pass;
}

/** 发送验证码邮件；未配置时抛出可读错误 */
export async function sendVerificationMail(to: string, code: string, purpose: MailPurpose): Promise<void> {
  const cfg = getSmtpConfig();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.user)) {
    throw new Error('发件邮箱未配置：请在设置中填写 smtp_user（授权码绑定的 QQ 邮箱）');
  }
  if (!cfg.pass) {
    throw new Error('SMTP 授权码未配置：请在设置中填写 smtp_pass（QQ 邮箱生成的授权码）');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const { subject, text, html } = renderVerificationMail(code, purpose, CODE_TTL_MINUTES);

  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.user}>`,
    to,
    subject,
    text,
    html,
  });

  logger.info(`验证码邮件已发送: ${maskEmail(to)} (${purpose === 'register' ? '注册' : '重置密码'})`);
}
