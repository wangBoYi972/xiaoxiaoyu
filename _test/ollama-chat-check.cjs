// Ollama 适配器普通对话回归（不带 tools，确认改动没破坏原链路）
const { OllamaAdapter } = require('E:/ai-chat-desktop/dist/adapters/ollama.js');
const MODEL = process.env.XXY_MODEL || 'xiaoxiaoyu-v1:latest';
const adapter = new OllamaAdapter({
  id: 'ollama', name: 'Ollama', apiKey: '',
  baseUrl: 'http://127.0.0.1:11434', enabled: true, models: [MODEL],
});
(async () => {
  let text = '', sawDone = false, sawToolCall = false;
  const stream = adapter.chat({
    model: MODEL,
    messages: [{ role: 'user', content: '用一句话介绍你自己。' }],
  });
  for await (const c of stream) {
    if (c.type === 'text-delta') text += c.textDelta || '';
    else if (c.type === 'done') sawDone = true;
    else if (c.type === 'tool-call') sawToolCall = true;
  }
  console.log('回复前 100 字:', text.slice(0, 100).replace(/\n/g, ' '));
  console.log(sawDone && text.trim() && !sawToolCall ? 'PASS：普通对话正常' : 'FAIL');
  process.exit(sawDone && text.trim() ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
