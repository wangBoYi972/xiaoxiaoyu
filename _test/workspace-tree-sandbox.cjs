// workspace.ipc 递归文件树 + 文件读取沙箱测试
// 验证：workspace:get-tree 返回【完整递归树】（多级 children），
//       且 file:read-text 能正确读取工作区内文件。
// mock electron，直接跑编译后的 dist/main/ipc/*.js，不起真实 Electron。
const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');

const handlers = new Map();
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return {
      app: { getPath: () => os.tmpdir() },
      ipcMain: {
        handle: (ch, fn) => handlers.set(ch, fn),
        on: () => {},
      },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      BrowserWindow: class {},
      contextBridge: {},
    };
  }
  return origLoad.apply(this, arguments);
};

// workspace.ipc 依赖 file.ipc 的 approveWorkspace/revokeWorkspace
const fileIpc = require('../dist/main/ipc/file.ipc.js');
const workspaceIpc = require('../dist/main/ipc/workspace.ipc.js');
fileIpc.registerFileHandlers();
workspaceIpc.registerWorkspaceHandlers();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ' → ' + extra : ''}`); }
}

// 递归收集某个节点的所有 path，便于断言
function collectPaths(nodes, out = []) {
  for (const n of nodes) {
    out.push(n.path);
    if (n.children) collectPaths(n.children, out);
  }
  return out;
}
function findNode(nodes, name) {
  for (const n of nodes) {
    if (n.name === name) return n;
    if (n.children) { const f = findNode(n.children, name); if (f) return f; }
  }
  return null;
}

(async () => {
  // 构造多层目录
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-tree-'));
  const ws = path.join(root, 'proj');
  fs.mkdirSync(path.join(ws, 'src', 'nested'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  fs.writeFileSync(path.join(ws, 'src', 'nested', 'deep.ts'), 'export const deep = true;\n', 'utf8');
  fs.writeFileSync(path.join(ws, 'docs', 'readme.md'), '# readme\n', 'utf8');
  fs.writeFileSync(path.join(ws, 'package.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(ws, '.hidden.txt'), 'hidden', 'utf8');
  fs.writeFileSync(path.join(ws, 'node_modules', 'x.js'), 'ignore', 'utf8');

  const getTree = handlers.get('workspace:get-tree');
  const expandDir = handlers.get('workspace:expand-dir');
  const readText = handlers.get('file:read-text');
  ok('handler 已注册', !!getTree && !!expandDir && !!readText);

  console.log('— 递归全量树 —');
  let r = await getTree({}, ws);
  ok('get-tree 返回成功', r.success, r.error);
  const tree = r.fileTree || [];

  const topNames = tree.map(n => n.name);
  ok('顶层含目录 src/docs', topNames.includes('src') && topNames.includes('docs'), topNames.join(','));
  ok('顶层含文件 package.json', topNames.includes('package.json'));
  ok('跳过 .hidden', !topNames.includes('.hidden.txt'));
  ok('跳过 node_modules', !topNames.includes('node_modules'));

  // 递归多级
  const srcNode = findNode(tree, 'src');
  ok('src 是目录', srcNode && srcNode.type === 'directory');
  const nested = srcNode ? findNode(srcNode.children || [], 'nested') : null;
  ok('src 下有 nested 目录', !!nested, nested && nested.type);
  const deep = nested ? findNode(nested.children || [], 'deep.ts') : null;
  ok('第3层 deep.ts 已递归到', !!deep && deep.type === 'file');
  const a = srcNode ? findNode(srcNode.children || [], 'a.ts') : null;
  ok('src 下有 a.ts 文件', !!a && a.type === 'file');

  // 目录在前、文件在后
  const dirsFirst = tree.every((n, i) => {
    if (n.type === 'file') return tree.slice(i + 1).every(m => m.type === 'file');
    return true;
  });
  ok('目录排在文件前', dirsFirst);

  const all = collectPaths(tree);
  ok('总节点数合理(>5)', all.length >= 5, '共 ' + all.length);

  console.log('— 文件读取 —');
  fileIpc.approveWorkspace(ws);
  let fr = await readText({}, path.join(ws, 'src', 'a.ts'));
  ok('读 a.ts 内容正确', fr.success && fr.content === 'export const a = 1;\n', fr.error || fr.content);
  ok('工作区外仍被拒', !(await readText({}, path.join(root, 'outside.txt'))).success);

  console.log('— 懒加载向后兼容 —');
  let er = await expandDir({}, path.join(ws, 'docs'));
  ok('expand-dir 仍可用', er.success && (er.children || []).some(c => c.name === 'readme.md'), er.error);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('脚本异常:', e); process.exit(1); });
