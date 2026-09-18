// Ollama 适配器工具调用实测（对着本机 Ollama 真跑）
const { OllamaAdapter } = require('E:/ai-chat-desktop/dist/adapters/ollama.js');

const MODEL = process.env.XXY_MODEL || 'xiaoxiaoyu-v1:latest';
const adapter = new OllamaAdapter({
  id: 'ollama', name: 'Ollama', apiKey: '',
  baseUrl: 'http://127.0.0.1:11434', enabled: true, models: [MODEL],
});

const tools = [{
  name: 'list_dir',
  description: '列出指定目录下的文件与子目录。path 为目录路径。',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: '目录路径' } },
    required: ['path'],
  },
}];

(async () => {
  console.log('model =', MODEL);
  const stream = adapter.chat({
    model: MODEL,
    messages: [{ role: 'user', content: '用 list_dir 工具查看 C:/Windows/Logs 目录下有什么文件。必须调用工具，不要直接回答。' }],
    tools,
  });
  let sawToolCall = false, sawDone = false, text = '';
  for await (const c of stream) {
    if (c.type === 'tool-call') {
      sawToolCall = true;
      console.log('TOOL-CALL →', JSON.stringify(c.toolCall));
    } else if (c.type === 'text-delta') {
      text += c.textDelta || '';
    } else if (c.type === 'done') {
      sawDone = true;
      console.log('DONE, usage =', JSON.stringify(c.usage || {}));
    } else {
      console.log('chunk:', c.type, JSON.stringify(c).slice(0, 120));
    }
  }
  console.log('---');
  console.log('文本输出前 120 字:', text.slice(0, 120).replace(/\n/g, ' '));
  console.log('结果:', sawToolCall && sawDone ? 'PASS（收到工具调用 + done）' : `FAIL（tool-call=${sawToolCall}, done=${sawDone}）`);
  process.exit(sawToolCall && sawDone ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
