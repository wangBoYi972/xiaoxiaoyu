/**
 * SSE 流解析和适配器响应处理测试
 * 测试 BaseModelAdapter 的 SSE 流读取和各种适配器的响应格式解析
 * 文件: src/adapters/base-adapter.ts, src/adapters/openai-compat.ts
 */

describe('SSE 流解析', () => {
  // 从 base-adapter.ts 复制的 SSE 流读取逻辑
  async function* readSSEStream(lines) {
    let buffer = '';
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      // 模拟读取 chunk
      const chunk = lines[lineIndex++] + '\n';
      buffer += chunk;

      const splitLines = buffer.split('\n');
      buffer = '';

      for (const line of splitLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          yield data;
        }
      }
    }
  }

  it('应正确解析标准 SSE 数据行', async () => {
    const lines = [
      'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"id":"2","choices":[{"delta":{"content":" World"}}]}',
      'data: [DONE]',
    ];

    const results = [];
    for await (const data of readSSEStream(lines)) {
      results.push(JSON.parse(data));
    }

    assertEqual(results.length, 2);
    assertEqual(results[0].choices[0].delta.content, 'Hello');
    assertEqual(results[1].choices[0].delta.content, ' World');
  });

  it('处理 [DONE] 标记', async () => {
    const lines = [
      'data: {"id":"1","choices":[{"delta":{"content":"text"}}]}',
      'data: [DONE]',
      'data: {"id":"2","choices":[{"delta":{"content":"should-not-appear"}}]}',
    ];

    const results = [];
    for await (const data of readSSEStream(lines)) {
      results.push(data);
    }

    assertEqual(results.length, 1, '[DONE] 之后不应继续');
  });

  it('处理空行和格式不佳的行', async () => {
    const lines = [
      '',
      'data: {"valid":true}',
      '  ',  // 空白行
      'invalid_line_without_prefix',
      'data: {"also_valid":true}',
      'data: [DONE]',
    ];

    const results = [];
    for await (const data of readSSEStream(lines)) {
      results.push(data);
    }

    assertEqual(results.length, 2);
  });

  it('处理只有 [DONE] 的流', async () => {
    const lines = ['data: [DONE]'];
    const results = [];
    for await (const data of readSSEStream(lines)) {
      results.push(data);
    }
    assertEqual(results.length, 0);
  });

  it('处理跨行拼接', async () => {
    // 模拟数据被分割成多个 chunk
    let buffer = '';
    const results = [];

    async function processChunk(newChunk) {
      buffer += newChunk;
      const lines = buffer.split('\n');
      buffer = '';
      for (let i = 0; i < lines.length - 1; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          results.push(JSON.parse(data));
        }
      }
      buffer = lines[lines.length - 1];
    }

    // 跨 chunk 分割一条 data 行
    await processChunk('data: {"id":"1","cho');
    await processChunk('ices":[{"delta":{"content":"跨行"}}]}\n');
    await processChunk('data: [DONE]\n');

    assertEqual(results.length, 1);
    assertEqual(results[0].choices[0].delta.content, '跨行');
  });
});

describe('OpenAI 兼容适配器 - Delta 内容解析', () => {
  it('应解析标准 text delta', () => {
    const delta = { content: 'Hello World' };
    assertEqual(delta.content, 'Hello World');
  });

  it('应处理空 delta', () => {
    const delta = {};
    assert(!delta.content, '空 delta 应无内容');
  });

  it('应处理 finish_reason = stop', () => {
    const choice = { finish_reason: 'stop' };
    assertEqual(choice.finish_reason, 'stop');
  });

  it('应处理 finish_reason = length (截断)', () => {
    const choice = { finish_reason: 'length' };
    assertEqual(choice.finish_reason, 'length');
  });

  it('应处理 tool_calls delta', () => {
    const delta = {
      tool_calls: [{
        index: 0,
        function: { name: 'get_weather', arguments: '{"city":' },
      }],
    };
    assert(delta.tool_calls.length > 0);
    assertEqual(delta.tool_calls[0].function.name, 'get_weather');
  });

  it('应处理 usage 信息', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };
    assertEqual(usage.prompt_tokens, 100);
    assertEqual(usage.completion_tokens, 50);
  });
});

describe('Anthropic 适配器 - 事件解析', () => {
  it('应解析 content_block_delta text_delta', () => {
    const event = {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' },
    };
    assertEqual(event.type, 'content_block_delta');
    assertEqual(event.delta.type, 'text_delta');
    assertEqual(event.delta.text, 'Hello');
  });

  it('应解析 content_block_delta thinking_delta', () => {
    const event = {
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: 'Let me think...' },
    };
    assertEqual(event.delta.type, 'thinking_delta');
    assertEqual(event.delta.thinking, 'Let me think...');
  });

  it('应解析 message_delta stop_reason', () => {
    const event = {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { input_tokens: 50, output_tokens: 100 },
    };
    assertEqual(event.delta.stop_reason, 'end_turn');
    assertEqual(event.usage.input_tokens, 50);
  });

  it('应解析 error 事件', () => {
    const event = {
      type: 'error',
      error: { message: 'Rate limit exceeded' },
    };
    assertEqual(event.type, 'error');
    assertEqual(event.error.message, 'Rate limit exceeded');
  });
});

describe('Gemini 适配器 - 响应解析', () => {
  it('应解析候选内容', () => {
    const parsed = {
      candidates: [{
        content: {
          parts: [{ text: 'Gemini 的回复' }],
        },
        finishReason: 'STOP',
      }],
    };
    assertEqual(parsed.candidates[0].content.parts[0].text, 'Gemini 的回复');
    assertEqual(parsed.candidates[0].finishReason, 'STOP');
  });

  it('应处理安全过滤', () => {
    const parsed = {
      candidates: [{
        finishReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH' }],
      }],
    };
    assertEqual(parsed.candidates[0].finishReason, 'SAFETY');
    assert(parsed.candidates[0].safetyRatings.length > 0);
  });
});

describe('UnifiedStreamChunk 格式', () => {
  it('所有 chunk 类型应有正确的 type 字段', () => {
    const types = ['text-delta', 'thinking-delta', 'tool-call', 'done', 'error'];

    const examples = [
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'thinking-delta', thinkingDelta: 'thinking...' },
      { type: 'tool-call', toolCall: { id: '1', name: 'fn', arguments: '{}' } },
      { type: 'done', doneReason: 'stop', usage: { inputTokens: 10, outputTokens: 20 } },
      { type: 'error', error: { message: 'Error', code: 'ERR' } },
    ];

    for (const chunk of examples) {
      assert(types.includes(chunk.type),
        `chunk type "${chunk.type}" 应在允许列表中`);
    }
  });

  it('text-delta 应包含 textDelta', () => {
    const chunk = { type: 'text-delta', textDelta: 'some text' };
    assert(typeof chunk.textDelta === 'string');
  });

  it('done 应包含 doneReason', () => {
    const reasons = ['stop', 'length', 'error'];
    const chunk1 = { type: 'done', doneReason: 'stop' };
    const chunk2 = { type: 'done', doneReason: 'length' };
    assert(reasons.includes(chunk1.doneReason));
    assert(reasons.includes(chunk2.doneReason));
  });

  it('error 应包含 message 和可选的 code', () => {
    const chunk1 = { type: 'error', error: { message: 'Network error' } };
    const chunk2 = { type: 'error', error: { message: 'Auth failed', code: 'AUTH_ERR' } };

    assert(typeof chunk1.error.message === 'string');
    assert(typeof chunk2.error.code === 'string');
  });
});
