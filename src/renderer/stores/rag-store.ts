// RAG 状态：索引状态、嵌入后端、进度、检索
import { create } from 'zustand';

export interface RagStatus {
  chunks: number;
  files: number;
  model: string;
}

export interface RagProgress {
  phase: 'scan' | 'embed' | 'pull' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  current?: string;
  message?: string;
}

export interface RagHit {
  id: number;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

export interface RagConfig {
  backend: 'auto' | 'ollama' | 'openai' | 'local';
  ollamaUrl?: string;
  ollamaModel?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  dim?: number;
  chunkSize: number;
  chunkOverlap: number;
  maxFileBytes: number;
  maxFiles: number;
  autoInject: boolean;
  topK: number;
}

interface RagState {
  available: boolean;
  status: RagStatus;
  progress: RagProgress | null;
  busy: boolean;
  config: RagConfig | null;
  backendLabel: string;
  ollamaModels: string[];
  lastQuery: string;
  hits: RagHit[];

  init: (workspace: string) => void;
  refresh: () => void;
  buildIndex: (force?: boolean) => Promise<void>;
  cancel: () => void;
  clear: () => Promise<void>;
  search: (query: string, topK?: number) => Promise<RagHit[]>;
  updateConfig: (patch: Partial<RagConfig>) => Promise<void>;
  probe: () => Promise<void>;
  pullModel: (model?: string) => Promise<void>;
}

function api(): any {
  return (window as any).electronAPI?.rag || null;
}

let currentWorkspace = '';
/** 进度监听只注册一次：ComposerHeader 会在 ChatView / HomeView 各挂载一次 */
let progressBound = false;

export const useRagStore = create<RagState>((set, get) => ({
  available: !!(window as any).electronAPI?.rag,
  status: { chunks: 0, files: 0, model: '' },
  progress: null,
  busy: false,
  config: null,
  backendLabel: '',
  ollamaModels: [],
  lastQuery: '',
  hits: [],

  init: (workspace: string) => {
    const r = api();
    if (!r) return;
    currentWorkspace = workspace || '';
    if (!progressBound) {
      progressBound = true;
      r.onProgress((p: RagProgress) => {
        set({ progress: p });
        if (p.phase === 'done' || p.phase === 'error' || p.phase === 'cancelled') {
          set({ busy: false });
          get().refresh();
        }
      });
    }
    r.getConfig().then((c: RagConfig) => set({ config: c })).catch(() => {});
    get().refresh();
    get().probe();
  },

  refresh: () => {
    const r = api();
    if (!r || !currentWorkspace) return;
    r.status(currentWorkspace)
      .then((s: RagStatus) => set({ status: s || { chunks: 0, files: 0, model: '' } }))
      .catch(() => {});
  },

  probe: async () => {
    const r = api();
    if (!r) return;
    try {
      const res = await r.probe();
      set({ backendLabel: res?.label || (res?.error ? `不可用：${res.error}` : '') });
    } catch {}
    try {
      const m = await r.ollamaModels();
      if (m?.ok) set({ ollamaModels: m.models || [] });
    } catch {}
  },

  buildIndex: async (force?: boolean) => {
    const r = api();
    if (!r || !currentWorkspace) return;
    set({ busy: true, progress: { phase: 'scan', done: 0, total: 0, message: '准备中…' } });
    try {
      if (force) await r.clear(currentWorkspace);
      const res = await r.index(currentWorkspace);
      if (res?.ok) {
        set({ progress: { phase: 'done', done: 1, total: 1, message: res.message || '完成' } });
      } else {
        set({ progress: { phase: 'error', done: 0, total: 0, message: res?.message || '索引失败' } });
      }
    } catch (e: any) {
      set({ progress: { phase: 'error', done: 0, total: 0, message: e?.message || '索引失败' } });
    } finally {
      set({ busy: false });
      get().refresh();
      get().probe();
    }
  },

  cancel: () => {
    api()?.cancel?.();
    set({ busy: false });
  },

  clear: async () => {
    const r = api();
    if (!r || !currentWorkspace) return;
    await r.clear(currentWorkspace);
    set({ hits: [], progress: null });
    get().refresh();
  },

  search: async (query: string, topK?: number) => {
    const r = api();
    if (!r || !currentWorkspace || !query.trim()) return [];
    set({ lastQuery: query });
    const hits: RagHit[] = await r.search({ workspace: currentWorkspace, query, topK });
    set({ hits: hits || [] });
    return hits || [];
  },

  updateConfig: async (patch: Partial<RagConfig>) => {
    const r = api();
    if (!r) return;
    const next = await r.setConfig(patch);
    set({ config: next });
    get().probe();
  },

  pullModel: async (model?: string) => {
    const r = api();
    if (!r) return;
    set({ busy: true, progress: { phase: 'pull', done: 0, total: 0, message: '开始下载…' } });
    try {
      const res = await r.pullModel(model);
      if (!res?.ok) {
        set({ progress: { phase: 'error', done: 0, total: 0, message: res?.message || '下载失败' } });
      }
    } catch (e: any) {
      set({ progress: { phase: 'error', done: 0, total: 0, message: e?.message || '下载失败' } });
    } finally {
      set({ busy: false });
      get().probe();
    }
  },
}));
