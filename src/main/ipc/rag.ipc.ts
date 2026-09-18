// RAG（检索增强）IPC —— 工作区语义索引的建立、查询与配置
import { ipcMain } from 'electron';
import { logger } from '../utils/logger';
import { isWorkspaceApproved } from './file.ipc';
import { embed, probeBackend, listOllamaModels } from '../rag/embedder';
import { buildIndex, cancelIndex } from '../rag/indexer';
import {
  clearWorkspace, ensureSchema, getConfig, search, setConfig, stats, DEFAULT_RAG_CONFIG,
} from '../rag/rag-store';

export function registerRagHandlers(): void {
  // 配置
  ipcMain.handle('rag:get-config', () => getConfig());

  ipcMain.handle('rag:set-config', (_event, patch: Record<string, any>) => {
    return setConfig(patch || {});
  });

  // 本机 Ollama 已装的模型（用于选择 embedding 模型）
  ipcMain.handle('rag:ollama-models', async (_event, url?: string) => {
    try {
      const models = await listOllamaModels(url || getConfig().ollamaUrl || 'http://127.0.0.1:11434');
      return { ok: true, models };
    } catch (e: any) {
      return { ok: false, models: [], error: e?.message };
    }
  });

  // 拉取 embedding 模型（Ollama），进度经 rag:progress 推送
  ipcMain.handle('rag:pull-model', async (event, model?: string) => {
    const cfg = getConfig();
    const name = model || cfg.ollamaModel || 'nomic-embed-text';
    const base = (cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const fetchFn: any = (globalThis as any).fetch;
    if (!fetchFn) return { ok: false, message: '当前运行时不支持 fetch' };
    try {
      const res = await fetchFn(`${base}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf8');
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const j = JSON.parse(t);
            if (j.error) throw new Error(String(j.error));
            const total = Number(j.total) || 0;
            const completed = Number(j.completed) || 0;
            try {
              event.sender.send('rag:progress', {
                phase: 'pull',
                done: completed,
                total,
                message: j.status || '下载模型中…',
              });
            } catch {}
          } catch (e: any) {
            if (e?.message && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
      try {
        event.sender.send('rag:progress', { phase: 'done', done: 1, total: 1, message: `${name} 已就绪` });
      } catch {}
      return { ok: true, model: name };
    } catch (e: any) {
      return { ok: false, message: e?.message || '拉取失败' };
    }
  });

  // 探测当前实际可用的 embedding 后端
  ipcMain.handle('rag:probe', async () => {
    try {
      return await probeBackend(getConfig());
    } catch (e: any) {
      return { ok: false, error: e?.message || '探测失败' };
    }
  });

  // 索引状态
  ipcMain.handle('rag:status', (_event, workspace?: string) => {
    if (!workspace) return { chunks: 0, files: 0, model: '' };
    try {
      ensureSchema();
      return stats(workspace);
    } catch (e: any) {
      return { chunks: 0, files: 0, model: '', error: e?.message };
    }
  });

  // 建立索引（进度通过 rag:progress 推送）
  ipcMain.handle('rag:index', async (event, workspace: string) => {
    if (!workspace || !isWorkspaceApproved(workspace)) {
      return { ok: false, message: '工作区未授权' };
    }
    try {
      return await buildIndex(workspace, (p) => {
        try { event.sender.send('rag:progress', p); } catch {}
      });
    } catch (e: any) {
      logger.error('RAG 索引失败', e as Error);
      return { ok: false, message: e?.message || '索引失败' };
    }
  });

  ipcMain.handle('rag:cancel', () => {
    cancelIndex();
    return true;
  });

  ipcMain.handle('rag:clear', (_event, workspace: string) => {
    if (!workspace) return false;
    clearWorkspace(workspace);
    return true;
  });

  // 语义检索（同时给 Agent 工具和 UI 测试用）
  ipcMain.handle('rag:search', async (_event, data: { workspace: string; query: string; topK?: number }) => {
    const { workspace, query, topK } = data || ({} as any);
    if (!workspace || !query) return [];
    const cfg = getConfig();
    const k = Math.max(1, Math.min(20, topK || cfg.topK || 6));
    try {
      return await search(workspace, query, k, async (texts) => {
        const r = await embed(texts, cfg);
        return r.vectors;
      });
    } catch (e: any) {
      logger.error('RAG 检索失败', e as Error);
      return [];
    }
  });

  ipcMain.handle('rag:default-config', () => DEFAULT_RAG_CONFIG);
}
