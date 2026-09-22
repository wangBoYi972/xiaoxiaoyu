import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/**
 * OpenAI 兼容适配器基类
 * 适用于所有兼容 OpenAI Chat Completions API 的提供商
 * 包括：OpenAI、DeepSeek、通义千问、智谱GLM、Moonshot(Kimi) 等
 */
export class OpenAICompatAdapter extends BaseModelAdapter {
  private defaultBaseUrl: string;

  constructor(config: ProviderConfig, defaultBaseUrl: string) {
    super(config);
    this.defaultBaseUrl = defaultBaseUrl;
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

  async validateApiKey(): Promise<boolean> {
    try {
      // 模型列表既是实际下拉的数据源，也是最可靠的身份验证接口。
      // 不再伪造某个预置模型发聊天请求，避免中转站因模型名不同被误判失败。
      const response = await this.simpleFetch(`${this.baseUrl}/models`, { headers: this.buildHeaders() });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.simpleFetch(`${this.baseUrl}/models`, { headers: this.buildHeaders() });
    if (!response.ok) {
      throw new Error(`获取模型失败（HTTP ${response.status}），请检查 API 地址、Key 和模型列表权限`);
    }
    const data = await response.json() as { data?: Array<{ id?: string }> };
    const modelIds = data.data
      ?.map((model) => model.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (!modelIds?.length) {
      throw new Error('接口未返回可选模型，请检查 API 地址是否为兼容的 /v1 端点');
    }
    return modelIds.map((id) => ({
      id,
      displayName: id,
      provider: this.providerId,
      maxTokens: 128000,
      supportsVision: id.toLowerCase().includes('vision') || id.toLowerCase().includes('gpt-4o'),
      supportsThinking: id.toLowerCase().includes('o1') || id.toLowerCase().includes('o3'),
    }));
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
