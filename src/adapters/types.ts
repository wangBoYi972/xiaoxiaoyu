// 模型适配器统一类型定义

/** 工具调用（assistant 消息携带） */
export interface ToolCallPayload {
  id: string;
  name: string;
  arguments: string;
}

/** 统一消息格式 */
export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  /** assistant 消息携带的工具调用 */
  toolCalls?: ToolCallPayload[];
  /** tool 消息对应的调用 ID */
  toolCallId?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' };
}

/** 流式响应块 */
export interface UnifiedStreamChunk {
  type: 'text-delta' | 'thinking-delta' | 'tool-call' | 'tool-result' | 'done' | 'error';
  textDelta?: string;
  thinkingDelta?: string;
  toolCall?: { id: string; name: string; arguments: string };
  /** Agent 执行完工具后回传给前端的结构化结果 */
  toolResult?: { id: string; name: string; success: boolean; output: string };
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
