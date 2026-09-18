// Ollama IPC 处理 —— 生命周期逻辑统一在 services/ollama-service.ts
import { ipcMain } from 'electron';
import {
  updateOllamaProgress,
  initializeOllamaInBackground,
  runOllamaSetup,
  getOllamaStatus,
} from '../services/ollama-service';

export { updateOllamaProgress, initializeOllamaInBackground };

export function registerOllamaHandlers(): void {
  // 状态查询走 2 秒 TTL 缓存，避免 UI 轮询时反复请求 Ollama
  ipcMain.handle('ollama:status', async () => getOllamaStatus());

  ipcMain.handle('ollama:setup', async (event) => {
    return runOllamaSetup({
      progress: (p) => event.sender.send('ollama:progress', p),
      status: (s) => event.sender.send('ollama:status', s),
    });
  });
}
