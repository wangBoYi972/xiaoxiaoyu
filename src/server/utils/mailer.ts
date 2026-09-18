// 邮件发送 — Web 服务端版（QQ SMTP 验证码）
// SMTP 配置优先级：settings 表 → 环境变量 → 内置默认
// 注意：授权码属于机密，不写死在源码中（仓库会开源）。

import nodemailer from 'nodemailer';
import { queryOne } from '../store/database';
import { logger } from './logger';
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
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    return (row?.value as string) || '';
  } catch {
    return '';
  }
}

function pick(settingKey: string, envKey: string, fallback = ''): string {
  return (readSetting(settingKey) || process.env[envKey] || fallback).trim();
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
    throw new Error('服务端未配置发件邮箱：请设置 smtp_user（授权码绑定的 QQ 邮箱）');
  }
  if (!cfg.pass) {
    throw new Error('服务端未配置 SMTP 授权码：请设置 smtp_pass（QQ 邮箱设置中生成的授权码）');
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
