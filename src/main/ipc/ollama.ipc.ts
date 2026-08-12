// Ollama IPC 处理 + 全局进度状态
import { ipcMain } from 'electron';
import {
  checkOllamaRunning, startOllamaServe,
  pullModel, hasModel, isOllamaInstalled, DEFAULT_MODEL,
  importModelFromBundle, getBundledModelPath,
  openOllamaDownloadPage,
} from '../ollama/ollama-launcher';

const progressState: any = { active: false, stage: '', message: '', percent: 0, done: false, modelReady: false };

export function updateOllamaProgress(update: Partial<typeof progressState>) {
  Object.assign(progressState, update);
}

export function registerOllamaHandlers(): void {

  ipcMain.handle('ollama:status', async () => {
    const installed = isOllamaInstalled();
    const running = installed ? await checkOllamaRunning() : false;
    const modelReady = running ? await hasModel(DEFAULT_MODEL) : false;
    if (progressState.active) {
      return { installed, running, modelReady, defaultModel: DEFAULT_MODEL, inProgress: true, stage: progressState.stage, message: progressState.message, percent: progressState.percent };
    }
    return { installed, running, modelReady, defaultModel: DEFAULT_MODEL, inProgress: false };
  });

  ipcMain.handle('ollama:setup', async (event) => {
    progressState.active = true;
    try {
      if (!isOllamaInstalled()) {
        progressState.active = false;
        openOllamaDownloadPage();
        return { ok: false, error: '请先安装 Ollama，已为您打开下载页面' };
      }

      if (!(await checkOllamaRunning())) {
        progressState.stage = 'starting'; progressState.message = '正在启动...';
        event.sender.send('ollama:progress', { stage: 'starting', message: '正在启动...' });
        startOllamaServe();
        for (let i = 0; i < 15; i++) { await sleep(2000); if (await checkOllamaRunning()) break; }
      }

      if (!(await hasModel(DEFAULT_MODEL))) {
        // 优先从安装包导入
        const bundledPath = getBundledModelPath();
        let modelOk = false;
        if (bundledPath) {
          progressState.stage = 'importing'; progressState.message = '正在从安装包导入 AI 模型...'; progressState.percent = 0;
          event.sender.send('ollama:progress', { stage: 'importing', message: progressState.message, percent: 0 });
          modelOk = await importModelFromBundle((msg, percent) => {
            progressState.message = msg; progressState.percent = percent;
            event.sender.send('ollama:progress', { stage: 'importing', message: msg, percent });
          });
        }
        // fallback：网络下载
        if (!modelOk) {
          progressState.stage = 'pulling'; progressState.message = '正在下载模型...'; progressState.percent = 0;
          event.sender.send('ollama:progress', { stage: 'pulling', message: '正在下载模型...', percent: 0 });
          const ok = await pullModel(DEFAULT_MODEL, (p) => {
            progressState.message = p.status; progressState.percent = p.percent;
            event.sender.send('ollama:progress', { stage: 'pulling', message: p.status, percent: p.percent });
          });
          if (!ok) { progressState.active = false; return { ok: false, error: '模型下载失败' }; }
        }
      }

      progressState.active = false; progressState.done = true; progressState.modelReady = true; progressState.percent = 100;
      event.sender.send('ollama:status', { installed: true, running: true, modelReady: true, defaultModel: DEFAULT_MODEL });
      return { ok: true, model: DEFAULT_MODEL };
    } catch (e: any) { progressState.active = false; return { ok: false, error: e.message }; }
  });
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
