import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

// 记录通过对话框选中的文件，用于 file:read 权限校验
const approvedFiles = new Set<string>();
// 工作区路径白名单(打开工作区后自动添加)
const approvedWorkspaces = new Set<string>();
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

// 检查路径是否在已授权的工作区内
function isInWorkspace(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  for (const workspace of approvedWorkspaces) {
    if (resolved.startsWith(workspace)) return true;
  }
  return false;
}

// 供 Agent 工具校验工作区是否已授权
export function isWorkspaceApproved(workspacePath: string): boolean {
  return isInWorkspace(workspacePath);
}

// 添加工作区到白名单
export function approveWorkspace(workspacePath: string): void {
  approvedWorkspaces.add(path.resolve(workspacePath));
  logger.info(`工作区已授权: ${workspacePath}`);
}

// 移除工作区白名单
export function revokeWorkspace(workspacePath: string): void {
  approvedWorkspaces.delete(path.resolve(workspacePath));
  logger.info(`工作区授权已撤销: ${workspacePath}`);
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

    // 检查是否在工作区内或已授权
    if (!approvedFiles.has(resolved) && !isInWorkspace(resolved)) {
      throw new Error('文件未授权访问，请通过文件对话框选择或打开工作区');
    }

    // 安全检查
    if (!isPathSafe(filePath)) {
      throw new Error('文件路径不安全');
    }

    const data = fsSync.readFileSync(filePath);
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

  // 读取文件内容(文本)
  ipcMain.handle('file:read-text', async (_event, filePath: string) => {
    try {
      const resolved = path.resolve(filePath);

      // 检查权限
      if (!isInWorkspace(resolved) && !approvedFiles.has(resolved)) {
        throw new Error('文件未授权访问');
      }

      if (!isPathSafe(filePath)) {
        throw new Error('文件路径不安全');
      }

      const content = await fs.readFile(resolved, 'utf-8');
      return { success: true, content, path: resolved };
    } catch (error: any) {
      logger.error('读取文件失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 写入文件
  ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    try {
      const resolved = path.resolve(filePath);

      // 必须在工作区内
      if (!isInWorkspace(resolved)) {
        throw new Error('只能写入工作区内的文件');
      }

      if (!isPathSafe(filePath)) {
        throw new Error('文件路径不安全');
      }

      // 确保目录存在
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      // 写入文件
      await fs.writeFile(resolved, content, 'utf-8');

      logger.info(`文件已写入: ${resolved}`);
      return { success: true, path: resolved };
    } catch (error: any) {
      logger.error('写入文件失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 列出目录内容
  ipcMain.handle('file:list-dir', async (_event, dirPath: string) => {
    try {
      const resolved = path.resolve(dirPath);

      if (!isInWorkspace(resolved)) {
        throw new Error('只能访问工作区内的目录');
      }

      if (!isPathSafe(dirPath)) {
        throw new Error('目录路径不安全');
      }

      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const files = entries.map(entry => ({
        name: entry.name,
        path: path.join(resolved, entry.name),
        type: entry.isDirectory() ? 'directory' : 'file',
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));

      return { success: true, files };
    } catch (error: any) {
      logger.error('列出目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 搜索文件
  ipcMain.handle('file:search', async (_event, workspacePath: string, query: string, filePattern?: string) => {
    try {
      const resolved = path.resolve(workspacePath);

      if (!isInWorkspace(resolved)) {
        throw new Error('只能搜索工作区内的文件');
      }

      // 使用简单的文件名搜索(生产环境应使用 ripgrep)
      const results: Array<{ path: string; name: string; line?: number; content?: string }> = [];

      async function searchDir(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          // 跳过忽略的目录
          if (entry.name === 'node_modules' || entry.name === '.git') continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await searchDir(fullPath);
          } else {
            // 文件名匹配
            if (entry.name.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                path: fullPath,
                name: entry.name,
              });
            }

            // 如果指定了文件模式,还搜索内容
            if (filePattern && entry.name.match(new RegExp(filePattern))) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                  if (line.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                      path: fullPath,
                      name: entry.name,
                      line: index + 1,
                      content: line.trim(),
                    });
                  }
                });
              } catch {
                // 忽略二进制文件
              }
            }
          }
        }
      }

      await searchDir(resolved);

      return { success: true, results: results.slice(0, 100) }; // 限制结果数量
    } catch (error: any) {
      logger.error('搜索文件失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取 Git 状态
  ipcMain.handle('file:get-git-status', async (_event, filePath: string) => {
    try {
      const resolved = path.resolve(filePath);

      if (!isInWorkspace(resolved)) {
        throw new Error('只能获取工作区内文件的 Git 状态');
      }

      // 检查是否在 Git 仓库中
      const gitDir = path.dirname(resolved);

      try {
        const status = execSync(`git status --porcelain "${resolved}"`, {
          cwd: gitDir,
          encoding: 'utf-8',
        }).trim();

        let gitStatus: 'modified' | 'added' | 'deleted' | 'untracked' | null = null;

        if (status.startsWith('M ')) gitStatus = 'modified';
        else if (status.startsWith('A ')) gitStatus = 'added';
        else if (status.startsWith('D ')) gitStatus = 'deleted';
        else if (status.startsWith('??')) gitStatus = 'untracked';

        return { success: true, status: gitStatus };
      } catch {
        // 不在 Git 仓库中或文件未变更
        return { success: true, status: null };
      }
    } catch (error: any) {
      logger.error('获取 Git 状态失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取文件 Diff
  ipcMain.handle('file:get-diff', async (_event, filePath: string) => {
    try {
      const resolved = path.resolve(filePath);

      if (!isInWorkspace(resolved)) {
        throw new Error('只能获取工作区内文件的 Diff');
      }

      const gitDir = path.dirname(resolved);

      try {
        const diff = execSync(`git diff "${resolved}"`, {
          cwd: gitDir,
          encoding: 'utf-8',
        });

        return { success: true, diff };
      } catch {
        return { success: true, diff: '' };
      }
    } catch (error: any) {
      logger.error('获取 Diff 失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 删除文件
  ipcMain.handle('file:delete', async (_event, filePath: string) => {
    try {
      const resolved = path.resolve(filePath);

      if (!isInWorkspace(resolved)) {
        throw new Error('只能删除工作区内的文件');
      }

      if (!isPathSafe(filePath)) {
        throw new Error('文件路径不安全');
      }

      const stat = await fs.stat(resolved);

      if (stat.isDirectory()) {
        await fs.rm(resolved, { recursive: true });
      } else {
        await fs.unlink(resolved);
      }

      logger.info(`文件已删除: ${resolved}`);
      return { success: true };
    } catch (error: any) {
      logger.error('删除文件失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 重命名/移动文件
  ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      const resolvedOld = path.resolve(oldPath);
      const resolvedNew = path.resolve(newPath);

      if (!isInWorkspace(resolvedOld) || !isInWorkspace(resolvedNew)) {
        throw new Error('只能操作工作区内的文件');
      }

      if (!isPathSafe(oldPath) || !isPathSafe(newPath)) {
        throw new Error('文件路径不安全');
      }

      await fs.rename(resolvedOld, resolvedNew);

      logger.info(`文件已重命名: ${resolvedOld} -> ${resolvedNew}`);
      return { success: true };
    } catch (error: any) {
      logger.error('重命名文件失败:', error);
      return { success: false, error: error.message };
    }
  });
}
