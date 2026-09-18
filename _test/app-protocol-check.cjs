// app:// 自定义协议实测（临时件）
// 用 Electron 真跑：注册协议 → 加载 dist/renderer → 验证 origin / Worker 可用
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const RENDERER_ROOT = path.join(__dirname, '..', 'dist', 'renderer');
const SCHEME = 'app';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(async () => {
  protocol.handle(SCHEME, async (request) => {
    try {
      const u = new URL(request.url);
      let pathname = decodeURIComponent(u.pathname || '/');
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const resolved = path.normalize(path.join(RENDERER_ROOT, pathname));
      if (!resolved.startsWith(RENDERER_ROOT)) return new Response('forbidden', { status: 403 });
      let file = resolved;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(RENDERER_ROOT, 'index.html');
      return await require('electron').net.fetch(pathToFileURL(file).toString());
    } catch (e) {
      return new Response('err: ' + e.message, { status: 500 });
    }
  });

  // 找一个真实的 worker 资产名（hash 文件名）
  const assetsDir = path.join(RENDERER_ROOT, 'assets');
  const tsWorker = fs.readdirSync(assetsDir).find(f => /^ts\.worker-.+\.js$/.test(f));

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadURL(`${SCHEME}://./index.html`);
  } catch (e) {
    console.log('RESULT:' + JSON.stringify({ fatal: 'loadURL 失败: ' + e.message }));
    app.exit(1);
    return;
  }
  await new Promise(r => setTimeout(r, 2500));

  const js = `(async () => {
    const r = { protocol: location.protocol, origin: location.origin,
                title: document.title, rootChildren: (document.getElementById('root')||{children:[]}).children.length };
    try {
      const resp = await fetch('app://./index.html');
      r.fetchIndex = resp.ok;
    } catch (e) { r.fetchIndex = 'throw: ' + e.message; }
    try {
      const url = new URL('app://./assets/${tsWorker}').href;
      const w = new Worker(url, { type: 'module' });
      r.worker = await new Promise((res) => {
        const timer = setTimeout(() => res('spawned-no-error(3s)'), 3000);
        w.onerror = (e) => { clearTimeout(timer); res('onerror: ' + (e.message || 'unknown')); };
      });
    } catch (e) { r.worker = 'throw: ' + e.message; }
    return JSON.stringify(r);
  })()`;
  const result = await win.webContents.executeJavaScript(js, true);
  console.log('RESULT:' + result);
  app.exit(0);
});
