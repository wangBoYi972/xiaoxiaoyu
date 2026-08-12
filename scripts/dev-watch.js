// 开发模式 - 自动编译+重启
// 用法: node scripts/dev-watch.js
// tsc --watch 自动编译 → nodemon 监听 dist/ 变化 → 自动重启 Electron

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

console.log('\n================================================');
console.log('  小小榆 - 自动重启开发模式');
console.log('  修改代码 → 自动编译 → 自动重启');
console.log('================================================\n');

// 清理
try { require('child_process').execSync('taskkill /F /IM 小小榆.exe 2>nul', { stdio: 'ignore' }); } catch {}
try { require('child_process').execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' }); } catch {}
try {
  const lock = path.join(process.env.APPDATA || '', 'xiaoxiaoyu', 'app.lock');
  if (fs.existsSync(lock)) fs.unlinkSync(lock);
} catch {}

// 启动 vite (HMR for renderer)
const vite = spawn('npx', ['vite', '--host'], {
  cwd: ROOT, stdio: 'inherit', shell: true,
});

// tsc --watch 自动编译 main process
const tsc = spawn('npx', ['tsc', '-p', 'tsconfig.main.json', '--watch', '--preserveWatchOutput'], {
  cwd: ROOT, shell: true,
});
tsc.stdout.on('data', d => {
  const s = d.toString();
  if (s.includes('Watching for file changes')) {
    console.log('[tsc] main 编译就绪，监听中...');
  }
});

// tsc --watch 自动编译 server
const tscServer = spawn('npx', ['tsc', '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput'], {
  cwd: ROOT, shell: true,
});

// 简单轮询 dist/main/index.js 的修改时间，变化则重启 electron
let lastMtime = 0;
let electronProc = null;

function startElectron() {
  if (electronProc) {
    try { process.kill(-electronProc.pid); } catch {}
    try { require('child_process').execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' }); } catch {}
    try { require('child_process').execSync('taskkill /F /IM 小小榆.exe 2>nul', { stdio: 'ignore' }); } catch {}
  }

  try {
    const lock = path.join(process.env.APPDATA || '', 'xiaoxiaoyu', 'app.lock');
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  } catch {}

  const electronExe = path.join(ROOT, 'node_modules', '.bin', 'electron.cmd');
  electronProc = spawn('cmd.exe', ['/c', 'start', '', electronExe, '.', '--dev'], {
    cwd: ROOT, stdio: 'ignore', detached: true, shell: true,
  });
  electronProc.unref();
  console.log('\n[electron] 已启动\n');
}

// 每隔 2 秒检查 dist/main/index.js 是否变化
setInterval(() => {
  const distMain = path.join(ROOT, 'dist', 'main', 'index.js');
  try {
    const mtime = fs.statSync(distMain).mtimeMs;
    if (mtime !== lastMtime) {
      lastMtime = mtime;
      if (electronProc) {
        console.log('[watcher] 检测到 main 代码变更，重启 Electron...');
        startElectron();
      }
    }
  } catch {}
}, 2000);

// 先等 vite 启动再开 electron
setTimeout(() => startElectron(), 5000);

// 保持运行
process.on('SIGINT', () => {
  if (electronProc) try { require('child_process').execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' }); } catch {}
  process.exit();
});
