import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/**
 * 百度文心 ERNIE 适配器
 * 使用百度千帆大模型平台 API (OAuth2 认证)
 */
export class ERNIEAdapter extends BaseModelAdapter {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private tokenRefreshPromise: Promise<string> | null = null;

  private static MODELS: ModelInfo[] = [
    { id: 'ernie-4.0-turbo-128k', displayName: 'ERNIE 4.0 Turbo 128K', provider: 'ernie', maxTokens: 131072, supportsVision: false, supportsThinking: false },
    { id: 'ernie-4.5-8k', displayName: 'ERNIE 4.5 8K', provider: 'ernie', maxTokens: 8192, supportsVision: false, supportsThinking: true },
    { id: 'ernie-speed-128k', displayName: 'ERNIE Speed 128K', provider: 'ernie', maxTokens: 131072, supportsVision: false, supportsThinking: false },
  ];

  get baseUrl(): string {
    return this.config.baseUrl || 'https://aip.baidubce.com';
  }

  /** 获取 OAuth2 access token — 带竞态保护 */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // 防止并发刷新导致多个 token 请求
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = (async () => {
      try {
        const response = await this.simpleFetch(
          'https://aip.baidubce.com/oauth/2.0/token',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: this.config.apiKey,
              client_secret: this.config.extraHeaders?.['client_secret'] || '',
            }).toString(),
          }
        );

        if (!response.ok) {
          throw new Error('获取百度AI access token 失败，请检查 API Key 和 Secret Key');
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        return this.accessToken;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return ERNIEAdapter.MODELS;
  }

  async *chat(options: ChatRequestOptions): AsyncGenerator<UnifiedStreamChunk> {
    try {
      const token = await this.getAccessToken();
      const url = `${this.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${options.model}?access_token=${token}`;

      const messages: Array<{ role: string; content: string }> = [];

      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      for (const msg of options.messages) {
        messages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }

      const body = {
        messages,
        temperature: options.temperature || 0.7,
        max_output_tokens: options.maxTokens || 4096,
        stream: true,
      };

      const response = await this.fetchStream(url, body, options.signal);

      for await (const data of this.readSSEStream(response)) {
        if (options.signal?.aborted) break;

        try {
          const parsed = JSON.parse(data);

          if (parsed.error_code) {
            yield {
              type: 'error',
              error: { message: parsed.error_msg || '百度AI API错误', code: `ERNIE_${parsed.error_code}` },
            };
            return;
          }

          if (parsed.result) {
            yield { type: 'text-delta', textDelta: parsed.result };
          }

          if (parsed.is_end) {
            yield {
              type: 'done',
              doneReason: 'stop',
              usage: parsed.usage
                ? { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens }
                : undefined,
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
        error: { message: (error as Error).message, code: 'ERNIE_ERROR' },
      };
    }
  }
}
