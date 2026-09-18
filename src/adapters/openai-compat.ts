import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/**
 * OpenAI 兼容适配器基类
 * 适用于所有兼容 OpenAI Chat Completions API 的提供商
 * 包括：OpenAI、DeepSeek、通义千问、智谱GLM、Moonshot(Kimi) 等
 */
export class OpenAICompatAdapter extends BaseModelAdapter {
  private defaultModels: ModelInfo[];
  private defaultBaseUrl: string;

  constructor(config: ProviderConfig, defaultBaseUrl: string, defaultModels: ModelInfo[]) {
    super(config);
    this.defaultBaseUrl = defaultBaseUrl;
    this.defaultModels = defaultModels;
  }

  get baseUrl(): string {
    return this.config.baseUrl || this.defaultBaseUrl;
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      ...this.config.extraHeaders,
    };
  }

  /**
   * 测试连接用的模型：优先用供应商配置的模型（models_json），
   * 其次用预设列表，最后才回退。
   * ⚠️ 原来固定写死 'deepseek-chat'：自定义中转站没这个模型会被判"连接失败"，
   *    明明 Key 和地址都对（2026-09-20 solidapi 踩到）。
   */
  protected get testModel(): string {
    return (this.config as any)?.models?.[0]?.id
      || (this.config as any)?.models?.[0]
      || this.defaultModels[0]?.id
      || 'deepseek-chat';
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const testResp = await this.simpleFetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.testModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      // 200 → 连接成功
      if (testResp.ok) return true;
      // 400 → API 可访问但参数有误（模型名无效等），认证通过即算连通
      if (testResp.status === 400) return true;
      // 401/403 → API Key 无效
      // 404 → API 地址错误
      // 其他状态码 → 未知错误
      return false;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.simpleFetch(`${this.baseUrl}/models`, { headers: this.buildHeaders() });
      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> };
        if (data.data) {
          return data.data.map((m) => ({
            id: m.id,
            displayName: m.id,
            provider: this.providerId,
            maxTokens: 128000,
            supportsVision: m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('gpt-4o'),
            supportsThinking: m.id.toLowerCase().includes('o1') || m.id.toLowerCase().includes('o3'),
          }));
        }
      }
    } catch {
      // 获取模型失败，返回默认列表
    }
    return this.defaultModels;
  }

  async *chat(options: ChatRequestOptions): AsyncGenerator<UnifiedStreamChunk> {
    const body: any = {
      model: options.model,
      messages: this.buildMessages(options),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    };

    // stream_options 仅 OpenAI 支持，国内模型（DeepSeek/GLM/Qwen）会报错
    const openaiOnlyIds = new Set(['openai']);
    if (openaiOnlyIds.has(this.providerId)) {
      body.stream_options = { include_usage: true };
    }

    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();

    // 如果有工具定义，添加 tools
    if (options.tools && options.tools.length > 0) {
      (body as any).tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    try {
      const response = await this.fetchStream(
        `${this.baseUrl}/chat/completions`,
        body,
        options.signal
      );

      // 统计真正解析成功的 SSE 数据条数：一条都没有 = 接口返回的不是聊天流
      // （典型：API 地址少写 /v1，站点返回 200 + HTML 首页 → 旧版会静默给个空回复）
      let parsedCount = 0;

      for await (const data of this.readSSEStream(response)) {
        if (options.signal?.aborted) break;

        try {
          const parsed = JSON.parse(data);
          parsedCount++;
          // 有些网关错误体也带 choices，用 error 字段兜底判断
          if (parsed?.error) {
            yield {
              type: 'error',
              error: {
                message: typeof parsed.error === 'string'
                  ? parsed.error
                  : (parsed.error.message || JSON.stringify(parsed.error)),
                code: 'API_ERROR',
              },
            };
            return;
          }
          const choice = parsed.choices?.[0];

          if (!choice) continue;

          // 处理 delta 内容
          const delta = choice.delta;
          if (delta?.content) {
            yield { type: 'text-delta', textDelta: delta.content };
          }

          // 处理 tool calls — 增量合并（OpenAI 流式 tool_calls 是增量的）
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallAccumulator.get(tc.index);
              if (existing) {
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              } else {
                toolCallAccumulator.set(tc.index, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                });
              }
            }
          }

          // 处理结束
          if (choice.finish_reason) {
            // 输出完整 tool calls（仅在 finish 时输出最终合并结果）
            if (toolCallAccumulator.size > 0) {
              for (const tc of toolCallAccumulator.values()) {
                yield { type: 'tool-call', toolCall: tc };
              }
            }
            const usage = parsed.usage;
            yield {
              type: 'done',
              doneReason: choice.finish_reason === 'stop' ? 'stop' : 'length',
              usage: usage ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } : undefined,
            };
            return;
          }
        } catch {
          // 跳过解析失败的行
        }
      }

      // 一条 SSE 数据都没解析出来 → 地址大概率不对（返回的是网页/空响应），
      // 直接报错，不要再静默 done（旧行为表现为"有气泡但空回复"）
      if (parsedCount === 0) {
        yield {
          type: 'error',
          error: {
            message: `接口没有返回任何聊天数据。请检查 API 地址是否完整（常见：末尾漏了 /v1，例如应为 https://example.com/v1）。当前请求地址：${this.baseUrl}/chat/completions`,
            code: 'EMPTY_STREAM',
          },
        };
        return;
      }

      // 流结束但没有 finish_reason
      yield { type: 'done', doneReason: 'stop' };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        yield { type: 'done', doneReason: 'stop' };
        return;
      }
      yield {
        type: 'error',
        error: { message: (error as Error).message, code: 'API_ERROR' },
      };
    }
  }

  private buildMessages(options: ChatRequestOptions): Array<Record<string, unknown>> {
    const messages: Array<Record<string, unknown>> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of options.messages) {
      // 工具结果消息 → role: tool
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          tool_call_id: msg.toolCallId,
        });
        continue;
      }

      // assistant 消息带工具调用
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: typeof msg.content === 'string' ? (msg.content || null) : msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
        messages.push(assistantMsg);
        continue;
      }

      messages.push({ role: msg.role, content: msg.content });
    }

    return messages;
  }
}

