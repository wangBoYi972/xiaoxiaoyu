import { create } from 'zustand';
import api from '../../api';

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isPinned: boolean;
}

interface ConversationStore {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;

  loadConversations: () => Promise<void>;
  setActive: (id: string) => void;
  setActiveId: (id: string) => void;
  createConversation: (title: string, modelId: string, providerId: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  activeId: null,
  loading: false,

  loadConversations: async () => {
    set({ loading: true });
    try {
      // 数据库里 isPinned 是 0/1，这里统一归一化成 boolean
      const conversations = (await api.listConversations()).map((c: any) => ({ ...c, isPinned: !!c.isPinned }));
      set({ conversations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setActive: (id) => set({ activeId: id }),
  setActiveId: (id) => set({ activeId: id }),

  createConversation: async (title, modelId, providerId) => {
    const raw = await api.createConversation({ title, modelId, providerId });
    const conv = { ...raw, isPinned: !!raw.isPinned } as Conversation;
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeId: conv.id,
    }));
    return conv;
  },

  deleteConversation: async (id) => {
    await api.deleteConversation(id);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    }));
  },

  renameConversation: async (id, title) => {
    await api.renameConversation(id, title);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },
}));
