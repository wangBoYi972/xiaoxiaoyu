/**
 * Token 估算和上下文裁剪测试
 * 测试 chat.ipc.ts 中的 estimateTokens 和 trimMessages 逻辑
 */

describe('Token 估算和上下文裁剪', () => {

  // 直接从源码复制核心逻辑进行独立测试
  function estimateTokens(text) {
    if (Array.isArray(text)) {
      return text.reduce((sum, p) =>
        sum + (typeof p === 'string' ? p.length : JSON.stringify(p).length) / 3, 0);
    }
    return Math.ceil(text.length / 3);
  }

  function trimMessages(messages, maxTokens = 80000) {
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');

    let total = systemMsgs.reduce((s, m) => s + estimateTokens(m.content), 0);
    const kept = [];

    for (let i = otherMsgs.length - 1; i >= 0; i--) {
      const tok = estimateTokens(otherMsgs[i].content);
      if (total + tok > maxTokens && kept.length >= 4) break;
      total += tok;
      kept.unshift(otherMsgs[i]);
    }

    return [...systemMsgs, ...kept];
  }

  describe('estimateTokens', () => {
    it('英文文本 token 估算', () => {
      // 英文 ≈4 chars/token, 我们使用 /3, 所以 30 chars ≈ 10 tokens
      const tokens = estimateTokens('Hello world, this is a test');
      assert(tokens > 0, 'token 估算应 > 0');
      assert(tokens <= Math.ceil('Hello world, this is a test'.length),
        'token 估算不应超过字符数');
    });

    it('中文文本 token 估算', () => {
      // 中文 ≈1.5 chars/token, 使用 /3, 30 chars ≈ 10 tokens
      const chineseText = '这是一段用于测试的中文文本内容';
      const tokens = estimateTokens(chineseText);
      assertEqual(Math.ceil(chineseText.length / 3), tokens);
    });

    it('空文本 token 估算为 0', () => {
      assertEqual(estimateTokens(''), 0);
    });

    it('数组内容 token 估算', () => {
      const parts = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      const tokens = estimateTokens(parts);
      assert(tokens > 0, '数组 token 估算应 > 0');
    });

    it('单字符 token 估算', () => {
      assertEqual(estimateTokens('A'), 1);
      assertEqual(estimateTokens('中'), 1);
    });
  });

  describe('trimMessages - 基本场景', () => {
    it('短上下文不应裁剪', () => {
      const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！有什么可以帮助你的？' },
      ];
      const trimmed = trimMessages(messages);
      assertEqual(trimmed.length, 2, '短上下文应保留所有消息');
    });

    it('应保留 system 消息', () => {
      const messages = [
        { role: 'system', content: '你是一个智能助手，请用中文回答。' },
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！' },
      ];
      const trimmed = trimMessages(messages);
      assertEqual(trimmed[0].role, 'system');
      assertEqual(trimmed.length, 3, '应保留 system + 所有短消息');
    });

    it('至少保留 4 条最新消息', () => {
      const messages = [];
      // 创建大量长消息来触发裁剪
      for (let i = 0; i < 50; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `${'长文本内容'.repeat(500)} 第${i}条消息`,  // 约 3000 chars = 1000 tokens
        });
      }
      const trimmed = trimMessages(messages, 10000); // 限制 10000 tokens
      assert(trimmed.length >= 4, `至少保留4条, 实际 ${trimmed.length}`);
      assert(trimmed.length < 50, `应裁剪部分消息, 实际保留 ${trimmed.length}`);
    });

    it('裁剪应从最旧的消息开始', () => {
      const messages = [
        { role: 'user', content: '第一条消息（应被裁剪）' },
        { role: 'assistant', content: '回复第一条'.repeat(1000) },  // 很长的消息
        { role: 'user', content: '最新消息（应保留）' },
      ];
      const trimmed = trimMessages(messages, 100);
      // 最新消息应保留
      const last = trimmed[trimmed.length - 1];
      assertEqual(last.content, '最新消息（应保留）');
    });
  });

  describe('trimMessages - 边界场景', () => {
    it('空消息列表', () => {
      const trimmed = trimMessages([]);
      assertEqual(trimmed.length, 0);
    });

    it('只有 system 消息', () => {
      const messages = [
        { role: 'system', content: '系统提示词' },
      ];
      const trimmed = trimMessages(messages);
      assertEqual(trimmed.length, 1);
      assertEqual(trimmed[0].role, 'system');
    });

    it('只有一条用户消息', () => {
      const messages = [
        { role: 'user', content: '单独的消息' },
      ];
      const trimmed = trimMessages(messages);
      assertEqual(trimmed.length, 1);
    });

    it('多余 system 消息也只保留', () => {
      const messages = [
        { role: 'system', content: '系统提示词1' },
        { role: 'system', content: '系统提示词2' },
        { role: 'user', content: '用户消息' },
      ];
      const trimmed = trimMessages(messages);
      // 所有 system 消息都应保留
      const systemCount = trimmed.filter(m => m.role === 'system').length;
      assertEqual(systemCount, 2);
    });

    it('非常大的单条消息（超过 maxTokens）仍应保留', () => {
      const messages = [
        { role: 'user', content: 'x'.repeat(300000) },  // ~100k tokens
      ];
      const trimmed = trimMessages(messages, 1000);
      // 即使单条消息超过限制，也会保留（不会在循环中删除当前消息）
      assert(trimmed.length >= 1, '超大消息也应至少保留');
    });
  });

  describe('上下文裁剪 - Token 一致性', () => {
    it('裁剪后的总 token 不应远超过 maxTokens', () => {
      const messages = [];
      for (let i = 0; i < 100; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `${'消息内容 '.repeat(100)} 编号${i}`,
        });
      }
      const maxTokens = 5000;
      const trimmed = trimMessages(messages, maxTokens);

      // 计算实际 tokens
      let actualTokens = 0;
      for (const msg of trimmed) {
        actualTokens += estimateTokens(msg.content);
      }

      // 由于至少保留4条的限制，可能略有超出
      assert(actualTokens <= maxTokens * 2,
        `裁剪后 tokens (${Math.round(actualTokens)}) 不应远超限制 (${maxTokens})`);
    });
  });
});