// 预定义的各提供商默认配置

export const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', displayName: 'GPT-4o', provider: 'openai', maxTokens: 128000, supportsVision: true, supportsThinking: false },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', provider: 'openai', maxTokens: 128000, supportsVision: true, supportsThinking: false },
  { id: 'gpt-4.1', displayName: 'GPT-4.1', provider: 'openai', maxTokens: 1048576, supportsVision: true, supportsThinking: false },
  { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', provider: 'openai', maxTokens: 1048576, supportsVision: true, supportsThinking: false },
  { id: 'o3', displayName: 'o3', provider: 'openai', maxTokens: 200000, supportsVision: true, supportsThinking: true },
  { id: 'o4-mini', displayName: 'o4-mini', provider: 'openai', maxTokens: 200000, supportsVision: true, supportsThinking: true },
  { id: 'o1', displayName: 'o1', provider: 'openai', maxTokens: 200000, supportsVision: true, supportsThinking: true },
];

export const DEEPSEEK_MODELS: ModelInfo[] = [
  { id: 'deepseek-chat', displayName: 'DeepSeek-V4 Pro (最新旗舰)', provider: 'deepseek', maxTokens: 131072, supportsVision: true, supportsThinking: true },
  { id: 'deepseek-reasoner', displayName: 'DeepSeek-R1-0528 (推理)', provider: 'deepseek', maxTokens: 65536, supportsVision: false, supportsThinking: true },
  { id: 'deepseek-v3-0324', displayName: 'DeepSeek-V3-0324', provider: 'deepseek', maxTokens: 65536, supportsVision: false, supportsThinking: false },
];

export const QWEN_MODELS: ModelInfo[] = [
  { id: 'qwen3-max', displayName: '通义千问3-Max (最新)', provider: 'qwen', maxTokens: 131072, supportsVision: true, supportsThinking: true },
  { id: 'qwen3-plus', displayName: '通义千问3-Plus', provider: 'qwen', maxTokens: 131072, supportsVision: true, supportsThinking: false },
  { id: 'qwen-max', displayName: '通义千问2.5-Max', provider: 'qwen', maxTokens: 32768, supportsVision: true, supportsThinking: false },
  { id: 'qwen-plus', displayName: '通义千问2.5-Plus', provider: 'qwen', maxTokens: 131072, supportsVision: true, supportsThinking: false },
  { id: 'qwen-turbo', displayName: '通义千问-Turbo', provider: 'qwen', maxTokens: 131072, supportsVision: false, supportsThinking: false },
];

export const GLM_MODELS: ModelInfo[] = [
  { id: 'glm-4.5', displayName: 'GLM-4.5 (最新)', provider: 'glm', maxTokens: 128000, supportsVision: true, supportsThinking: true },
  { id: 'glm-4-plus', displayName: 'GLM-4-Plus', provider: 'glm', maxTokens: 128000, supportsVision: true, supportsThinking: false },
  { id: 'glm-4-flash', displayName: 'GLM-4-Flash (免费)', provider: 'glm', maxTokens: 128000, supportsVision: true, supportsThinking: false },
];

export const MOONSHOT_MODELS: ModelInfo[] = [
  { id: 'moonshot-v1-8k', displayName: 'Kimi 8K', provider: 'moonshot', maxTokens: 8192, supportsVision: false, supportsThinking: false },
  { id: 'moonshot-v1-32k', displayName: 'Kimi 32K', provider: 'moonshot', maxTokens: 32768, supportsVision: false, supportsThinking: false },
  { id: 'moonshot-v1-128k', displayName: 'Kimi 128K', provider: 'moonshot', maxTokens: 131072, supportsVision: false, supportsThinking: false },
  { id: 'kimi-latest', displayName: 'Kimi Latest (最新)', provider: 'moonshot', maxTokens: 131072, supportsVision: false, supportsThinking: false },
];
