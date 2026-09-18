import { BaseModelAdapter } from './base-adapter';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { ERNIEAdapter } from './ernie';
import { OllamaAdapter } from './ollama';
import {
  OpenAICompatAdapter,
  OPENAI_MODELS,
  DEEPSEEK_MODELS,
  QWEN_MODELS,
  GLM_MODELS,
  MOONSHOT_MODELS,
} from './openai-compat';
import type { ProviderConfig, UnifiedStreamChunk, ChatRequestOptions, ModelInfo, UnifiedMessage, ToolDefinition } from './types';

export type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig, UnifiedMessage, ContentPart, ToolDefinition } from './types';

export class ModelRouter {
  private adapters: Map<string, BaseModelAdapter> = new Map();

  constructor() {
    this.registerBuiltinAdapters();
  }

  private registerBuiltinAdapters(): void {
    this.registerFactory('anthropic', (config) => new AnthropicAdapter(config));
    this.registerFactory('openai', (config) => new OpenAICompatAdapter(config, 'https://api.openai.com/v1', OPENAI_MODELS));
    this.registerFactory('deepseek', (config) => new OpenAICompatAdapter(config, 'https://api.deepseek.com/v1', DEEPSEEK_MODELS));
    this.registerFactory('qwen', (config) => new OpenAICompatAdapter(config, 'https://dashscope.aliyuncs.com/compatible-mode/v1', QWEN_MODELS));
    this.registerFactory('glm', (config) => new OpenAICompatAdapter(config, 'https://open.bigmodel.cn/api/paas/v4', GLM_MODELS));
    this.registerFactory('moonshot', (config) => new OpenAICompatAdapter(config, 'https://api.moonshot.cn/v1', MOONSHOT_MODELS));
    this.registerFactory('gemini', (config) => new GeminiAdapter(config));
    this.registerFactory('ernie', (config) => new ERNIEAdapter(config));
    this.registerFactory('ollama', (config) => new OllamaAdapter(config));
  }

  registerFactory(providerId: string, factory: (config: ProviderConfig) => BaseModelAdapter): void {
    (this.adapters as any)[`__factory_${providerId}`] = factory;
  }

  getAdapter(config: ProviderConfig): BaseModelAdapter {
    const cacheKey = `${config.id}:${config.apiKey?.slice(-8) || 'nokey'}:${config.baseUrl?.slice(-20) || ''}`;
    const cached = this.adapters.get(cacheKey);
    if (cached) return cached;

    const factory = (this.adapters as any)[`__factory_${config.id}`] as ((config: ProviderConfig) => BaseModelAdapter) | undefined;
    let adapter: BaseModelAdapter;
    if (factory) {
      adapter = factory(config);
    } else {
      adapter = new OpenAICompatAdapter(config, config.baseUrl || 'https://api.openai.com/v1', []);
    }

    this.adapters.set(cacheKey, adapter);
    return adapter;
  }

  /** 发送聊天请求 - 需要外部传入已验证的 ProviderConfig */
  async *chat(options: {
    providerId: string;
    modelId: string;
    apiKey: string;
    baseUrl?: string;
    extraHeaders?: Record<string, string>;
    messages: UnifiedMessage[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    tools?: ToolDefinition[];
  }): AsyncGenerator<UnifiedStreamChunk> {
    const config: ProviderConfig = {
      id: options.providerId,
      name: options.providerId,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl || '',
      enabled: true,
      models: [options.modelId],
      extraHeaders: options.extraHeaders,
    };

    const adapter = this.getAdapter(config);
    yield* adapter.chat({
      model: options.modelId,
      messages: options.messages as any[],
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      signal: options.signal,
      tools: options.tools,
    });
  }

  async testProvider(config: ProviderConfig): Promise<boolean> {
    try {
      const adapter = this.getAdapter(config);
      return await adapter.validateApiKey();
    } catch {
      return false;
    }
  }

  async listModels(config: ProviderConfig): Promise<ModelInfo[]> {
    try {
      const adapter = this.getAdapter(config);
      return await adapter.listModels();
    } catch {
      return [];
    }
  }
}

export function getPresetModels(providerId: string): ModelInfo[] {
  switch (providerId) {
    case 'anthropic':
      return [
        { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8 (最强大)', provider: 'anthropic', maxTokens: 200000, supportsVision: true, supportsThinking: true },
        { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5 (推荐)', provider: 'anthropic', maxTokens: 200000, supportsVision: true, supportsThinking: true },
        { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5 (快速)', provider: 'anthropic', maxTokens: 200000, supportsVision: true, supportsThinking: false },
      ];
    case 'openai':
      return OPENAI_MODELS;
    case 'deepseek':
      return DEEPSEEK_MODELS;
    case 'qwen':
      return QWEN_MODELS;
    case 'glm':
      return GLM_MODELS;
    case 'moonshot':
      return MOONSHOT_MODELS;
    case 'gemini':
      return [
        { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro (最强大)', provider: 'gemini', maxTokens: 2097152, supportsVision: true, supportsThinking: true },
        { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (推荐)', provider: 'gemini', maxTokens: 1048576, supportsVision: true, supportsThinking: true },
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (快速)', provider: 'gemini', maxTokens: 1048576, supportsVision: true, supportsThinking: false },
      ];
    case 'ernie':
      return [
        { id: 'ernie-4.5-turbo', displayName: 'ERNIE 4.5 Turbo (最新)', provider: 'ernie', maxTokens: 131072, supportsVision: true, supportsThinking: false },
        { id: 'ernie-4.5-8k', displayName: 'ERNIE 4.5 8K', provider: 'ernie', maxTokens: 8192, supportsVision: false, supportsThinking: true },
        { id: 'ernie-4.0-turbo-128k', displayName: 'ERNIE 4.0 Turbo 128K', provider: 'ernie', maxTokens: 131072, supportsVision: false, supportsThinking: false },
        { id: 'ernie-speed-128k', displayName: 'ERNIE Speed 128K (快速)', provider: 'ernie', maxTokens: 131072, supportsVision: false, supportsThinking: false },
      ];
    case 'ollama':
      return [
        { id: 'qwen2.5:0.5b', displayName: 'Qwen2.5 0.5B (轻量本地)', provider: 'ollama', maxTokens: 32768, supportsVision: false, supportsThinking: false },
        { id: 'qwen2.5:1.5b', displayName: 'Qwen2.5 1.5B', provider: 'ollama', maxTokens: 32768, supportsVision: false, supportsThinking: false },
        { id: 'qwen2.5:7b', displayName: 'Qwen2.5 7B (推荐)', provider: 'ollama', maxTokens: 32768, supportsVision: false, supportsThinking: false },
        { id: 'llama3.2:3b', displayName: 'Llama 3.2 3B', provider: 'ollama', maxTokens: 131072, supportsVision: false, supportsThinking: false },
      ];
    default:
      return [];
  }
}
