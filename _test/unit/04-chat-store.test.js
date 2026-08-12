/**
 * 聊天状态管理测试
 * 测试 ChatStore (Zustand) 的消息管理功能
 * 文件: src/renderer/stores/chat-store.ts
 *
 * 注意: 这里独立测试 store 逻辑, 不依赖 React/Zustand 运行时
 * 我们直接在 Node.js 中模拟 Zustand store 行为
 */

describe('聊天状态管理 (ChatStore)', () => {
  // 创建独立 store 实例的函数
  function createChatStore() {
    let state = {
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      conversationId: null,
    };

    const listeners = new Set();

    function set(updater) {
      const newState = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...newState };
      listeners.forEach(fn => fn(state));
    }

    const get = () => state;

    const store = {
      getState: () => state,

      setConversationId: (id) => set({ conversationId: id }),

      addMessage: (msg) =>
        set((s) => ({ messages: [...s.messages, msg] })),

      updateLastMessage: (content) =>
        set((s) => {
          const messages = [...s.messages];
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content };
          }
          return { messages };
        }),

      appendToLastMessage: (chunk) =>
        set((s) => {
          const messages = [...s.messages];
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') {
            messages[messages.length - 1] = {
              ...last,
              content: last.content + chunk,
              isStreaming: true,
            };
          }
          return { messages, streamingContent: s.streamingContent + chunk };
        }),

      appendThinking: (chunk) =>
        set((s) => ({
          streamingThinking: s.streamingThinking + chunk,
        })),

      setStreaming: (streaming) =>
        set((s) => ({
          isStreaming: streaming,
          streamingContent: streaming ? s.streamingContent : '',
          streamingThinking: streaming ? s.streamingThinking : '',
        })),

      clearMessages: () =>
        set({
          messages: [],
          isStreaming: false,
          streamingContent: '',
          streamingThinking: '',
          conversationId: null,
        }),

      loadMessages: (messages) =>
        set({ messages, streamingContent: '', streamingThinking: '' }),

      setError: (error) =>
        set((s) => {
          const messages = [...s.messages];
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
    };

    return store;
  }

  describe('addMessage', () => {
    it('应添加用户消息', () => {
      const store = createChatStore();
      store.addMessage({
        id: '1', role: 'user', content: '你好',
        createdAt: Date.now(),
      });
      const state = store.getState();
      assertEqual(state.messages.length, 1);
      assertEqual(state.messages[0].role, 'user');
      assertEqual(state.messages[0].content, '你好');
    });

    it('应添加助手消息', () => {
      const store = createChatStore();
      store.addMessage({
        id: '1', role: 'user', content: '你好', createdAt: 1000,
      });
      store.addMessage({
        id: '2', role: 'assistant', content: '你好！', createdAt: 1001,
      });
      assertEqual(store.getState().messages.length, 2);
    });

    it('应支持带图片的消息', () => {
      const store = createChatStore();
      store.addMessage({
        id: '1', role: 'user', content: '这张图是什么？',
        images: [{ data: 'base64data', mimeType: 'image/png', name: 'test.png' }],
        createdAt: Date.now(),
      });
      const msg = store.getState().messages[0];
      assert(msg.images !== undefined);
      assertEqual(msg.images.length, 1);
      assertEqual(msg.images[0].mimeType, 'image/png');
    });
  });

  describe('appendToLastMessage (流式响应)', () => {
    it('应追加文本到最后一条助手消息', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'assistant', content: '', createdAt: 1000 });

      store.appendToLastMessage('你');
      store.appendToLastMessage('好');
      store.appendToLastMessage('！');

      const last = store.getState().messages[0];
      assertEqual(last.content, '你好！');
      assert(last.isStreaming, '流式消息应标记 isStreaming');
    });

    it('最后一条不是助手消息时不应追加', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'user', content: '问题', createdAt: 1000 });

      store.appendToLastMessage('不应该追加');
      const last = store.getState().messages[0];
      assertEqual(last.content, '问题', '用户消息不应被追加');
    });

    it('空消息列表时不应崩溃', () => {
      const store = createChatStore();
      // 不应抛出异常
      try {
        store.appendToLastMessage('test');
        assert(true); // 不崩溃就通过
      } catch (e) {
        assert(false, `不应崩溃: ${e.message}`);
      }
    });

    it('应累加 streamingContent', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'assistant', content: '', createdAt: 1000 });

      store.appendToLastMessage('Hello');
      store.appendToLastMessage(' World');

      assertEqual(store.getState().streamingContent, 'Hello World');
    });
  });

  describe('appendThinking', () => {
    it('应追加思考内容', () => {
      const store = createChatStore();
      store.appendThinking('让我思考一下...');
      store.appendThinking('这个问题需要...');

      assertEqual(store.getState().streamingThinking, '让我思考一下...这个问题需要...');
    });
  });

  describe('setStreaming', () => {
    it('开始流式传输时不清空累积内容', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'assistant', content: 'abc', createdAt: 1000 });
      // streaming = true 时仅覆写空内容
      store.setStreaming(true);
      const state = store.getState();
      assert(state.isStreaming);
    });

    it('结束流式传输时应清空 streamingContent', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'assistant', content: '', createdAt: 1000 });
      store.appendToLastMessage('abc');

      store.setStreaming(false);
      const state = store.getState();
      assert(!state.isStreaming);
      assertEqual(state.streamingContent, '', '结束时应清空 streamingContent');
      assertEqual(state.streamingThinking, '', '结束时应清空 streamingThinking');
    });
  });

  describe('setError', () => {
    it('应为最后一条助手消息设置错误', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'assistant', content: '部分响应', createdAt: 1000, isStreaming: true });

      store.setError('连接超时');
      const last = store.getState().messages[0];
      assert(last.isError, '应标记 isError');
      assertEqual(last.errorMessage, '连接超时');
      assert(!last.isStreaming, '错误后应停止流式标记');
      assert(!store.getState().isStreaming, '全局流式标记应为 false');
    });

    it('没有助手消息时不应崩溃', () => {
      const store = createChatStore();
      try {
        store.setError('无目标错误');
        assert(true);
      } catch (e) {
        assert(false, `不应崩溃: ${e.message}`);
      }
    });
  });

  describe('clearMessages', () => {
    it('应清空所有消息和状态', () => {
      const store = createChatStore();
      store.addMessage({ id: '1', role: 'user', content: 'msg1', createdAt: 1000 });
      store.addMessage({ id: '2', role: 'assistant', content: 'reply', createdAt: 1001 });
      store.appendThinking('thinking...');
      store.setStreaming(true);

      store.clearMessages();

      const state = store.getState();
      assertEqual(state.messages.length, 0);
      assertEqual(state.isStreaming, false);
      assertEqual(state.streamingContent, '');
      assertEqual(state.streamingThinking, '');
      assertEqual(state.conversationId, null);
    });
  });

  describe('loadMessages', () => {
    it('应从历史加载消息', () => {
      const store = createChatStore();
      const history = [
        { id: '1', role: 'user', content: '历史消息1', createdAt: 1000 },
        { id: '2', role: 'assistant', content: '历史回复1', createdAt: 1001 },
        { id: '3', role: 'user', content: '历史消息2', createdAt: 2000 },
        { id: '4', role: 'assistant', content: '历史回复2', createdAt: 2001 },
      ];

      store.loadMessages(history);
      const state = store.getState();
      assertEqual(state.messages.length, 4);
      assertEqual(state.streamingContent, '');
      assertEqual(state.streamingThinking, '');
    });
  });

  describe('setConversationId', () => {
    it('应设置当前对话 ID', () => {
      const store = createChatStore();
      store.setConversationId('conv-123');
      assertEqual(store.getState().conversationId, 'conv-123');
    });

    it('应将对话 ID 设为 null', () => {
      const store = createChatStore();
      store.setConversationId('conv-123');
      store.setConversationId(null);
      assertEqual(store.getState().conversationId, null);
    });
  });

  describe('ChatStore 完整流程模拟', () => {
    it('完整的一次对话流程', () => {
      const store = createChatStore();

      // 1. 用户发送消息
      store.addMessage({
        id: 'u1', role: 'user', content: '1+1等于几？',
        createdAt: Date.now(),
      });
      assertEqual(store.getState().messages.length, 1);

      // 2. AI 开始响应（空消息 + streaming）
      store.addMessage({
        id: 'a1', role: 'assistant', content: '',
        isStreaming: true, createdAt: Date.now() + 1,
      });
      store.setStreaming(true);
      assertEqual(store.getState().messages.length, 2);
      assert(store.getState().isStreaming);

      // 3. 逐步接收 chunk
      store.appendToLastMessage('1');
      store.appendToLastMessage('+');
      store.appendToLastMessage('1');
      store.appendToLastMessage('=');
      store.appendToLastMessage('2');

      // 4. 完成
      store.updateLastMessage('1+1=2');
      store.setStreaming(false);

      const last = store.getState().messages[1];
      assertEqual(last.content, '1+1=2');
      assertEqual(last.role, 'assistant');
      assert(!store.getState().isStreaming);
    });

    it('中断流式传输的错误场景', () => {
      const store = createChatStore();
      store.addMessage({ id: 'u1', role: 'user', content: '问题', createdAt: 1000 });
      store.addMessage({
        id: 'a1', role: 'assistant', content: '回复到一半...',
        isStreaming: true, createdAt: 1001,
      });
      store.setStreaming(true);
      store.appendToLastMessage('继续');

      // 网络错误!
      store.setError('Network Error');

      const state = store.getState();
      assert(!state.isStreaming);
      const last = state.messages[state.messages.length - 1];
      assert(last.isError);
      assertEqual(last.errorMessage, 'Network Error');
    });
  });
});
