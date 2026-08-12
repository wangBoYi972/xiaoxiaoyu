import { create } from 'zustand';

export interface ImageAttachment {
  data: string;       // base64 (不含 data:xxx;base64, 前缀)
  mimeType: string;   // 例如 image/png
  name: string;       // 文件名
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageAttachment[];  // 用户上传的图片
  thinking?: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorMessage?: string;
  createdAt: number;
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
}));
