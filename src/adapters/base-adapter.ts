import type { UnifiedMessage, UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';
import * as http from 'http';
import * as https from 'https';

/**
 * 模型适配器抽象基类
 * 内建流式 HTTP 请求支持（兼容 Node 16+ / 浏览器）
 */
export abstract class BaseModelAdapter {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract validateApiKey(): Promise<boolean>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract chat(options: ChatRequestOptions): AsyncGenerator<UnifiedStreamChunk>;

  get providerId(): string {
    return this.config.id;
  }

  get providerName(): string {
    return this.config.name;
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.config.extraHeaders,
    };
  }

  /** 简单 HTTP 请求（非流式）— 用于 validateApiKey/validate 等 */
  protected async simpleFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
    // 浏览器环境
    if (typeof globalThis.fetch === 'function' && typeof ReadableStream !== 'undefined') {
      return fetch(url, options as any);
    }
    // Node.js 环境
    return this._nodeFetch(url, options);
  }

  private _nodeFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 30000,
      }, (res: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          (res as any).ok = res.statusCode >= 200 && res.statusCode < 300;
          (res as any).status = res.statusCode;
          (res as any).text = () => Promise.resolve(body.toString());
          (res as any).json = () => Promise.resolve(JSON.parse(body.toString()));
          resolve(res as any);
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  /** POST 请求并返回 Response（流式） */
  protected async fetchStream(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const headers = this.buildHeaders();
    const bodyStr = JSON.stringify(body);

    // 浏览器环境：用原生 fetch
    if (typeof globalThis.fetch === 'function' && typeof ReadableStream !== 'undefined') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const combinedSignal = signal
        ? (() => { signal.addEventListener('abort', () => controller.abort()); return controller.signal; })()
        : controller.signal;
      try {
        const response = await fetch(url, { method: 'POST', headers, body: bodyStr, signal: combinedSignal });
        clearTimeout(timeout);
        if (!response.ok) {
          const errText = await response.text().catch(() => '未知错误');
          throw new Error(`[${response.status}] ${errText}`);
        }
        return response;
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
    }

    // Node.js 环境：直接使用 http/https（支持流式读取）
    const response = await this._nodeFetchStream(url, headers, bodyStr, signal);
    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误');
      throw new Error(`[${response.status}] ${errText}`);
    }
    return response;
  }

  private _nodeFetchStream(url: string, headers: Record<string, string>, bodyStr: string, signal?: AbortSignal): Promise<Response> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      // 不允许 gzip——Node http 不会自动解压响应体
      const reqHeaders = { ...headers, 'accept-encoding': 'identity' };
      const req = mod.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: reqHeaders,
        timeout: 120000,
      }, (res) => {
        const ok = (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300;

        // 非 2xx：缓冲完整响应体以便读取错误信息
        if (!ok) {
          const errorChunks: Buffer[] = [];
          res.on('data', (c: Buffer) => errorChunks.push(c));
          res.on('end', () => {
            const bodyStr = Buffer.concat(errorChunks).toString();
            const mockResponse: any = {
              ok: false,
              status: res.statusCode || 500,
              body: null,
              text: () => Promise.resolve(bodyStr),
              json: () => { try { return Promise.resolve(JSON.parse(bodyStr)); } catch { return Promise.reject(new Error(bodyStr)); } },
            };
            resolve(mockResponse);
          });
          res.on('error', reject);
          return;
        }

        // 构建流式 reader (for 2xx streaming)
        const chunks: Buffer[] = [];
        let ended = false;
        let resolveReader: ((v: ReadableStreamReadResult<Uint8Array>) => void) | null = null;
        const pending: Array<{ resolve: (v: any) => void }> = [];

        res.on('data', (chunk: Buffer) => {
          if (resolveReader) {
            resolveReader({ done: false, value: new Uint8Array(chunk) });
            resolveReader = null;
          } else {
            pending.push({
              resolve(v?: any) { return;
                // dummy
              }
            });
            chunks.push(chunk);
          }
        });

        res.on('end', () => {
          ended = true;
          if (resolveReader) {
            resolveReader({ done: true, value: undefined as any });
            resolveReader = null;
          }
          // flush any pending
          for (const p of pending) {
            // already consumed via chunks
          }
        });

        res.on('error', (err) => {
          if (resolveReader) {
            resolveReader({ done: true, value: undefined as any });
            resolveReader = null;
          }
        });

        const reader: ReadableStreamDefaultReader<Uint8Array> = {
          read(): Promise<ReadableStreamReadResult<Uint8Array>> {
            return new Promise((r) => {
              if (chunks.length > 0) {
                const chunk = chunks.shift()!;
                r({ done: false, value: new Uint8Array(chunk) });
              } else if (ended) {
                r({ done: true, value: undefined as any });
              } else {
                resolveReader = r;
              }
            });
          },
          releaseLock() {},
          cancel() { req.destroy(); },
          get closed() { return Promise.resolve(undefined as any); },
        } as any;

        const mockBody: ReadableStream<Uint8Array> = {
          getReader() { return reader; },
          locked: false,
          cancel() { req.destroy(); return Promise.resolve(); },
          get closed() { return Promise.resolve(undefined as any); },
        } as any;

        const response: any = {
          ok,
          status: res.statusCode || 500,
          body: mockBody,
          headers: new Map(Object.entries(res.headers || {})),
          text: () => Promise.resolve(Buffer.concat(chunks.map(c => typeof c === 'string' ? Buffer.from(c) : c)).toString()),
          json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks.map(c => typeof c === 'string' ? Buffer.from(c) : c)).toString())),
        };

        if (signal) {
          signal.addEventListener('abort', () => req.destroy());
        }

        resolve(response);
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
      req.write(bodyStr);
      req.end();
    });
  }

  /** 读取 SSE 流 */
  protected async *readSSEStream(response: Response): AsyncGenerator<string> {
    const reader = (response as any).body?.getReader?.();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() || '');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          yield data;
        }
      }
      if (done) {
        if (buffer.trim().startsWith('data: ')) {
          const data = buffer.trim().slice(6);
          if (data !== '[DONE]') yield data;
        }
        return;
      }
    }
  }

  protected toOpenAIMessages(messages: UnifiedMessage[]): Array<{ role: string; content: unknown }> {
    return messages.map((msg) => ({ role: msg.role, content: msg.content }));
  }
}
