import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

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
