// 日志系统 — 从 main/utils/logger.ts 适配，移除 Electron 依赖
import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// 确保目录存在
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function write(level: string, message: string): void {
  const line = `[${formatTime()}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {}
  // 同时输出到控制台
  if (level === 'ERROR') {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
}

export const logger = {
  info(msg: string): void { write('INFO', msg); },
  warn(msg: string): void { write('WARN', msg); },
  error(msg: string, err?: Error): void {
    const errMsg = err ? ` — ${err.message}\n${err.stack || ''}` : '';
    write('ERROR', msg + errMsg);
  },
};
