// Agent 内置工具沙箱冒烟测试（临时件，跑完可删）
// 用 stub 顶掉 electron，直接在 Node 里验证 builtin-tools 的路径沙箱与命令拦截。
const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return {
      app: { getPath: () => os.tmpdir() },
      ipcMain: { handle() {}, on() {} },
      dialog: {},
      contextBridge: {},
      BrowserWindow: class {},
    };
  }
  return origLoad.apply(this, arguments);
};

const { executeBuiltinTool, getBuiltinToolDefinitions, isBuiltinTool } =
  require('../dist/main/agent/builtin-tools.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-agent-'));
const workspace = path.join(root, 'project');
fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'src', 'a.txt'), 'hello world\nsecond line\n', 'utf8');
fs.writeFileSync(path.join(root, 'outside.txt'), 'SECRET', 'utf8');

const confirmations = [];
const ctx = {
  cwd: workspace,
  requestConfirm: async (title, detail) => {
    confirmations.push({ title, detail });
    return true;
  },
};

(async () => {
  console.log('— 工具定义 —');
  const defs = getBuiltinToolDefinitions();
  const names = defs.map(d => d.name);
  ok('内置工具齐全', ['list_dir', 'read_file', 'write_file', 'edit_file', 'run_command', 'search_files'].every(n => names.includes(n)), names.join(','));
  ok('isBuiltinTool 命中', isBuiltinTool('read_file') && !isBuiltinTool('mcp__x__y'));

  console.log('— 路径沙箱 —');
  let r = await executeBuiltinTool('read_file', { path: '../outside.txt' }, ctx);
  ok('拒绝 ../ 越界读取', !r.success && /越界/.test(r.output), r.output);
  r = await executeBuiltinTool('read_file', { path: path.join(root, 'outside.txt') }, ctx);
  ok('拒绝绝对路径越界读取', !r.success && /越界/.test(r.output), r.output);
  r = await executeBuiltinTool('write_file', { path: '../hacked.txt', content: 'x' }, ctx);
  ok('拒绝越界写入', !r.success && /越界/.test(r.output), r.output);
  ok('越界文件确实未创建', !fs.existsSync(path.join(root, 'hacked.txt')));
  r = await executeBuiltinTool('list_dir', { path: '..' }, ctx);
  ok('拒绝越界列目录', !r.success && /越界/.test(r.output), r.output);

  console.log('— 读写与编辑 —');
  r = await executeBuiltinTool('read_file', { path: 'src/a.txt' }, ctx);
  ok('工作区内读取成功', r.success && /hello world/.test(r.output), r.output?.slice(0, 80));
  r = await executeBuiltinTool('write_file', { path: 'src/b.txt', content: 'created' }, ctx);
  ok('工作区内写入成功', r.success && fs.readFileSync(path.join(workspace, 'src', 'b.txt'), 'utf8') === 'created');
  ok('新建文件先展示统一 diff', confirmations.at(-1)?.title === '应用文件改动' && /--- a\/src\/b\.txt/.test(confirmations.at(-1)?.detail) && /\+created/.test(confirmations.at(-1)?.detail), confirmations.at(-1)?.detail);
  r = await executeBuiltinTool('edit_file', { path: 'src/a.txt', old_string: 'hello world', new_string: 'HELLO' }, ctx);
  ok('edit_file 精确替换', r.success && /HELLO/.test(fs.readFileSync(path.join(workspace, 'src', 'a.txt'), 'utf8')), r.output);
  ok('编辑文件先展示增删 diff', /-hello world/.test(confirmations.at(-1)?.detail) && /\+HELLO/.test(confirmations.at(-1)?.detail), confirmations.at(-1)?.detail);
  r = await executeBuiltinTool('edit_file', { path: 'src/a.txt', old_string: '不存在的字符串', new_string: 'x' }, ctx);
  ok('edit_file 未命中时失败', !r.success, r.output);
  const deniedCtx = { cwd: workspace, requestConfirm: async () => false };
  r = await executeBuiltinTool('write_file', { path: 'src/rejected.txt', content: 'nope' }, deniedCtx);
  ok('拒绝后不创建文件', !r.success && !fs.existsSync(path.join(workspace, 'src', 'rejected.txt')), r.output);
  const beforeDeniedEdit = fs.readFileSync(path.join(workspace, 'src', 'a.txt'), 'utf8');
  r = await executeBuiltinTool('edit_file', { path: 'src/a.txt', old_string: 'HELLO', new_string: 'NOPE' }, deniedCtx);
  ok('拒绝后不修改文件', !r.success && fs.readFileSync(path.join(workspace, 'src', 'a.txt'), 'utf8') === beforeDeniedEdit, r.output);
  r = await executeBuiltinTool('list_dir', { path: 'src' }, ctx);
  ok('list_dir 列出内容', r.success && /a\.txt/.test(r.output), r.output?.slice(0, 80));
  r = await executeBuiltinTool('search_files', { query: 'a.txt', path: '.' }, ctx);
  ok('search_files 搜索成功', r.success && /a\.txt/.test(r.output), r.output?.slice(0, 120));
  r = await executeBuiltinTool('不存在的工具', {}, ctx);
  ok('未知工具返回失败', !r.success && /未知工具/.test(r.output));

  console.log('— 命令执行与拦截 —');
  r = await executeBuiltinTool('run_command', { command: 'echo agent-ok' }, ctx);
  ok('run_command 正常执行', r.success && /agent-ok/.test(r.output), r.output);
  r = await executeBuiltinTool('run_command', { command: 'ssh user@host' }, ctx);
  ok('拦截 ssh', !r.success && /安全策略/.test(r.output), r.output);
  r = await executeBuiltinTool('run_command', { command: 'diskpart' }, ctx);
  ok('拦截 diskpart', !r.success && /安全策略/.test(r.output), r.output);
  r = await executeBuiltinTool('run_command', { command: 'echo x && pause' }, ctx);
  ok('拦截交互式命令', !r.success && /安全策略/.test(r.output), r.output);
  r = await executeBuiltinTool('run_command', { command: 'echo y' }, { cwd: workspace, requestConfirm: async () => false });
  ok('用户拒绝后不执行', !r.success && /拒绝/.test(r.output), r.output);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
