// Ollama 生命周期服务 —— 从 main/index.ts 与 ipc/ollama.ipc.ts 抽出的唯一实现
// 职责：检测安装 → 启动服务 → 准备模型（安装包导入优先，失败再网络下载）
// 事件通过 emit 回调外发，服务本身不依赖 window / ipcMain，便于复用与测试。
import {
  isOllamaInstalled, checkOllamaRunning, startOllamaServe,
  pullModel, hasModel, DEFAULT_MODEL,
  importModelFromBundle, getBundledModelPath, openOllamaDownloadPage,
} from '../ollama/ollama-launcher';
import { logger } from '../utils/logger';

export interface OllamaProgressState {
  active: boolean;
  stage: string;
  message: string;
  percent: number;
  done: boolean;
  modelReady: boolean;
}

/** 全局进度状态（IPC 查询与 UI 提示共用同一份） */
export const ollamaProgress: OllamaProgressState = {
  active: false,
  stage: '',
  message: '',
  percent: 0,
  done: false,
  modelReady: false,
};

export function updateOllamaProgress(update: Partial<OllamaProgressState>): void {
  Object.assign(ollamaProgress, update);
  invalidateOllamaStatusCache(); // 状态有变化，缓存作废
}

// ===== 状态查询（带短 TTL 缓存） =====
// ollama:status 会被登录页/设置页轮询，每次都打两次 /api/tags 没必要；
// 2 秒内复用同一结果，安装/启动/拉模型等关键节点主动失效。
const STATUS_TTL_MS = 2000;
let statusCache: { at: number; value: OllamaStatus } | null = null;

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  modelReady: boolean;
  defaultModel: string;
  inProgress: boolean;
  stage?: string;
  message?: string;
  percent?: number;
}

export function invalidateOllamaStatusCache(): void {
  statusCache = null;
}

export async function getOllamaStatus(force = false): Promise<OllamaStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return statusCache.value;
  }

  const installed = isOllamaInstalled();
  const running = installed ? await checkOllamaRunning() : false;
  const modelReady = running ? await hasModel(DEFAULT_MODEL) : false;

  const value: OllamaStatus = ollamaProgress.active
    ? {
      installed, running, modelReady, defaultModel: DEFAULT_MODEL, inProgress: true,
      stage: ollamaProgress.stage,
      message: ollamaProgress.message,
      percent: ollamaProgress.percent,
    }
    : { installed, running, modelReady, defaultModel: DEFAULT_MODEL, inProgress: false };

  statusCache = { at: Date.now(), value };
  return value;
}

