// RAG 管线冒烟测试（纯 Node，不依赖 Electron）
// 验证：切块行号 / 本地哈希向量检索质量 / CJK 分词 / Ollama 可用性
const path = require('path');
const dist = path.join(__dirname, '..', 'dist', 'main', 'rag');
const { chunkText } = require(path.join(dist, 'indexer.js'));
const { embedLocal, cosine, tokenize, probeBackend } = require(path.join(dist, 'embedder.js'));

let pass = true;

// 1) 切块 + 行号
const filler = 'y'.repeat(40);
const text = Array.from({ length: 60 }, (_, i) => 'line ' + (i + 1) + ' 内容 ' + filler).join('\n');
const chunks = chunkText(text, 1200, 200);
const ok1 = chunks.length > 1 && chunks[0].startLine === 1 && chunks[chunks.length - 1].endLine === 60;
console.log('[1] 切块数:', chunks.length,
  '| 首块行:', chunks[0].startLine + '-' + chunks[0].endLine,
  '| 末块行:', chunks[chunks.length - 1].startLine + '-' + chunks[chunks.length - 1].endLine,
  '|', ok1 ? 'PASS' : 'FAIL');
pass = pass && ok1;

// 2) 本地哈希向量检索质量
const docs = [
  '这个文件实现了向量检索的语义搜索功能，包括余弦相似度计算',
  '登录页面的表单校验逻辑在这里，包含邮箱格式和密码强度检查',
  'runner 启动器会 spawn 子进程并继承 JAVA_HOME 环境变量',
];
const q = '向量检索是怎么做的';
const dv = embedLocal(docs);
const qv = embedLocal([q])[0];
const scores = dv.map((v) => cosine(qv, v));
const best = scores.indexOf(Math.max.apply(null, scores));
console.log('[2] 查询:', q);
scores.forEach((s, i) => console.log('     ' + s.toFixed(3) + ' | ' + docs[i].slice(0, 28)));
const ok2 = best === 0;
console.log('[2] 命中正确文档:', ok2 ? 'PASS' : 'FAIL');
pass = pass && ok2;

// 3) CJK 分词
const toks = tokenize('向量检索RAG');
console.log('[3] tokenize:', toks.join(','));
const ok3 = toks.includes('向量') && toks.includes('量检') && toks.includes('rag');
console.log('[3]', ok3 ? 'PASS' : 'FAIL');
pass = pass && ok3;

// 4) Ollama 可用性（不可用会自动降级 local，不算失败）
probeBackend({ backend: 'ollama', ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'nomic-embed-text' })
  .then((r) => console.log('[4] Ollama embedding 可用 →', JSON.stringify(r)))
  .catch((e) => console.log('[4] Ollama 不可用（自动降级 local）:', e.message));

console.log('== 总计 ==', pass ? 'PASS' : 'FAIL');
