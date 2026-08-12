import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/**
 * Ollama 本地模型适配器
 * 通过 HTTP API 调用 Ollama (默认 localhost:11434)
 */
export class OllamaAdapter extends BaseModelAdapter {
  private static MODELS: ModelInfo[] = [];

  get baseUrl(): string {
    return this.config.baseUrl || 'http://127.0.0.1:11434';
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await this.simpleFetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch { return false; }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.simpleFetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json() as { models?: Array<{ name: string; details?: { parameter_size?: string } }> };
      if (!data.models) return [];

      return data.models.map((m) => ({
        id: m.name,
        displayName: `${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''}`,
        provider: 'ollama',
        maxTokens: 131072,
        supportsVision: m.name.toLowerCase().includes('vision') || m.name.toLowerCase().includes('llava'),
        supportsThinking: false,
      }));
    } catch {
      return [];
    }
  }

  /** 获取本地已安装的模型列表 */
  async listLocalModels(): Promise<ModelInfo[]> {
    return this.listModels();
  }

  /** 拉取模型 */
  async pullModel(modelName: string, onProgress?: (progress: { status: string; completed: number; total: number }) => void): Promise<void> {
    const response = await this.fetchStream(
      `${this.baseUrl}/api/pull`,
      { name: modelName, stream: true }
    );

    if (!response.ok) {
      throw new Error(`拉取模型失败: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (onProgress) {
            onProgress({
              status: data.status || '',
              completed: data.completed || 0,
              total: data.total || 0,
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  /** 删除本地模型 */
  async deleteModel(modelName: string): Promise<void> {
    const response = await this.simpleFetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    if (!response.ok) {
      throw new Error(`删除模型失败: ${response.status}`);
    }
  }

  async *chat(options: ChatRequestOptions): AsyncGenerator<UnifiedStreamChunk> {
    const messages: Array<{ role: string; content: string | string[] }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of options.messages) {
      let content: string | string[] = typeof msg.content === 'string' ? msg.content : '';
      if (Array.isArray(msg.content)) {
        const images: string[] = [];
        let text = '';
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            text += part.text;
          } else if (part.type === 'image_url' && part.image_url) {
            images.push(part.image_url.url);
          }
        }
        content = text;
        if (images.length > 0) {
          content = [text, ...images];
        }
      }
      messages.push({ role: msg.role, content });
    }

    const body = {
      model: options.model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 4096,
      },
    };

    try {
      const response = await this.fetchStream(
        `${this.baseUrl}/api/chat`,
        body,
        options.signal
      );

      // Ollama 返回 NDJSON 格式（每行一个 JSON 对象）
      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (options.signal?.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullContent += data.message.content;
              yield { type: 'text-delta', textDelta: data.message.content };
            }
            if (data.done) {
              yield {
                type: 'done',
                doneReason: 'stop',
                usage: data.eval_count
                  ? { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count }
                  : undefined,
              };
              return;
            }
          } catch { /* skip */ }
        }
      }

      // 处理剩余的 buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.content) {
            fullContent += data.message.content;
            yield { type: 'text-delta', textDelta: data.message.content };
          }
        } catch { /* skip */ }
      }

      yield { type: 'done', doneReason: 'stop' };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        yield { type: 'done', doneReason: 'stop' };
        return;
      }
      yield {
        type: 'error',
        error: { message: (error as Error).message, code: 'OLLAMA_ERROR' },
      };
    }
  }
}
