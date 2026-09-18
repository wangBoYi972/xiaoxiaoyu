// Agent 循环端到端实测（临时件，跑完可删）
// 起一个假的 OpenAI 兼容服务：第一轮回 tool_calls，第二轮回文本。
// 用真实 AgentRunner（dist 编译产物）跑完整循环，验证：
//   工具真的被执行、tool-result 回传、第二轮拿到工具结果、done 只在最后出现一次。
const Module = require('module');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ---- stub electron ----
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return {
      app: { getPath: () => os.tmpdir(), isReady: () => true },
      ipcMain: { handle() {}, on() {} },
      dialog: {}, contextBridge: {}, BrowserWindow: class {},
      safeStorage: { isEncryptionAvailable: () => false },
    };
  }
  return origLoad.apply(this, arguments);
};

// ---- 临时工作区 ----
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-agent-e2e-'));
fs.writeFileSync(path.join(workspace, 'a.txt'), 'hello');
fs.writeFileSync(path.join(workspace, 'b.txt'), 'world');
fs.writeFileSync(path.join(workspace, 'c.txt'), 'xxy');

// ---- mock OpenAI 兼容服务 ----
let requestCount = 0;
let secondRequestHadToolResult = false;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    requestCount++;
    const parsed = JSON.parse(body);
    const hasToolResult = (parsed.messages || []).some((m) => m.role === 'tool');
    if (requestCount === 1) {
      if (hasToolResult) console.log('✗ 第一轮不该有 tool 结果');
      console.log(`第 1 次请求: ${parsed.messages.length} 条消息, tools=${(parsed.tools || []).length} 个`);
    } else {
      secondRequestHadToolResult = hasToolResult;
      console.log(`第 2 次请求: ${parsed.messages.length} 条消息, 含 tool 结果 = ${hasToolResult}`);
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (requestCount === 1) {
      send({ choices: [{ delta: { role: 'assistant', content: '我先看一下目录。' } }] });
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'list_dir', arguments: '{"path":"."}' } }] } }] });
      send({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
    } else {
      send({ choices: [{ delta: { role: 'assistant', content: '目录里有 3 个文件：a.txt、b.txt、c.txt。' } }] });
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const { AgentRunner } = require('../dist/main/agent/agent-runner.js');
  const { ModelRouter } = require('../dist/adapters/index.js');

  const runner = new AgentRunner(new ModelRouter());
  const chunks = [];
  const stream = runner.run({
    providerId: 'mock-provider',      // 未注册 → 走 OpenAICompatAdapter + 自定义 baseUrl
    modelId: 'mock-model',
    apiKey: 'test-key',
    baseUrl: `http://127.0.0.1:${port}/v1`,
    messages: [{ role: 'user', content: '看看工作区目录里有什么文件' }],
    agentMode: true,
    cwd: workspace,
    onChunk: () => {},
  });

  for await (const chunk of stream) chunks.push(chunk);

  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
  };

  console.log('— 断言 —');
  const toolCalls = chunks.filter(c => c.type === 'tool-call');
  const toolResults = chunks.filter(c => c.type === 'tool-result');
  const dones = chunks.filter(c => c.type === 'done');
  const text = chunks.filter(c => c.type === 'text-delta').map(c => c.textDelta).join('');
  const errors = chunks.filter(c => c.type === 'error');

  ok('两轮模型请求都发生了', requestCount === 2, String(requestCount));
  ok('第二轮请求带回了 tool 结果消息', secondRequestHadToolResult);
  ok('前端收到 tool-call 卡片', toolCalls.length === 1 && toolCalls[0].toolCall.name === 'list_dir', JSON.stringify(toolCalls));
  ok('前端收到 tool-result（成功）', toolResults.length === 1 && toolResults[0].toolResult.success, JSON.stringify(toolResults).slice(0, 150));
  ok('工具结果里真的有工作区文件', /a\.txt/.test(toolResults[0]?.toolResult?.output || ''), toolResults[0]?.toolResult?.output?.slice(0, 100));
  ok('第二轮文本是模型的最终总结', text.includes('3 个文件'), text.slice(0, 80));
  ok('done 只在最后出现一次', dones.length === 1 && chunks[chunks.length - 1].type === 'done', `done 数=${dones.length}`);
  ok('没有任何 error chunk', errors.length === 0, JSON.stringify(errors).slice(0, 150));

  fs.rmSync(workspace, { recursive: true, force: true });
  server.close();
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
