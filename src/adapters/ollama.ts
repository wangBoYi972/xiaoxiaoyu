import { BaseModelAdapter } from './base-adapter';
import type { UnifiedStreamChunk, ChatRequestOptions, ModelInfo, ProviderConfig } from './types';

/** Ollama 的 tool_calls.arguments 是对象，历史消息回传时也要对象而非 JSON 字符串 */
function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * 从模型纯文本输出中提取工具调用（小模型常见回退格式）：
 * 1. Qwen 风格标签：<tool_call>{"name":"x","arguments":{...}}</tool_call>（可多个）
 * 2. 裸 JSON：整条回复就是一个 {"name":"x","arguments":{...}} 对象
 * 返回提取出的调用与清理后的正文（已剔除 <think> 思考块与标签本身）。
 */
function extractTextToolCalls(content: string): {
  calls: Array<{ name: string; arguments: string }>;
  text: string;
} {
  const calls: Array<{ name: string; arguments: string }> = [];
  let text = content;

  // 剔除思考块（qwen3 等会输出，展示给用户纯噪音）；未闭合时截到末尾
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openThink = text.toLowerCase().lastIndexOf('<think>');
  if (openThink !== -1) text = text.slice(0, openThink);

  // 提取 <tool_call> 块
  text = text.replace(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi, (_m, body: string) => {
    try {
      const v = JSON.parse(body);
      const name = v?.name || v?.function?.name || '';
      if (name) {
        const args = v?.arguments ?? v?.function?.arguments ?? v?.parameters ?? {};
        calls.push({
          name: String(name),
          arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
        });
      }
    } catch { /* 标签内不是合法 JSON，按普通文本保留 */ }
    return '';
  });

  // 裸 JSON 回退：整条回复就是单个工具调用对象
  if (calls.length === 0) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const v = JSON.parse(trimmed);
        const name = v?.name || v?.function?.name || '';
        if (name && (v?.arguments !== undefined || v?.parameters !== undefined || v?.function?.arguments !== undefined)) {
          const args = v?.arguments ?? v?.parameters ?? v?.function?.arguments ?? {};
          calls.push({
            name: String(name),
            arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
          });
          text = '';
        }
      } catch { /* 普通文本 */ }
    }
  }

  return { calls, text: text.trim() };
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: Array<any> = [];

    // 系统提示词：带工具时强化"必须真调工具"的约束（小模型爱用嘴干活）
    let systemPrompt = options.systemPrompt || '';
    const hasTools = !!(options.tools && options.tools.length > 0);
    if (hasTools) {
      systemPrompt = [
        systemPrompt,
        '注意：你可以调用工具（function calling）。需要查看文件、搜索、执行命令时，必须真正发起工具调用，绝不能用文字假装描述工具的执行结果。只有闲聊或总结时才直接回复文字。',
      ].filter(Boolean).join('\n\n');
    }

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of options.messages) {
      // 工具结果消息（Agent 循环回传）
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
        continue;
      }

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

      const entry: { role: string; content: string | string[]; tool_calls?: any[] } = { role: msg.role, content };

      // 助手历史消息若携带工具调用，必须原样带回，模型才能理解上下文
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        entry.tool_calls = msg.toolCalls.map((tc) => ({
          function: {
            name: tc.name,
            arguments: safeParseArgs(tc.arguments),
          },
        }));
      }
      messages.push(entry);
    }

    const body: Record<string, any> = {
      model: options.model,
      messages,
      stream: true,
      options: {
        // 工具调用需要更确定性的输出；高温是小模型乱编参数的常见来源
        temperature: hasTools ? Math.min(options.temperature ?? 0.7, 0.4) : (options.temperature || 0.7),
        num_predict: options.maxTokens || 4096,
        // Ollama 默认 num_ctx=2048，工具定义+历史一塞就截断，模型看起来"变笨"。
        // 显式抬高到 8192（内存允许时显著改善指令遵循）。
        num_ctx: 8192,
        // 小模型容易原地复读，压一压重复
        repeat_penalty: 1.1,
      },
    };

    // Ollama /api/chat 支持 OpenAI 风格的 tools（模型需具备 tools 能力）
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
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
      let toolCallSeq = 0;
      let hasNativeToolCalls = false;

      // 工具调用：Ollama 在 message.tool_calls 里一次性给出（非增量），
      // arguments 可能是对象也可能是 JSON 字符串，统一转成字符串回传
      const emitToolCalls = (data: any): UnifiedStreamChunk[] => {
        const calls = data?.message?.tool_calls;
        if (!Array.isArray(calls) || calls.length === 0) return [];
        hasNativeToolCalls = true;
        return calls.map((tc: any) => ({
          type: 'tool-call' as const,
          toolCall: {
            id: `ollama_${++toolCallSeq}`,
            name: tc?.function?.name || '',
            arguments:
              typeof tc?.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc?.function?.arguments || {}),
          },
        }));
      };

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
              // 纯对话：逐字流式；带工具：缓冲到结束再统一解析（见下方说明）
              if (!hasTools) {
                yield { type: 'text-delta', textDelta: data.message.content };
              }
            }
            for (const chunk of emitToolCalls(data)) {
              yield chunk;
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
            if (!hasTools) {
              yield { type: 'text-delta', textDelta: data.message.content };
            }
          }
          for (const chunk of emitToolCalls(data)) {
            yield chunk;
          }
        } catch { /* skip */ }
      }

      // 带工具的请求：小模型经常不走原生 tool_calls，而是把
      // <tool_call>{...}</tool_call> 或裸 {"name":...} 直接写进正文。
      // 流结束后在全文上做回退解析，把文本转成真正的工具调用，
      // 同时剔除 <think> 思考块，不让噪音进对话流。
      if (hasTools && fullContent) {
        const { calls, text } = extractTextToolCalls(fullContent);
        if (!hasNativeToolCalls && calls.length > 0) {
          for (const c of calls) {
            yield {
              type: 'tool-call',
              toolCall: { id: `ollama_${++toolCallSeq}`, name: c.name, arguments: c.arguments },
            };
          }
        }
        if (text) {
          yield { type: 'text-delta', textDelta: text };
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
        error: { message: (error as Error).message, code: 'OLLAMA_ERROR' },
      };
    }
  }
}
