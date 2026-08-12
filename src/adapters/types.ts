// 模型适配器统一类型定义

/** 统一消息格式 */
export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' };
}

/** 流式响应块 */
export interface UnifiedStreamChunk {
  type: 'text-delta' | 'thinking-delta' | 'tool-call' | 'done' | 'error';
  textDelta?: string;
  thinkingDelta?: string;
  toolCall?: { id: string; name: string; arguments: string };
  doneReason?: 'stop' | 'length' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
  error?: { message: string; code?: string };
}

/** 模型信息 */
export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  pricing?: { input: number; output: number };
}

/** 聊天请求选项 */
export interface ChatRequestOptions {
  model: string;
  messages: UnifiedMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: ToolDefinition[];
}

/** 工具定义 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 提供商配置 */
export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
  extraHeaders?: Record<string, string>;
}
