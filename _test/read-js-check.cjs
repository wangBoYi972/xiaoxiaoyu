// 复现「打开 .js 文件」链路：authorize → read-text（真实 dist 产物 + electron stub）
const Module = require('module');
const os = require('os');
const handlers = new Map();
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return {
      app: { getPath: () => os.tmpdir(), isReady: () => true },
      ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: () => {} },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      BrowserWindow: class {}, contextBridge: {},
    };
  }
  return origLoad.apply(this, arguments);
};

const WS = process.env.XXY_WS || 'C:/Users/王博弈/Desktop/项目源码/top-cloud';
const FILES = process.env.XXY_FILES ? process.env.XXY_FILES.split('|') : [];

require('E:/ai-chat-desktop/dist/main/ipc/file.ipc.js').registerFileHandlers();
const { approveWorkspace } = require('E:/ai-chat-desktop/dist/main/ipc/file.ipc.js');
const tree = require('E:/ai-chat-desktop/dist/main/ipc/workspace.ipc.js');
tree.registerWorkspaceHandlers();

(async () => {
  approveWorkspace(WS.replace(/\//g, '\\'));
  const readText = handlers.get('file:read-text');

  // 若没指定文件，就从文件树里挑几个 .js
  let targets = FILES;
  if (!targets.length) {
    const r = await handlers.get('workspace:get-tree')({}, WS);
    const js = [];
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.type === 'file' && /\.(js|mjs|cjs)$/i.test(n.name)) js.push(n.path);
        if (n.children) walk(n.children);
      }
    };
    walk(r.fileTree);
    targets = js.slice(0, 3);
    console.log('树里 js 文件数:', js.length, '抽样:', targets.length);
  }

  for (const f of targets) {
    const r = await readText({}, f);
    console.log(
      r.success
        ? `✓ 读取成功 ${f.split(/[\\/]/).pop()}  ${r.content.length} 字符`
        : `✗ 读取失败 ${f}  → ${r.error}`
    );
  }
})();
