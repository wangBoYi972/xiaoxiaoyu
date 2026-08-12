import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import path from 'path';

// 记录通过对话框选中的文件，用于 file:read 权限校验
const approvedFiles = new Set<string>();
// 10分钟后自动清除
setInterval(() => approvedFiles.clear(), 600000);

function isPathSafe(filePath: string): boolean {
  // 禁止读取系统敏感目录
  const resolved = path.resolve(filePath);
  const forbidden = [
    '/etc', '/sys', '/proc', '/dev',
    'C:\\Windows', 'C:\\windows',
    'C:\\Windows\\System32', 'C:\\windows\\system32',
    '/System', '/Library',
  ];
  for (const prefix of forbidden) {
    if (resolved.toLowerCase().startsWith(prefix.toLowerCase())) return false;
  }
  // 禁止路径穿越
  if (filePath.includes('..')) return false;
  return true;
}

export function registerFileHandlers(): void {
  ipcMain.handle('file:open-dialog', async (event, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return [];

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters || [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: '文档', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
      ],
    });

    // 标记选中文件为已授权
    if (!result.canceled) {
      for (const fp of result.filePaths) {
        approvedFiles.add(path.resolve(fp));
      }
    }

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    const resolved = path.resolve(filePath);

    // 必须是已通过对话框选中的文件
    if (!approvedFiles.has(resolved)) {
      throw new Error('文件未授权访问，请通过文件对话框选择');
    }

    // 安全检查
    if (!isPathSafe(filePath)) {
      throw new Error('文件路径不安全');
    }

    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
    };

    return {
      data: data.toString('base64'),
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      name: path.basename(filePath),
    };
  });
}
