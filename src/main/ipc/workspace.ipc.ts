import { ipcMain, dialog } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { approveWorkspace, revokeWorkspace } from './file.ipc';

// 文件监听用 Node 原生 fs.watch（逐目录监听）。Windows 的 recursive 模式会丢失
// 部分删除事件，所以不依赖它；每次目录结构变化后会补扫新增目录的监听器。

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface WorkspaceWatcher {
  directories: Map<string, fsSync.FSWatcher>;
  rescanTimer?: NodeJS.Timeout;
}

// 工作区 -> 目录监听器集合
const watchers = new Map<string, WorkspaceWatcher>();

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
  const state: WorkspaceWatcher = { directories: new Map() };
  watchers.set(workspacePath, state);

  const scheduleRescan = () => {
    if (state.rescanTimer) clearTimeout(state.rescanTimer);
    state.rescanTimer = setTimeout(() => {
      state.rescanTimer = undefined;
      if (sender.isDestroyed()) {
        stopWatcher(workspacePath);
        return;
      }
      attachDirectoryWatchers(workspacePath, workspacePath, sender, state, scheduleRescan);
      // 目录级事件在 Windows 上可能只给出父目录；通知渲染层刷新树保证最终一致。
      sender.send('workspace:file-changed', { type: 'refresh', path: workspacePath });
    }, 180);
  };

  attachDirectoryWatchers(workspacePath, workspacePath, sender, state, scheduleRescan);
  logger.info(`文件监听已启动: ${workspacePath}`);
}

function attachDirectoryWatchers(
  workspacePath: string,
  dirPath: string,
  sender: Electron.WebContents,
  state: WorkspaceWatcher,
  scheduleRescan: () => void,
): void {
  if (state.directories.has(dirPath)) return;
  let entries: fsSync.Dirent[];
  try {
    entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  try {
    const watcher = fsSync.watch(dirPath, { persistent: true }, (eventType, filename) => {
      if (sender.isDestroyed()) {
        stopWatcher(workspacePath);
        return;
      }
      const name = filename ? String(filename) : '';
      const parts = name.split(/[\\/]/).filter(Boolean);
      if (parts.some(shouldIgnore) || parts.some(p => p.endsWith('.tmp') || p.endsWith('~'))) return;

      const fullPath = name ? path.join(dirPath, name) : dirPath;
      try {
        const type = eventType === 'rename'
          ? (fsSync.existsSync(fullPath) ? 'add' : 'unlink')
          : 'change';
        sender.send('workspace:file-changed', { type, path: fullPath });
      } catch (e) {
        logger.error('文件变更通知失败:', e instanceof Error ? e : new Error(String(e)));
      }
      scheduleRescan();
    });
    watcher.on('error', (error: unknown) => {
      logger.error('文件监听错误:', error instanceof Error ? error : new Error(String(error)));
    });
    state.directories.set(dirPath, watcher);
  } catch (error) {
    logger.warn(`无法监听目录 ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !shouldIgnore(entry.name)) {
      attachDirectoryWatchers(workspacePath, path.join(dirPath, entry.name), sender, state, scheduleRescan);
    }
  }
}

// 停止所有监听器
function stopAllWatchers(): void {
  for (const workspacePath of watchers.keys()) stopWatcher(workspacePath);
}

function stopWatcher(workspacePath: string): void {
  const state = watchers.get(workspacePath);
  if (!state) return;
  if (state.rescanTimer) clearTimeout(state.rescanTimer);
  state.directories.forEach((watcher) => watcher.close());
  watchers.delete(workspacePath);
  logger.info(`文件监听已停止: ${workspacePath}`);
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
