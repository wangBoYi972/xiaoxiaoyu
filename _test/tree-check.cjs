// 验证主进程 getFileTree 是否返回文件节点（用 stub 顶掉 electron，直接调 IPC handler）
const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');

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

// 指向用户实际打开的那个项目（ruoyi-cloud-vue3/src），最贴近现场
const TARGET = process.env.XXY_TARGET || 'C:/Users/王博弈/Desktop/xm/ruoyi-cloud-vue3/src';

require('E:/ai-chat-desktop/dist/main/ipc/workspace.ipc.js').registerWorkspaceHandlers();

(async () => {
  const getTree = handlers.get('workspace:get-tree');
  const expand = handlers.get('workspace:expand-dir');
  const r = await getTree({}, TARGET);
  console.log('success =', r.success, ' error =', r.error || '-');
  const count = (nodes, acc = { dir: 0, file: 0 }) => {
    for (const n of nodes || []) {
      acc[n.type === 'directory' ? 'dir' : 'file']++;
      if (n.children) count(n.children, acc);
    }
    return acc;
  };
  const c = count(r.fileTree);
  console.log('顶层节点数 =', (r.fileTree || []).length, ' 目录总数 =', c.dir, ' 文件总数 =', c.file);
  console.log('顶层:', (r.fileTree || []).map(n => `${n.name}(${n.type})`).join(', '));
  const api = (r.fileTree || []).find(n => n.name === 'api');
  if (api) console.log('api 子项:', (api.children || []).map(n => `${n.name}(${n.type})`).join(', '));
  const e = await expand({}, TARGET);
  console.log('expandDir 顶层子项:', e.children.map(n => `${n.name}(${n.type})`).join(', '));
})();
