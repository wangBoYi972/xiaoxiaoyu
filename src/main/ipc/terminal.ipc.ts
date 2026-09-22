import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { isWorkspaceApproved } from './file.ipc';
import { logger } from '../utils/logger';

interface TerminalSession {
  id: string;
  ownerId: number;
  process: pty.IPty;
}

const sessions = new Map<string, TerminalSession>();
let sessionSequence = 0;

function stopSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try { session.process.kill(); } catch { /* 进程已退出 */ }
}

function shellConfig(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  return { file: process.env.SHELL || '/bin/bash', args: ['-l'] };
}

/**
 * 真实交互终端：由 node-pty 持有 shell，渲染层只负责 xterm 显示与输入。
 * 每个会话绑定创建它的 webContents，避免其他窗口跨会话读写命令。
 */
export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (event, data: { cwd?: string; cols?: number; rows?: number }) => {
    const cwd = typeof data?.cwd === 'string' ? data.cwd : '';
    if (!cwd || !isWorkspaceApproved(cwd)) {
      return { success: false, error: '请先通过「打开项目目录」授权终端工作目录' };
    }

    const cols = Math.max(20, Math.min(500, Math.floor(data?.cols || 120)));
    const rows = Math.max(4, Math.min(300, Math.floor(data?.rows || 24)));
    const shell = shellConfig();
    const id = `term_${Date.now().toString(36)}_${(++sessionSequence).toString(36)}`;

    try {
      const ptyProcess = pty.spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
        useConpty: process.platform === 'win32',
      });
      const session: TerminalSession = { id, ownerId: event.sender.id, process: ptyProcess };
      sessions.set(id, session);

      ptyProcess.onData((chunk) => {
        if (!event.sender.isDestroyed()) event.sender.send('terminal:data', { id, data: chunk });
      });
      ptyProcess.onExit(({ exitCode }) => {
        if (sessions.get(id) === session) sessions.delete(id);
        if (!event.sender.isDestroyed()) event.sender.send('terminal:exit', { id, exitCode });
      });
      event.sender.once('destroyed', () => stopSession(id));
      return { success: true, id, shell: shell.file };
    } catch (error: any) {
      logger.error('[terminal] 创建失败:', error);
      return { success: false, error: error?.message || '无法启动系统终端' };
    }
  });

  ipcMain.on('terminal:write', (event, data: { id?: string; data?: string }) => {
    const session = data?.id ? sessions.get(data.id) : undefined;
    if (!session || session.ownerId !== event.sender.id || typeof data.data !== 'string') return;
    try { session.process.write(data.data.slice(0, 64 * 1024)); } catch { /* 会话已关闭 */ }
  });

  ipcMain.on('terminal:resize', (event, data: { id?: string; cols?: number; rows?: number }) => {
    const session = data?.id ? sessions.get(data.id) : undefined;
    if (!session || session.ownerId !== event.sender.id) return;
    const cols = Math.max(20, Math.min(500, Math.floor(data.cols || 120)));
    const rows = Math.max(4, Math.min(300, Math.floor(data.rows || 24)));
    try { session.process.resize(cols, rows); } catch { /* 会话已关闭 */ }
  });

  ipcMain.on('terminal:close', (event, id: string) => {
    const session = sessions.get(id);
    if (session?.ownerId === event.sender.id) stopSession(id);
  });
}
