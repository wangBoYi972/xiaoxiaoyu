import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

class Logger {
  private logPath: string;

  constructor() {
    const userDataPath = app?.getPath('userData') || process.cwd();
    this.logPath = path.join(userDataPath, 'app.log');
  }

  private write(level: string, message: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}\n`;
    try {
      fs.appendFileSync(this.logPath, line);
    } catch {
      // 忽略日志写入失败
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(line.trim());
    }
  }

  info(message: string) {
    this.write('INFO', message);
  }

  warn(message: string) {
    this.write('WARN', message);
  }

  error(message: string, error?: Error) {
    const errMsg = error ? `${message}: ${error.message}\n${error.stack}` : message;
    this.write('ERROR', errMsg);
  }
}

export const logger = new Logger();
