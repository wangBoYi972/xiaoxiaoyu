// Ollama 本地模型启动管理 — 精简版
// 策略：不替用户装 Ollama（GitHub 国内下载不动），只检测+启动+下模型
// 支持从安装包内置资源导入模型（零网络依赖）
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { shell, app } from 'electron';
import { logger } from '../utils/logger';

const OLLAMA_PORT = 11434;
const DEFAULT_MODEL = 'qwen2.5:0.5b';
const OLLAMA_API = `http://127.0.0.1:${OLLAMA_PORT}`;

export function getOllamaExePath(): string {
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    'ollama.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function isOllamaInstalled(): boolean {
  return fs.existsSync(getOllamaExePath());
}

export async function checkOllamaRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_API}/api/tags`, (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

export function startOllamaServe(): void {
  const exe = getOllamaExePath();
  logger.info(`启动 Ollama: ${exe}`);
  spawn(exe, ['serve'], { detached: true, stdio: 'ignore' }).unref();
}

export function openOllamaDownloadPage(): void {
  shell.openExternal('https://ollama.com/download/windows');
}

export interface PullProgress {
  status: string; percent: number; total?: number; completed?: number;
}

export async function pullModel(
  model: string, onProgress: (p: PullProgress) => void
): Promise<boolean> {
  const exe = getOllamaExePath();
  logger.info(`下载模型: ${model}`);
  return new Promise((resolve) => {
    const proc = spawn(exe, ['pull', model]);
    let buffer = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        try {
          const data = JSON.parse(line.trim());
          if (data.status) {
            onProgress({
              status: data.status,
              percent: data.completed && data.total ? Math.round((data.completed / data.total) * 100) : data.percent || 0,
              total: data.total, completed: data.completed,
            });
          }
        } catch {}
      }
    });
    proc.on('close', (code) => { logger.info(`模型下载完成, exit=${code}`); resolve(code === 0); });
    proc.on('error', (e) => { logger.error('模型下载失败', e); resolve(false); });
  });
}

export async function hasModel(model: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_API}/api/tags`, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => data += c.toString());
      res.on('end', () => {
        try {
          const models = JSON.parse(data).models || [];
          resolve(models.some((m: any) => m.name.startsWith(model)));
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

/** 获取安装包内置模型文件的路径 */
export function getBundledModelPath(): string | null {
  // 生产环境：extraResources 映射到 resources/models/
  // 开发环境：项目根目录 resources/models/
  const candidates = [
    path.join(process.resourcesPath || '', 'models', 'qwen2.5-0.5b'),
    // 开发模式下 resourcesPath 可能指向 node_modules/electron/dist
    path.join(app.getAppPath(), '..', 'resources', 'models', 'qwen2.5-0.5b'),
    path.join(app.getAppPath(), 'resources', 'models', 'qwen2.5-0.5b'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 递归复制目录 */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 从安装包内置资源导入模型到 Ollama
 * 复制 blobs/ 和 manifests/ 到 Ollama 的 models 目录
 * 这是纯本地操作，不需要网络
 */
export async function importModelFromBundle(
  onProgress?: (msg: string, percent: number) => void
): Promise<boolean> {
  const bundledPath = getBundledModelPath();
  if (!bundledPath) {
    logger.info('未找到内置模型文件，跳过本地导入');
    return false;
  }

  const ollamaHome = process.env.OLLAMA_MODELS
    || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', '.ollama', 'models');

  logger.info(`从 ${bundledPath} 导入模型到 ${ollamaHome}`);

  try {
    onProgress?.('正在从安装包导入 AI 模型...', 10);

    // 复制 blobs
    const srcBlobs = path.join(bundledPath, 'blobs');
    if (fs.existsSync(srcBlobs)) {
      const destBlobs = path.join(ollamaHome, 'blobs');
      onProgress?.('正在导入模型权重文件...', 30);
      copyDir(srcBlobs, destBlobs);
    }

    onProgress?.('正在导入模型配置...', 70);

    // 复制 manifests
    const srcManifests = path.join(bundledPath, 'manifests');
    if (fs.existsSync(srcManifests)) {
      const destManifests = path.join(ollamaHome, 'manifests');
      copyDir(srcManifests, destManifests);
    }

    onProgress?.('模型导入完成', 100);

    // 验证模型是否出现
    await new Promise(r => setTimeout(r, 2000));
    const ready = await hasModel(DEFAULT_MODEL);
    logger.info(`模型导入${ready ? '成功' : '失败'}: ${DEFAULT_MODEL}`);
    return ready;
  } catch (e) {
    logger.error('模型导入失败', e as Error);
    return false;
  }
}

export { DEFAULT_MODEL, OLLAMA_API };
