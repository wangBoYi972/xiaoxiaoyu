import { create } from 'zustand';
import api from '../../api';

interface Conversation {
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
      const conversations = await api.listConversations();
      set({ conversations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setActive: (id) => set({ activeId: id }),

  createConversation: async (title, modelId, providerId) => {
    const conv = await api.createConversation({ title, modelId, providerId });
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
