// 验证 fs.watch 递归监听行为（与 src/main/ipc/workspace.ipc.ts 的回调逻辑一致）
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-watch-'));
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'a.txt'), '1');

const events = [];
const w = fs.watch(root, { recursive: true, persistent: false }, (type, filename) => {
  if (!filename) return;
  const parts = filename.split(/[\\/]/);
  if (parts.some(p => p === 'node_modules' || p === '.git')) return;
  const full = path.join(root, filename);
  events.push({ type, file: filename.replace(/\\/g, '/'), exists: fs.existsSync(full) });
});

setTimeout(() => fs.writeFileSync(path.join(root, 'src', 'a.txt'), '22'), 200);
setTimeout(() => fs.writeFileSync(path.join(root, 'src', 'b.txt'), 'new'), 400);
setTimeout(() => fs.mkdirSync(path.join(root, 'sub')), 600);
setTimeout(() => fs.rmSync(path.join(root, 'src', 'b.txt')), 800);
setTimeout(() => {
  w.close();
  console.log(JSON.stringify(events, null, 1));
  const ok =
    events.some(e => e.file.includes('a.txt') && e.type === 'change') &&
    events.some(e => e.file.includes('b.txt') && e.type === 'rename' && e.exists) &&
    events.some(e => e.file.includes('b.txt') && e.type === 'rename' && !e.exists) &&
    events.some(e => e.file.includes('sub'));
  console.log(ok ? 'PASS: 改/增/删/建目录 都能收到' : 'FAIL');
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}, 1800);
