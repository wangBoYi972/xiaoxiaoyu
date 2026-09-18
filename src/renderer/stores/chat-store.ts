import { create } from 'zustand';
import type { ToolCallInfo } from '../components/chat/ToolCallBlock';
import type { PermissionRequest } from '../components/chat/PermissionCard';
import type { MessageSegment } from '../components/chat/MessageBubble';

// 注意：以上全是 type-only import，编译后会被擦除，不会产生运行时循环依赖。

export interface ImageAttachment {
  data: string;       // base64 (不含 data:xxx;base64, 前缀)
  mimeType: string;   // 例如 image/png
  name: string;       // 文件名
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageAttachment[];  // 用户上传的图片
  thinking?: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorMessage?: string;
  createdAt: number;

  /* ---------- Agent 模式字段 ----------
     Agent 循环产出这些数据后，MessageBubble 才能渲染出
     思考块 → 文本 → 工具调用块 交错的结构。
     没有它们时 MessageBubble 会走 content 的兜底渲染。 */
  /** 有序内容片段（有则优先按它渲染） */
  segments?: MessageSegment[];
  /** 工具调用集合，key 为 toolCallId */
  toolCalls?: Record<string, ToolCallInfo>;
  /** 待用户确认的权限请求 */
  permission?: PermissionRequest;
}

interface ChatStore {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  conversationId: string | null;

  setConversationId: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  appendToLastMessage: (chunk: string) => void;
  appendThinking: (chunk: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
  loadMessages: (messages: ChatMessage[]) => void;
  setError: (error: string) => void;

  /* ---------- Agent 模式写入接口 ---------- */
  /** 追加一个内容片段（文本 / 思考 / 工具引用），保持交错顺序 */
  appendSegment: (messageId: string, segment: MessageSegment) => void;
  /** 新增或更新一次工具调用（运行中 → 成功/失败） */
  upsertToolCall: (messageId: string, call: ToolCallInfo) => void;
  /** 挂载/清除某条消息上的权限请求（传 null 表示已处理完） */
  setPermission: (messageId: string, request: PermissionRequest | null) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',
  conversationId: null,

  setConversationId: (id) => set({ conversationId: id }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content };
      }
      return { messages };
    }),

  appendToLastMessage: (chunk) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + chunk,
          isStreaming: true,
        };
      }
      return { messages, streamingContent: state.streamingContent + chunk };
    }),

  appendThinking: (chunk) =>
    set((state) => ({
      streamingThinking: state.streamingThinking + chunk,
    })),

  setStreaming: (streaming) =>
    set((state) => ({ isStreaming: streaming, streamingContent: streaming ? state.streamingContent : '', streamingThinking: streaming ? state.streamingThinking : '' })),

  clearMessages: () =>
    set({ messages: [], isStreaming: false, streamingContent: '', streamingThinking: '', conversationId: null }),

  loadMessages: (messages) =>
    set({ messages, streamingContent: '', streamingThinking: '' }),

  setError: (error) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          isStreaming: false,
          isError: true,
          errorMessage: error,
        };
      }
      return { messages, isStreaming: false };
    }),

  /* ---------- Agent 模式写入 ---------- */

  appendSegment: (messageId, segment) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, segments: [...(m.segments || []), segment] } : m
      ),
    })),

  upsertToolCall: (messageId, call) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? { ...m, toolCalls: { ...(m.toolCalls || {}), [call.id]: call } }
          : m
      ),
    })),

  setPermission: (messageId, request) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        // 传 null 表示已处理完，清掉字段避免残留卡片
        if (!request) {
          const { permission, ...rest } = m;
          return rest;
        }
        return { ...m, permission: request };
      }),
    })),
}));
