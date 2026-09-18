// OpenAI 兼容适配器流式协议实测（临时件）
// 起一个 mock SSE 服务，验证：文本增量合并、tool-call 汇总、done 恰好一次、
// role:'tool' 历史回传格式正确（Agent 循环依赖）。
const http = require('http');
const { OpenAICompatAdapter } = require('../dist/adapters/openai-compat.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
}

let lastBody = null;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    lastBody = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ choices: [{ delta: { role: 'assistant', content: '你好' } }] });
    send({ choices: [{ delta: { content: '，我是' } }] });
    send({ choices: [{ delta: { content: '小小榆。' } }] });
    send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const adapter = new OpenAICompatAdapter(
    { id: 'mock', name: 'mock', apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`, enabled: true, models: [] },
    `http://127.0.0.1:${port}/v1`, []
  );

  console.log('— 普通流式对话 —');
  let text = '', dones = 0, toolCalls = 0;
  for await (const c of adapter.chat({
    model: 'm1',
    messages: [{ role: 'user', content: '打个招呼' }],
    systemPrompt: '你是小小榆',
    temperature: 0.5,
  })) {
    if (c.type === 'text-delta') text += c.textDelta || '';
    if (c.type === 'done') dones++;
    if (c.type === 'tool-call') toolCalls++;
  }
  ok('文本增量完整合并', text === '你好，我是小小榆。', JSON.stringify(text));
  ok('done 恰好一次', dones === 1, String(dones));
  ok('普通对话不产生工具调用', toolCalls === 0);
  ok('请求带 system 提示词', lastBody.messages?.[0]?.role === 'system' && /小小榆/.test(lastBody.messages[0].content));

  console.log('— Agent 工具调用（finish_reason=tool_calls） —');
  // 让 mock 下一轮改成返回 tool_calls
  server.close();
  const server2 = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      lastBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', type: 'function', function: { name: 'read_file', arguments: '{"pa' } }] } }] });
      send({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"src/a.ts"}' } }] } }] });
      send({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise((r) => server2.listen(0, '127.0.0.1', r));
  const port2 = server2.address().port;
  const adapter2 = new OpenAICompatAdapter(
    { id: 'mock', name: 'mock', apiKey: 'k', baseUrl: `http://127.0.0.1:${port2}/v1`, enabled: true, models: [] },
    `http://127.0.0.1:${port2}/v1`, []
  );
  const tools = [{ name: 'read_file', description: '读文件', parameters: { type: 'object', properties: { path: { type: 'string' } } } }];
  text = ''; dones = 0; toolCalls = 0;
  const tcDetails = [];
  for await (const c of adapter2.chat({
    model: 'm1',
    messages: [
      { role: 'user', content: '读一下 a.ts' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_9', name: 'read_file', arguments: '{"path":"src/a.ts"}' }] },
      { role: 'tool', toolCallId: 'call_9', content: '文件内容' },
    ],
    tools,
  })) {
    if (c.type === 'text-delta') text += c.textDelta || '';
    if (c.type === 'done') dones++;
    if (c.type === 'tool-call') { toolCalls++; tcDetails.push(c.toolCall); }
  }
  ok('增量 arguments 正确合并', toolCalls === 1 && tcDetails[0].arguments === '{"path":"src/a.ts"}', JSON.stringify(tcDetails));
  ok('工具名与 id 正确', tcDetails[0]?.name === 'read_file' && tcDetails[0]?.id === 'call_9');
  ok('tools 定义随请求发送', Array.isArray(lastBody.tools) && lastBody.tools[0]?.function?.name === 'read_file');
  ok('assistant.toolCalls 历史带回', lastBody.messages.some((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls[0]?.function?.name === 'read_file'));
  ok('tool 结果消息按 role:tool + tool_call_id 回传', lastBody.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'call_9' && m.content === '文件内容'));

  server2.close();
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
