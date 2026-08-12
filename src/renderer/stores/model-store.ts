import { create } from 'zustand';
import { getPresetModels } from '../../adapters/index';
import api from '../../api';

interface ProviderConfig {
  id: string; name: string; hasApiKey: boolean; baseUrl?: string; enabled: boolean; models: string[];
}

interface ModelInfo {
  id: string; displayName: string; provider: string; maxTokens: number;
  supportsVision: boolean; supportsThinking: boolean; isFree?: boolean;
}

interface ModelStore {
  providers: ProviderConfig[];
  activeProviderId: string; activeModelId: string;
  availableModels: ModelInfo[]; loading: boolean;
  ollamaReady: boolean; // 本地 Ollama 是否可用

  loadProviders: () => Promise<void>;
  saveProvider: (config: { id: string; name: string; apiKey: string; baseUrl?: string; enabled: boolean; models: string[] }) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setActiveProvider: (id: string) => void;
  setActiveModel: (modelId: string) => void;
  checkOllama: () => Promise<boolean>;
}

const BUILTIN: Array<{ id: string; name: string; baseUrl?: string; freeNote?: string }> = [
  { id: 'ollama', name: 'Ollama 本地 🆓', baseUrl: 'http://127.0.0.1:11434', freeNote: '无需API Key，完全免费' },
  { id: 'glm', name: '智谱 GLM 🆓', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', freeNote: 'GLM-4-Flash 完全免费' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'anthropic', name: 'Claude', baseUrl: '' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'moonshot', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'gemini', name: 'Gemini 🆓', baseUrl: '', freeNote: '免费额度，需API Key' },
  { id: 'ernie', name: '文心一言 🆓', baseUrl: '', freeNote: '免费额度，需API Key' },
];

export const useModelStore = create<ModelStore>((set, get) => ({
  providers: [],
  activeProviderId: 'ollama',
  activeModelId: '',
  availableModels: [],
  loading: false,
  ollamaReady: false,

  loadProviders: async () => {
    set({ loading: true });
    try {
      const saved = await api.listProviders();
      const merged: ProviderConfig[] = BUILTIN.map((preset) => {
        const s = saved.find((p: any) => p.id === preset.id);
        if (s) return { id: s.id, name: preset.name, hasApiKey: s.hasApiKey || false, baseUrl: s.baseUrl || preset.baseUrl, enabled: s.enabled, models: s.models || [] };
        return { id: preset.id, name: preset.name, hasApiKey: false, baseUrl: preset.baseUrl, enabled: false, models: [] };
      });

      // 检查 Ollama 是否可用
      let ollamaReady = false;
      try {
        const ok = await api.testProvider('ollama');
        ollamaReady = ok;
      } catch {}
      // 如果 Ollama 可用则默认启用
      if (ollamaReady) {
        const oi = merged.findIndex((p: any) => p.id === 'ollama');
        if (oi >= 0) merged[oi] = { ...merged[oi], enabled: true };
      }

      set({ providers: merged, loading: false, ollamaReady });

      // 默认选 Ollama（可用时）或第一个免费模型
      if (ollamaReady) {
        get().setActiveProvider('ollama');
      } else {
        // 找第一个启用的
        const first = merged.find((p: any) => p.enabled);
        if (first) get().setActiveProvider(first.id);
        else get().setActiveProvider('ollama'); // 即使未运行也指向 ollama，方便引导
      }
    } catch { set({ loading: false }); }
  },

  checkOllama: async (): Promise<boolean> => {
    try {
      const ok = await api.testProvider('ollama');
      set((s: any) => {
        const ps = [...s.providers];
        const i = ps.findIndex((p: any) => p.id === 'ollama');
        if (i >= 0) ps[i] = { ...ps[i], enabled: ok };
        return { providers: ps, ollamaReady: ok };
      });
      if (ok) get().setActiveProvider('ollama');
      return ok;
    } catch { return false; }
  },

  saveProvider: async (config: any) => {
    await api.saveProvider({ id: config.id, name: config.name, apiKey: config.apiKey, baseUrl: config.baseUrl || '', enabled: config.enabled, models: config.models || [], extraHeaders: config.extraHeaders });
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === config.id ? { ...p, name: config.name, hasApiKey: !!config.apiKey || p.hasApiKey, baseUrl: config.baseUrl, enabled: config.enabled, models: config.models } : p
      ),
    }));
  },

  deleteProvider: async (id) => {
    await api.deleteProvider(id);
    set((s) => ({ providers: s.providers.map((p) => p.id === id ? { ...p, hasApiKey: false, enabled: false, models: [] } : p) }));
  },

  setActiveProvider: (id) => {
    set({ activeProviderId: id });
    const ms = getPresetModels(id);
    if (ms.length > 0) set({ availableModels: ms, activeModelId: ms[0].id });
  },

  setActiveModel: (modelId) => set({ activeModelId: modelId }),

  refreshModels: async (providerId) => {
    try { await api.testProvider(providerId); } catch {}
    set({ availableModels: getPresetModels(providerId) });
  },
}));
