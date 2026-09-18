import { create } from 'zustand';
import { getPresetModels } from '../../adapters/index';
import api from '../../api';

interface ProviderConfig {
  id: string; name: string; hasApiKey: boolean; baseUrl?: string; enabled: boolean; models: string[];
  /** 用户自己新增的供应商（区别于内置九家） */
  custom?: boolean;
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
  saveProvider: (config: { id: string; name: string; apiKey?: string; baseUrl?: string; enabled: boolean; models: string[]; extraHeaders?: Record<string, string> }) => Promise<void>;
  /** 新增自定义供应商（任意 OpenAI 兼容端点） */
  addCustomProvider: (input: { name: string; baseUrl: string; apiKey?: string; models: string[]; id?: string }) => Promise<string>;
  /** 彻底删除自定义供应商（内置供应商不可删，只能停用） */
  removeCustomProvider: (id: string) => Promise<void>;
  /** 给某个供应商追加一个自定义模型 ID */
  addCustomModel: (providerId: string, modelId: string) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setActiveProvider: (id: string) => void;
  setActiveModel: (modelId: string) => void;
  checkOllama: () => Promise<boolean>;
  refreshModels: (providerId: string) => Promise<void>;
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

/** 内置供应商 id 集合 */
const BUILTIN_IDS = new Set(BUILTIN.map((b) => b.id));

/** 把「模型 ID 字符串」补成下拉需要的 ModelInfo */
function toModelInfo(id: string, providerId: string): ModelInfo {
  return {
    id,
    displayName: id,
    provider: providerId,
    maxTokens: 32768,
    supportsVision: false,
    supportsThinking: false,
  };
}

/** 记住上次选择，重启后自动恢复（不写进数据库，仅本地偏好） */
const ACTIVE_KEY = 'codex_active_model';
function loadActive(): { providerId?: string; modelId?: string } {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveActive(providerId: string, modelId: string): void {
  try { window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ providerId, modelId })); } catch {}
}

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

      // 自定义供应商：库里有、但不在内置列表里的，全部保留（否则用户加的供应商会「消失」）
      for (const s of saved) {
        if (BUILTIN_IDS.has(s.id)) continue;
        merged.push({
          id: s.id,
          name: s.name || s.id,
          hasApiKey: !!s.hasApiKey,
          baseUrl: s.baseUrl || '',
          enabled: !!s.enabled,
          models: s.models || [],
          custom: true,
        });
      }

      // 检查 Ollama 是否可用
      let ollamaReady = false;
      try {
        const ok = await api.testProvider('ollama');
        ollamaReady = ok;
      } catch {}
      if (ollamaReady) {
        const oi = merged.findIndex((p: any) => p.id === 'ollama');
        if (oi >= 0) merged[oi] = { ...merged[oi], enabled: true };
      }

      set({ providers: merged, loading: false, ollamaReady });

      // 恢复上次选择（可用时），否则走默认逻辑
      const last = loadActive();
      if (last.providerId && merged.some((p) => p.id === last.providerId)) {
        get().setActiveProvider(last.providerId);
        if (last.modelId) set({ activeModelId: last.modelId });
        return;
      }

      if (ollamaReady) {
        get().setActiveProvider('ollama');
      } else {
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

  saveProvider: async (config) => {
    // apiKey 为空表示「保留已保存的 Key」，主进程侧会沿用旧密钥
    await api.saveProvider({ id: config.id, name: config.name, apiKey: config.apiKey || '', baseUrl: config.baseUrl || '', enabled: config.enabled, models: config.models || [], extraHeaders: config.extraHeaders });
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === config.id ? { ...p, name: config.name, hasApiKey: !!config.apiKey || p.hasApiKey, baseUrl: config.baseUrl, enabled: config.enabled, models: config.models } : p
      ),
    }));
  },

  addCustomProvider: async (input) => {
    const id = (input.id || `custom_${Date.now().toString(36)}`).replace(/\s+/g, '_');
    const config = {
      id,
      name: input.name || id,
      apiKey: input.apiKey || '',
      baseUrl: input.baseUrl || '',
      enabled: true,
      models: input.models || [],
    };
    await api.saveProvider(config);
    set((s) => ({
      providers: [
        ...s.providers,
        {
          id,
          name: config.name,
          hasApiKey: !!input.apiKey,
          baseUrl: config.baseUrl,
          enabled: true,
          models: config.models,
          custom: true,
        },
      ],
    }));
    get().setActiveProvider(id);
    return id;
  },

  removeCustomProvider: async (id) => {
    await api.deleteProvider(id);
    set((s) => {
      const providers = s.providers.filter((p) => p.id !== id);
      const activeProviderId = s.activeProviderId === id ? (providers[0]?.id || 'ollama') : s.activeProviderId;
      if (s.activeProviderId === id) get().setActiveProvider(activeProviderId);
      return { providers, activeProviderId };
    });
  },

  addCustomModel: async (providerId, modelId) => {
    if (!modelId) return;
    const p = get().providers.find((x) => x.id === providerId);
    if (!p) return;
    const models = p.models.includes(modelId) ? p.models : [...p.models, modelId];
    await get().saveProvider({ id: p.id, name: p.name, baseUrl: p.baseUrl, enabled: true, models });
    set({ activeModelId: modelId });
    saveActive(providerId, modelId);
  },

  deleteProvider: async (id) => {
    await api.deleteProvider(id);
    set((s) => ({ providers: s.providers.map((p) => p.id === id ? { ...p, hasApiKey: false, enabled: false, models: [] } : p) }));
  },

  setActiveProvider: (id) => {
    // 内置预设 + 用户自己填过的模型 ID，一起进下拉
    const p = get().providers.find((x) => x.id === id);
    const preset = getPresetModels(id);
    const presetIds = new Set(preset.map((m) => m.id));
    const extra = (p?.models || []).filter((m) => !presetIds.has(m)).map((m) => toModelInfo(m, id));
    const models = [...preset, ...extra];

    set({ activeProviderId: id, availableModels: models, activeModelId: models[0]?.id || '' });
    saveActive(id, models[0]?.id || get().activeModelId);
  },

  setActiveModel: (modelId) => {
    set({ activeModelId: modelId });
    saveActive(get().activeProviderId, modelId);
  },

  refreshModels: async (providerId: string) => {
    try { await api.testProvider(providerId); } catch {}
    set({ availableModels: getPresetModels(providerId) });
  },
}));
