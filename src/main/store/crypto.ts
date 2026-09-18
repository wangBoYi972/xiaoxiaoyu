// API Key 加密存储（桌面端）
// 优先使用 Electron safeStorage（Windows DPAPI / macOS Keychain / Linux libsecret），
// 不可用时回退到本地密钥文件的 AES-256-GCM。
// 两种格式通过前缀区分，逐值判断 → 老数据无需迁移即可继续解密。
import crypto from 'crypto';
import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const SAFE_PREFIX = 'safe:';
const ALGORITHM = 'aes-256-gcm';

function canUseSafeStorage(): boolean {
  try {
    if (!app?.isReady?.()) return false;
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

// ============ 回退方案：本地密钥文件 + AES-256-GCM ============

function deriveKey(): Buffer {
  const configDir = app.getPath('userData');
  const keyFile = path.join(configDir, '.encryption-key');

  try {
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile);
      return crypto.createHash('sha256').update(existing).digest();
    }
  } catch {}

  // 首次启动：生成随机密钥
  const randKey = crypto.randomBytes(32);
  try { fs.writeFileSync(keyFile, randKey, { mode: 0o600 }); } catch {}
  return crypto.createHash('sha256').update(randKey).digest();
}

function encryptWithAes(plainText: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptWithAes(encryptedText: string): string {
  try {
    const key = deriveKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

// ============ 对外 API ============

export function encryptApiKey(plainText: string): string {
  if (canUseSafeStorage()) {
    try {
      return SAFE_PREFIX + safeStorage.encryptString(plainText).toString('base64');
    } catch (e) {
      logger.warn('safeStorage 加密失败，回退 AES 方案');
    }
  }
  return encryptWithAes(plainText);
}

export function decryptApiKey(encryptedText: string): string {
  if (!encryptedText) return '';

  if (encryptedText.startsWith(SAFE_PREFIX)) {
    // 系统凭据链加密的密文：换了机器/用户名会解不开（属预期）
    try {
      return safeStorage.decryptString(Buffer.from(encryptedText.slice(SAFE_PREFIX.length), 'base64'));
    } catch {
      logger.warn('safeStorage 解密失败（可能更换了系统账户或机器），请重新填写 API Key');
      return '';
    }
  }

  return decryptWithAes(encryptedText);
}

/** 当前是否在用系统级加密（供设置页提示） */
export function isUsingSystemKeychain(): boolean {
  return canUseSafeStorage();
}