/** 事件外发口：main/index.ts 推到窗口，ipc/ollama.ipc.ts 推到 event.sender */
export interface OllamaEmitter {
  progress(payload: { stage: string; message: string; percent?: number }): void;
  status(payload: Record<string, unknown>): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 后台自动初始化（不阻塞启动）：
 * 已安装 → 启动服务 → 模型就绪检查 → 安装包导入 or 网络下载
 */
export async function initializeOllamaInBackground(emit: OllamaEmitter, delayMs = 3000): Promise<void> {
  await sleep(delayMs);
  try {
    // 1. 检查 Ollama — 不自动安装，让用户装（GitHub 国内下不动）
    if (!isOllamaInstalled()) {
      logger.info('Ollama 未安装');
      updateOllamaProgress({ active: false });
      emit.status({ installed: false, running: false, modelReady: false });
      return; // renderer 会显示"需要安装 Ollama"引导
    }

    // 2. 启动服务
    if (!(await checkOllamaRunning())) {
      logger.info('启动 Ollama 服务...');
      updateOllamaProgress({ stage: 'starting', message: '正在启动 Ollama 服务...' });
      emit.progress({ stage: 'starting', message: '正在启动 Ollama 服务...' });
      startOllamaServe();
      for (let i = 0; i < 20; i++) {
        await sleep(2000);
        if (await checkOllamaRunning()) break;
      }
    }

    const running = await checkOllamaRunning();
    if (!running) {
      updateOllamaProgress({ active: false });
      emit.status({ installed: true, running: false, modelReady: false });
      return;
    }

    logger.info('Ollama 服务已就绪');
    emit.status({ installed: true, running: true, modelReady: false });

    // 3. 获取模型 — 优先从安装包导入，失败再网络下载
    const modelReady = await ensureModel(emit);
    if (!modelReady) {
      updateOllamaProgress({ active: false });
      emit.status({ installed: true, running: true, modelReady: false });
      return;
    }

    updateOllamaProgress({ active: false, done: true, modelReady: true, percent: 100 });
    emit.status({ installed: true, running: true, modelReady: true, defaultModel: DEFAULT_MODEL });
    logger.info('Ollama 初始化完成');
  } catch (e) {
    updateOllamaProgress({ active: false });
    logger.error('Ollama 初始化失败', e as Error);
  }
}

/** 用户手动触发的初始化（设置页「一键安装/准备模型」） */
export async function runOllamaSetup(emit: OllamaEmitter): Promise<{ ok: boolean; error?: string; model?: string }> {
  ollamaProgress.active = true;
  try {
    if (!isOllamaInstalled()) {
      ollamaProgress.active = false;
      openOllamaDownloadPage();
      return { ok: false, error: '请先安装 Ollama，已为您打开下载页面' };
    }

    if (!(await checkOllamaRunning())) {
      ollamaProgress.stage = 'starting';
      ollamaProgress.message = '正在启动...';
      emit.progress({ stage: 'starting', message: '正在启动...' });
      startOllamaServe();
      for (let i = 0; i < 15; i++) { await sleep(2000); if (await checkOllamaRunning()) break; }
    }

    if (!(await hasModel(DEFAULT_MODEL))) {
      const ready = await ensureModel(emit);
      if (!ready) {
        ollamaProgress.active = false;
        return { ok: false, error: '模型准备失败' };
      }
    }

    ollamaProgress.active = false;
    ollamaProgress.done = true;
    ollamaProgress.modelReady = true;
    ollamaProgress.percent = 100;
    emit.status({ installed: true, running: true, modelReady: true, defaultModel: DEFAULT_MODEL });
    return { ok: true, model: DEFAULT_MODEL };
  } catch (e: any) {
    ollamaProgress.active = false;
    return { ok: false, error: e.message };
  }
}

/**
 * 确保模型就绪：安装包内置模型优先（快、免流量），否则网络拉取。
 * 返回是否成功。
 */
async function ensureModel(emit: OllamaEmitter): Promise<boolean> {
  if (await hasModel(DEFAULT_MODEL)) return true;

  const bundledPath = getBundledModelPath();
  if (bundledPath) {
    logger.info(`从安装包导入模型: ${bundledPath}`);
    const msg = '正在从安装包导入 AI 模型...';
    updateOllamaProgress({ stage: 'importing', message: msg, percent: 0 });
    emit.progress({ stage: 'importing', message: msg, percent: 0 });

    const imported = await importModelFromBundle((m, percent) => {
      updateOllamaProgress({ stage: 'importing', message: m, percent });
      emit.progress({ stage: 'importing', message: m, percent });
    });
    if (imported) return true;
  }

  logger.info(`内置模型不可用，从网络下载 ${DEFAULT_MODEL}...`);
  const pulling = `正在下载 ${DEFAULT_MODEL} 模型（约400MB）...`;
  updateOllamaProgress({ stage: 'pulling', message: pulling, percent: 0 });
  emit.progress({ stage: 'pulling', message: pulling, percent: 0 });

  await pullModel(DEFAULT_MODEL, (p) => {
    updateOllamaProgress({ stage: 'pulling', message: p.status, percent: p.percent });
    emit.progress({ stage: 'pulling', message: p.status, percent: p.percent });
  });

  return await hasModel(DEFAULT_MODEL);
}
