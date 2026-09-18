// file.ipc 工作区授权沙箱测试（临时件，跑完可删）
// 验证：未经 approveWorkspace 授权的路径一律拒绝，授权后才放行。
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

const fileIpc = require('../dist/main/ipc/file.ipc.js');
fileIpc.registerFileHandlers();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-fileipc-'));
  const workspace = path.join(root, 'ws');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'in.txt'), 'inside', 'utf8');
  const outside = path.join(root, 'out.txt');
  fs.writeFileSync(outside, 'OUTSIDE', 'utf8');

  const readText = handlers.get('file:read-text');
  const write = handlers.get('file:write');
  const listDir = handlers.get('file:list-dir');
  ok('handler 已注册', !!readText && !!write && !!listDir);

  console.log('— 未授权 —');
  ok('未授权状态查询为 false', !fileIpc.isWorkspaceApproved(workspace));
  let r = await readText({}, outside);
  ok('未授权读取被拒', !r.success && /未授权/.test(r.error || ''), r.error);
  r = await write({}, path.join(workspace, 'new.txt'), 'x');
  ok('未授权写入被拒', !r.success && /只能写入工作区/.test(r.error || ''), r.error);

  console.log('— 授权后 —');
  fileIpc.approveWorkspace(workspace);
  ok('授权状态查询为 true', fileIpc.isWorkspaceApproved(workspace));
  r = await readText({}, path.join(workspace, 'in.txt'));
  ok('授权后可读工作区内文件', r.success && r.content === 'inside', r.error || r.content);
  ok('工作区外文件仍被拒', !(await readText({}, outside)).success);
  r = await write({}, path.join(workspace, 'new.txt'), 'written');
  ok('授权后可写工作区内文件', r.success && fs.readFileSync(path.join(workspace, 'new.txt'), 'utf8') === 'written', r.error);
  r = await listDir({}, workspace);
  ok('授权后可列目录', r.success && (r.files || []).some(f => f.name === 'in.txt'));

  console.log('— 撤销授权 —');
  fileIpc.revokeWorkspace(workspace);
  ok('撤销后状态为 false', !fileIpc.isWorkspaceApproved(workspace));
  r = await readText({}, path.join(workspace, 'in.txt'));
  ok('撤销后读取被拒', !r.success && /未授权/.test(r.error || ''), r.error);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
