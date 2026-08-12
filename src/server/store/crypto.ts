// 加密工具 — 环境变量强制或数据库随机密钥
import crypto from 'crypto';
import os from 'os';

let _derivedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (_derivedKey) return _derivedKey;

  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    _derivedKey = crypto.createHash('sha256').update(envKey).digest();
    return _derivedKey;
  }

  // 从 DB 读取持久化的密钥
  try {
    const { queryOne, execute } = require('./database');
    const existing = queryOne("SELECT value FROM settings WHERE key = 'encryption_key'");
    if (existing?.value) {
      // 统一使用 SHA256 哈希派生密钥（与创建时保持一致，修复重启后解密失败问题）
      _derivedKey = crypto.createHash('sha256').update(existing.value).digest();
      return _derivedKey;
    }
    // 首次启动：生成随机密钥持久化到 DB
    const randKey = crypto.randomBytes(32);
    const randKeyB64 = randKey.toString('base64');
    execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('encryption_key', ?)",
      [randKeyB64]
    );
    // 使用 base64 字符串的 SHA256 哈希作为派生密钥（与读取时保持一致）
    _derivedKey = crypto.createHash('sha256').update(randKeyB64).digest();
    return _derivedKey;
  } catch {
    // DB 不可用时：生成临时密钥（⚠ 服务重启后旧加密数据将无法解密）
    const tempKey = crypto.randomBytes(32).toString('base64');
    _derivedKey = crypto.createHash('sha256').update(tempKey).digest();
    return _derivedKey;
  }
}

const ALGORITHM = 'aes-256-gcm';

export function encryptApiKey(plainText: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptApiKey(encryptedText: string): string {
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
