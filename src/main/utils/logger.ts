import path from 'path';
import { app } from 'electron';
import { LogCore } from '../../shared/log-core';

// 日志目录：%APPDATA%\<app>\logs（app 未就绪时退回 cwd/logs）
function resolveLogDir(): string {
  try {
    const userData = app?.getPath?.('userData');
    if (userData) return path.join(userData, 'logs');
  } catch { /* app 尚未就绪 */ }
  return path.join(process.cwd(), 'logs');
}

const core = new LogCore({ dir: resolveLogDir(), scope: 'app', retainDays: 7 });

export const logger = {
  debug: (message: string) => core.debug(message),
  info: (message: string) => core.info(message),
  warn: (message: string) => core.warn(message),
  error: (message: string, error?: Error) => core.error(message, error),
  setLevel: (level: 'debug' | 'info' | 'warn' | 'error') => core.setLevel(level),
};
