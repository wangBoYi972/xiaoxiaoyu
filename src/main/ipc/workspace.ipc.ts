import { ipcMain, dialog } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { approveWorkspace, revokeWorkspace } from './file.ipc';

// 文件监听用 Node 原生 fs.watch（递归，Windows/macOS 均支持）。
// 不用 chokidar：chokidar 5 是纯 ESM，而 Electron 33 内置 Node 20 不支持
// require(esm)，打包后会在「打开工作区」时抛 ERR_REQUIRE_ESM（2026-09-18 线上踩过）。

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

// 文件监听器映射
const watchers = new Map<string, fsSync.FSWatcher>();

export function registerWorkspaceHandlers(): void {
  // 打开工作区
  ipcMain.handle('workspace:open', async (event) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择项目文件夹',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'cancelled' };
      }

      const workspacePath = result.filePaths[0];
      const workspaceName = path.basename(workspacePath);

      // 停止旧的监听器
      stopAllWatchers();

      // 授权工作区
      approveWorkspace(workspacePath);

      // 获取文件树
      const fileTree = await getFileTree(workspacePath);

      // 启动文件监听
      await startWatcher(workspacePath, event.sender);

      logger.info(`工作区已打开: ${workspacePath}`);

      return {
        success: true,
        workspace: {
          path: workspacePath,
          name: workspaceName,
          fileTree,
        },
      };
    } catch (error: any) {
      logger.error('打开工作区失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 关闭工作区
  ipcMain.handle('workspace:close', async (_event, workspacePath?: string) => {
    try {
      stopAllWatchers();

      // 撤销工作区授权
      if (workspacePath) {
        revokeWorkspace(workspacePath);
      }

      logger.info('工作区已关闭');
      return { success: true };
    } catch (error: any) {
      logger.error('关闭工作区失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取文件树
  ipcMain.handle('workspace:get-tree', async (_event, workspacePath: string) => {
    try {
      const fileTree = await getFileTree(workspacePath);
      return { success: true, fileTree };
    } catch (error: any) {
      logger.error('获取文件树失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 展开目录
  ipcMain.handle('workspace:expand-dir', async (_event, dirPath: string) => {
    try {
      const children = await getDirectoryChildren(dirPath);
      return { success: true, children };
    } catch (error: any) {
      logger.error('展开目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 刷新文件树
  ipcMain.handle('workspace:refresh', async (_event, workspacePath: string) => {
    try {
      const fileTree = await getFileTree(workspacePath);
      return { success: true, fileTree };
    } catch (error: any) {
      logger.error('刷新文件树失败:', error);
      return { success: false, error: error.message };
    }
  });
}

// 获取文件树（递归全量扫描，一次返回完整树，前端直接递归渲染）
// 深度 / 数量双上限，防止超大目录（如误开整个盘符）卡死主进程。
const MAX_TREE_DEPTH = 12;
const MAX_TREE_NODES = 6000;

async function getFileTree(rootPath: string): Promise<FileNode[]> {
  const counter = { total: 0 };
  return scanDirectory(rootPath, 0, counter);
}

async function scanDirectory(
  dirPath: string,
  depth: number,
  counter: { total: number },
): Promise<FileNode[]> {
  if (depth > MAX_TREE_DEPTH || counter.total >= MAX_TREE_NODES) return [];

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return []; // 权限不足 / 读取失败 → 跳过该目录
  }

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (counter.total >= MAX_TREE_NODES) break;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (shouldIgnore(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const children = await scanDirectory(fullPath, depth + 1, counter);
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        children,
      });
    } else {
      counter.total++;
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
      });
    }
  }

  // 排序: 目录在前,文件在后,同类按名称排序
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// 获取目录的子项(用于懒加载)
async function getDirectoryChildren(dirPath: string): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      nodes.push({
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        children: entry.isDirectory() ? [] : undefined,
      });
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return nodes;
  } catch (error) {
    logger.error('读取目录失败:', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

// 启动文件监听
async function startWatcher(workspacePath: string, sender: Electron.WebContents): Promise<void> {
  const watcher = fsSync.watch(
    workspacePath,
    { recursive: true, persistent: true },
    (eventType, filename) => {
      if (sender.isDestroyed()) {
        watcher.close();
        watchers.delete(workspacePath);
        return;
      }
      if (!filename) return;

      const parts = filename.split(/[\\/]/);
      // 忽略 node_modules / .git 等噪声目录，以及日志临时文件
      if (parts.some(shouldIgnore) || parts.some(p => p.endsWith('.tmp') || p.endsWith('~'))) return;

      const fullPath = path.join(workspacePath, filename);

      try {
        if (eventType === 'rename') {
          // rename 事件无法区分新增与删除，用存在性判断
          const type = fsSync.existsSync(fullPath) ? 'add' : 'unlink';
          sender.send('workspace:file-changed', { type, path: fullPath });
        } else {
          sender.send('workspace:file-changed', { type: 'change', path: fullPath });
        }
      } catch (e) {
        logger.error('文件变更通知失败:', e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  watcher.on('error', (error: unknown) => {
    logger.error('文件监听错误:', error instanceof Error ? error : new Error(String(error)));
  });

  watchers.set(workspacePath, watcher);
  logger.info(`文件监听已启动: ${workspacePath}`);
}

// 停止所有监听器
function stopAllWatchers(): void {
  watchers.forEach((watcher, path) => {
    watcher.close();
    logger.info(`文件监听已停止: ${path}`);
  });
  watchers.clear();
}

// 判断是否应该忽略
function shouldIgnore(name: string): boolean {
  const ignoreList = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'coverage',
    '.cache',
    'tmp',
  ];
  return ignoreList.includes(name);
}
