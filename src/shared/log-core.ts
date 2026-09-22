// 日志内核 — 桌面端(main) 与 Web 服务端(server) 共用
// 能力：级别过滤、按天分文件、单文件超限滚动、超期自动清理。
// 纯 Node 实现，不依赖 Electron。

import fs from 'fs';
import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  /** 日志目录 */
  dir: string;
  /** 文件前缀，如 app / server */
  scope?: string;
  /** 最低输出级别，默认读环境变量 LOG_LEVEL，再退回 info */
  level?: LogLevel;
  /** 单文件大小上限，超出后滚动为 xxx.1.log（默认 5MB） */
  maxFileBytes?: number;
  /** 保留天数（默认 7 天） */
  retainDays?: number;
  /** 是否同时输出到控制台（默认 NODE_ENV=development 时开启） */
  console?: boolean;
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 每小时清理一次

function resolveLevel(explicit?: LogLevel): LogLevel {
  const raw = (explicit || process.env.LOG_LEVEL || 'info').toLowerCase();
  return (['debug', 'info', 'warn', 'error'] as LogLevel[]).includes(raw as LogLevel)
    ? (raw as LogLevel)
    : 'info';
}

function localDay(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export class LogCore {
  private dir: string;
  private scope: string;
  private level: LogLevel;
  private maxFileBytes: number;
  private retainDays: number;
  private toConsole: boolean;
  private lastCleanupAt = 0;

  constructor(options: LoggerOptions) {
    this.dir = options.dir;
    this.scope = options.scope || 'app';
    this.level = resolveLevel(options.level);
    this.maxFileBytes = options.maxFileBytes ?? 5 * 1024 * 1024;
    this.retainDays = options.retainDays ?? 7;
    this.toConsole = options.console ?? process.env.NODE_ENV === 'development';
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string): void { this.write('debug', message); }
  info(message: string): void { this.write('info', message); }
  warn(message: string): void { this.write('warn', message); }

  error(message: string, error?: Error): void {
    const detail = error ? `: ${error.message}${error.stack ? `\n${error.stack}` : ''}` : '';
    this.write('error', message + detail);
  }

  // ============ 内部实现 ============

  private write(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;

    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;

    if (this.toConsole) {
      const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      out(line.trimEnd());
    }

    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(this.targetFile(line), line, 'utf-8');
    } catch {
      // 日志写失败不能影响主流程
    }

    this.maybeCleanup();
  }

  /** 计算当前应写入的文件：按天 + 超限滚动 */
  private targetFile(line: string): string {
    const base = path.join(this.dir, `${this.scope}-${localDay()}`);
    let candidate = `${base}.log`;

    for (let i = 1; i <= 20; i++) {
      let size = 0;
      try { size = fs.statSync(candidate).size; } catch { size = 0; }
      if (size + Buffer.byteLength(line, 'utf-8') <= this.maxFileBytes) return candidate;
      candidate = `${base}.${i}.log`;
    }
    return candidate; // 极端情况下落到最后一个分片
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;

    try {
      const cutoff = now - this.retainDays * 24 * 60 * 60 * 1000;
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.startsWith(`${this.scope}-`) || !name.includes('.log')) continue;
        const full = path.join(this.dir, name);
        try {
          if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
        } catch { /* 单个文件失败忽略 */ }
      }
    } catch { /* 目录不存在等情况忽略 */ }
  }
}
