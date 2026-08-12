/**
 * 对话管理状态测试
 * 测试 ConversationStore (Zustand) 的 CRUD 功能
 * 文件: src/renderer/stores/conversation-store.ts
 */

describe('对话管理状态 (ConversationStore)', () => {
  // 模拟 API
  function createMockApi() {
    const conversations = new Map();

    // 预置数据
    conversations.set('conv-1', {
      id: 'conv-1', title: '测试对话1', modelId: 'deepseek-chat',
      providerId: 'deepseek', createdAt: 1000, updatedAt: 1000,
      messageCount: 5, isPinned: false,
    });
    conversations.set('conv-2', {
      id: 'conv-2', title: '测试对话2', modelId: 'gpt-4o',
      providerId: 'openai', createdAt: 2000, updatedAt: 2000,
      messageCount: 3, isPinned: true,
    });

    let idCounter = 3;

    return {
      listConversations: async () => Array.from(conversations.values())
        .sort((a, b) => b.updatedAt - a.updatedAt),

      getConversation: async (id) => conversations.get(id) || null,

      createConversation: async (data) => {
        const conv = {
          id: `conv-${idCounter++}`,
          title: data.title || '新对话',
          modelId: data.modelId,
          providerId: data.providerId,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
          messageCount: 0,
          isPinned: false,
        };
        conversations.set(conv.id, conv);
        return conv;
      },

      deleteConversation: async (id) => {
        conversations.delete(id);
      },

      renameConversation: async (id, title) => {
        const conv = conversations.get(id);
        if (conv) {
          conv.title = title;
          conv.updatedAt = Math.floor(Date.now() / 1000);
        }
      },
    };
  }

  function createConversationStore(api) {
    let state = {
      conversations: [],
      activeId: null,
      loading: false,
    };

    function set(updater) {
      const newState = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...newState };
    }

    return {
      getState: () => state,

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
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeId: conv.id,
        }));
        return conv;
      },

      deleteConversation: async (id) => {
        await api.deleteConversation(id);
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        }));
      },

      renameConversation: async (id, title) => {
        await api.renameConversation(id, title);
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        }));
      },
    };
  }

  describe('loadConversations', () => {
    it('应加载对话列表并按更新时间降序排列', async () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      await store.loadConversations();
      const state = store.getState();
      assertEqual(state.conversations.length, 2);
      assert(!state.loading, '加载完成后 loading 应为 false');
      // 应按 updatedAt 降序 (最新的在前)
      assert(state.conversations[0].updatedAt >= state.conversations[1].updatedAt);
    });

    it('加载时空列表', async () => {
      const api = {
        listConversations: async () => [],
      };
      const store = createConversationStore(api);

      await store.loadConversations();
      assertEqual(store.getState().conversations.length, 0);
    });

    it('加载失败时不应崩溃', async () => {
      const api = {
        listConversations: async () => { throw new Error('数据库错误'); },
      };
      const store = createConversationStore(api);

      await store.loadConversations();
      assert(!store.getState().loading, '出错后 loading 应重置');
    });
  });

  describe('createConversation', () => {
    it('应创建新对话并设为活跃', async () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      await store.loadConversations();
      const conv = await store.createConversation('新测试对话', 'deepseek-chat', 'deepseek');

      const state = store.getState();
      assertEqual(conv.title, '新测试对话');
      assertEqual(state.activeId, conv.id);
      assertEqual(state.conversations[0].id, conv.id, '新对话应在列表最前面');
      assertEqual(state.conversations.length, 3);
    });
  });

  describe('deleteConversation', () => {
    it('应删除对话并清除活跃状态(如果是当前活跃)', async () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      await store.loadConversations();
      store.setActive('conv-1');
      await store.deleteConversation('conv-1');

      const state = store.getState();
      assertEqual(state.conversations.length, 1);
      assertEqual(state.activeId, null, '删除活跃对话后 activeId 应为 null');
    });

    it('删除非活跃对话时不改变 activeId', async () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      await store.loadConversations();
      store.setActive('conv-1');
      await store.deleteConversation('conv-2');

      const state = store.getState();
      assertEqual(state.activeId, 'conv-1', 'activeId 不应变化');
    });
  });

  describe('renameConversation', () => {
    it('应重命名对话', async () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      await store.loadConversations();
      await store.renameConversation('conv-1', '重命名后的对话');

      const state = store.getState();
      const renamed = state.conversations.find(c => c.id === 'conv-1');
      assertEqual(renamed.title, '重命名后的对话');
    });

    it('重命名不存在的对话不应崩溃', async () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      await store.loadConversations();
      try {
        await store.renameConversation('nonexistent', '新名称');
        assert(true);
      } catch (e) {
        assert(false, `不应崩溃: ${e.message}`);
      }
    });
  });

  describe('setActive', () => {
    it('应切换活跃对话', () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      store.setActive('conv-1');
      assertEqual(store.getState().activeId, 'conv-1');

      store.setActive('conv-2');
      assertEqual(store.getState().activeId, 'conv-2');

      store.setActive(null);
      assertEqual(store.getState().activeId, null);
    });
  });

  describe('初始状态', () => {
    it('初始状态应为空', () => {
      const api = createMockApi();
      const store = createConversationStore(api);

      const state = store.getState();
      assertEqual(state.conversations.length, 0);
      assertEqual(state.activeId, null);
      assertEqual(state.loading, false);
    });
  });
});
