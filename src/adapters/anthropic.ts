import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/**
 * Anthropic Claude 适配器
 * 使用 Anthropic Messages API
 */
export class AnthropicAdapter extends BaseModelAdapter {
  private static MODELS: ModelInfo[] = [
    { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', provider: 'anthropic', maxTokens: 200000, supportsVision: true, supportsThinking: true },
    { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5', provider: 'anthropic', maxTokens: 200000, supportsVision: true, supportsThinking: true },
    { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', provider: 'anthropic', maxTokens: 200000, supportsVision: true, supportsThinking: false },
  ];

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      ...this.config.extraHeaders,
    };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await this.simpleFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      return response.ok || response.status === 400; // 400 说明 API Key 有效但请求格式不对
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return AnthropicAdapter.MODELS;
  }

  async *chat(options: ChatRequestOptions): AsyncGenerator<UnifiedStreamChunk> {
    const systemPrompt = options.systemPrompt || '';

    // 转换消息格式为 Anthropic 格式（system 角色消息已通过 systemPrompt 单独发送，跳过）
    const messages = options.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: typeof msg.content === 'string'
          ? msg.content
          : (msg.content as any[]).map((part) => {
              if (part.type === 'image_url' && part.image_url) {
                const imgUrl = part.image_url.url as string;
                if (imgUrl.startsWith('data:')) {
                  const [header, rawData] = imgUrl.split(',');
                  const mimeMatch = header.match(/data:([^;]+)/);
                  const mediaType = mimeMatch ? mimeMatch[1] : 'image/png';
                  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: rawData } };
                }
                return { type: 'image', source: { type: 'url', url: imgUrl } };
              }
              return { type: 'text', text: part.text || '' };
            }),
      }));

    const body: Record<string, unknown> = {
      model: this.mapModelId(options.model),
      max_tokens: options.maxTokens || 4096,
      messages,
      stream: true,
    };

    if (options.temperature != null) body.temperature = options.temperature;

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    try {
      const response = await this.fetchStream(
        'https://api.anthropic.com/v1/messages',
        body,
        options.signal
      );

      let textContent = '';
      let thinkingContent = '';

      for await (const data of this.readSSEStream(response)) {
        if (options.signal?.aborted) break;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'message_start') {
            // 消息开始事件
            continue;
          }

          if (parsed.type === 'content_block_delta') {
            const delta = parsed.delta;
            if (delta?.type === 'text_delta') {
              textContent += delta.text || '';
              yield { type: 'text-delta', textDelta: delta.text };
            } else if (delta?.type === 'thinking_delta') {
              thinkingContent += delta.thinking || '';
              yield { type: 'thinking-delta', thinkingDelta: delta.thinking };
            }
          }

          if (parsed.type === 'message_delta') {
            const stopReason = parsed.delta?.stop_reason;
            const usage = parsed.usage;
            yield {
              type: 'done',
              doneReason: stopReason === 'end_turn' ? 'stop' : 'length',
              usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : undefined,
            };
            return;
          }

          if (parsed.type === 'error') {
            yield {
              type: 'error',
              error: { message: parsed.error?.message || '未知错误', code: 'ANTHROPIC_ERROR' },
            };
            return;
          }
        } catch {
          // 跳过解析失败
        }
      }

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

  /** 映射用户选择的模型 ID 到 Anthropic 实际模型 ID */
  private mapModelId(userModelId: string): string {
    const mapping: Record<string, string> = {
      'claude-opus-4-8': 'claude-opus-4-8',
      'claude-sonnet-5': 'claude-sonnet-5',
      'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    };
    return mapping[userModelId] || userModelId;
  }
}
