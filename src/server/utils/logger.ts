// 日志系统 — 服务端版，复用 src/shared/log-core（按天分文件 + 超限滚动 + 保留 7 天）
import path from 'path';
import { LogCore } from '../../shared/log-core';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'data', 'logs');

const core = new LogCore({ dir: LOG_DIR, scope: 'server', retainDays: 7 });

export const logger = {
  debug: (msg: string) => core.debug(msg),
  info: (msg: string) => core.info(msg),
  warn: (msg: string) => core.warn(msg),
  error: (msg: string, err?: Error) => core.error(msg, err),
  setLevel: (level: 'debug' | 'info' | 'warn' | 'error') => core.setLevel(level),
};
