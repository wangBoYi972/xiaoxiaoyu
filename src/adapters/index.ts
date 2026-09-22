import { BaseModelAdapter } from './base-adapter';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { ERNIEAdapter } from './ernie';
import { OllamaAdapter } from './ollama';
import { OpenAICompatAdapter } from './openai-compat';
import type { ProviderConfig, UnifiedStreamChunk, ChatRequestOptions, ModelInfo, UnifiedMessage, ToolDefinition } from './types';
import { supportsTools } from './model-capabilities';

export type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig, UnifiedMessage, ContentPart, ToolDefinition } from './types';

export class ModelRouter {
  private adapters: Map<string, BaseModelAdapter> = new Map();

  constructor() {
    this.registerBuiltinAdapters();
  }

  private registerBuiltinAdapters(): void {
    this.registerFactory('anthropic', (config) => new AnthropicAdapter(config));
    this.registerFactory('openai', (config) => new OpenAICompatAdapter(config, 'https://api.openai.com/v1'));
    this.registerFactory('deepseek', (config) => new OpenAICompatAdapter(config, 'https://api.deepseek.com/v1'));
    this.registerFactory('qwen', (config) => new OpenAICompatAdapter(config, 'https://dashscope.aliyuncs.com/compatible-mode/v1'));
    this.registerFactory('glm', (config) => new OpenAICompatAdapter(config, 'https://open.bigmodel.cn/api/paas/v4'));
    this.registerFactory('moonshot', (config) => new OpenAICompatAdapter(config, 'https://api.moonshot.cn/v1'));
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
      adapter = new OpenAICompatAdapter(config, config.baseUrl || 'https://api.openai.com/v1');
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

export { supportsTools };
