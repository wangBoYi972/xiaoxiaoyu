import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/**
 * Google Gemini 适配器
 * 使用 Google Generative AI SDK REST API
 */
export class GeminiAdapter extends BaseModelAdapter {
  get baseUrl(): string {
    return this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await this.simpleFetch(
        `${this.baseUrl}/models?key=${this.config.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.simpleFetch(`${this.baseUrl}/models?key=${encodeURIComponent(this.config.apiKey)}`);
    if (!response.ok) {
      throw new Error(`获取 Gemini 模型失败（HTTP ${response.status}），请检查 API Key 和模型列表权限`);
    }
    const data = await response.json() as {
      models?: Array<{
        name?: string;
        displayName?: string;
        inputTokenLimit?: number;
        supportedGenerationMethods?: string[];
      }>;
    };
    const models: Array<{ id: string; displayName?: string; maxTokens?: number }> = [];
    for (const model of data.models || []) {
      if (!model.supportedGenerationMethods?.includes('generateContent')) continue;
      const id = model.name?.replace(/^models\//, '').trim();
      if (id) models.push({ id, displayName: model.displayName?.trim(), maxTokens: model.inputTokenLimit });
    }
    if (!models.length) throw new Error('Gemini 未返回支持内容生成的模型');
    return models.map((model) => ({
      id: model.id,
      displayName: model.displayName || model.id,
      provider: 'gemini',
      maxTokens: model.maxTokens || 1048576,
      supportsVision: true,
      supportsThinking: model.id.includes('2.5') || model.id.includes('pro'),
    }));
  }

  async *chat(options: ChatRequestOptions): AsyncGenerator<UnifiedStreamChunk> {
    const modelId = options.model;
    const url = `${this.baseUrl}/models/${modelId}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    // 转换消息为 Gemini 格式
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
    let systemInstruction = options.systemPrompt || '';

    for (const msg of options.messages) {
      const parts: Array<Record<string, unknown>> = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url' && part.image_url) {
            // 处理 inline data URLs (data:image/...)
            const imageUrl = part.image_url.url;
            if (imageUrl.startsWith('data:')) {
              const [header, data] = imageUrl.split(',');
              const mimeType = header.split(':')[1]?.split(';')[0] || 'image/png';
              parts.push({
                inline_data: { mimeType, data },
              });
            }
          }
        }
      }

      // Gemini 使用 'user' 和 'model' 作为角色
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    try {
      const response = await this.fetchStream(url, body, options.signal);

      for await (const data of this.readSSEStream(response)) {
        if (options.signal?.aborted) break;

        try {
          const parsed = JSON.parse(data);
          const candidates = parsed.candidates;
          if (!candidates || candidates.length === 0) continue;

          const candidate = candidates[0];
          const content = candidate.content;

          if (content?.parts) {
            for (const part of content.parts) {
              if (part.text) {
                yield { type: 'text-delta', textDelta: part.text };
              }
            }
          }

          if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
            // 安全过滤等原因
            yield {
              type: 'error',
              error: { message: `生成被中断: ${candidate.finishReason}`, code: 'GEMINI_SAFETY' },
            };
            return;
          }

          if (candidate.finishReason) {
            yield {
              type: 'done',
              doneReason: candidate.finishReason === 'STOP' ? 'stop' : 'length',
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
}
