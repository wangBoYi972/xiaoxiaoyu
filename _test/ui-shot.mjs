// 通过 CDP 直连无头 Chrome 截图，零依赖（仅用 Node 内置 + 手写 WebSocket 帧）
// 用法: node ui-shot.mjs <url> <outPng> [evalScript]
//   evalScript 在页面上下文执行，支持 await（已开 awaitPromise）
// 环境变量: CDP_PORT 覆盖调试端口（默认 9333），多会话并存时用

import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { URL } from 'node:url';

const [, , targetUrl, outPath, evalScript] = process.argv;
const CDP_PORT = Number(process.env.CDP_PORT || 9333);

if (!targetUrl || !outPath) {
  console.error('用法: node ui-shot.mjs <url> <outPng> [evalScript]');
  console.error('环境变量: CDP_PORT=<端口>  默认 9333');
  process.exit(2);
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

// 最小 WebSocket 客户端
function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname} HTTP/1.1\r\n` +
          `Host: ${u.host}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let handshakeDone = false;
    let buf = Buffer.alloc(0);
    const handlers = [];
    let id = 0;
    const pending = new Map();

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshakeDone) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        if (!buf.slice(0, idx).toString().includes('101')) {
          return reject(new Error('WS handshake failed'));
        }
        buf = buf.slice(idx + 4);
        handshakeDone = true;
        resolve({
          send(method, params) {
            const msgId = ++id;
            const payload = JSON.stringify({ id: msgId, method, params });
            const data = Buffer.from(payload);
            const mask = crypto.randomBytes(4);
            const masked = Buffer.alloc(data.length);
            for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
            let header;
            if (data.length < 126) {
              header = Buffer.alloc(6);
              header[0] = 0x81;
              header[1] = 0x80 | data.length;
              mask.copy(header, 2);
            } else if (data.length < 65536) {
              header = Buffer.alloc(8);
              header[0] = 0x81;
              header[1] = 0x80 | 126;
              header.writeUInt16BE(data.length, 2);
              mask.copy(header, 4);
            } else {
              header = Buffer.alloc(14);
              header[0] = 0x81;
              header[1] = 0x80 | 127;
              header.writeBigUInt64BE(BigInt(data.length), 2);
              mask.copy(header, 10);
            }
            sock.write(Buffer.concat([header, masked]));
            return new Promise((res2, rej2) => pending.set(msgId, { res2, rej2 }));
          },
          on(fn) { handlers.push(fn); },
          close() { sock.end(); },
        });
      }
      // 解析帧
      while (buf.length >= 2) {
        const len0 = buf[1] & 0x7f;
        let off = 2;
        let len = len0;
        if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len).toString();
        buf = buf.slice(off + len);
        try {
          const msg = JSON.parse(payload);
          if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.rej2(new Error(JSON.stringify(msg.error)));
            else p.res2(msg.result);
          } else if (msg.method) {
            handlers.forEach((h) => h(msg));
          }
        } catch {}
      }
    });
    sock.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取整页尺寸作为截图 clip（配合 captureBeyondViewport 用） */
async function fullPageClip(cdp) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      w: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    })`,
    returnByValue: true,
  });
  const { w, h } = JSON.parse(r.result.value);
  // CDP 对超长图有限制，超过 16000px 截断（浏览器端也会丢内容）
  return { x: 0, y: 0, width: w, height: Math.min(h, 16000), scale: 1 };
}

(async () => {
  const targets = await httpGet('/json/list');
  let page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const cdp = await wsConnect(page.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 视口尺寸：VIEWPORT_W / VIEWPORT_H 覆盖，默认 1440x900
  const vpW = Number(process.env.VIEWPORT_W || 1440);
  const vpH = Number(process.env.VIEWPORT_H || 900);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: vpW, height: vpH, deviceScaleFactor: 1, mobile: false,
  });

  await cdp.send('Page.navigate', { url: targetUrl });
  await sleep(Number(process.env.WAIT_MS || 4500));

  if (evalScript) {
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: evalScript, awaitPromise: true, returnByValue: true,
      });
      console.log('EVAL:', JSON.stringify(r.result?.value ?? r.result));
    } catch (e) {
      console.log('EVAL ERROR:', e.message);
    }
    await sleep(Number(process.env.POST_EVAL_WAIT_MS || 1200));
  }

  // FULL_PAGE=1 时整页截图（配合 VIEWPORT_H 调高视口可避免超长图被压缩）
  const fullPage = process.env.FULL_PAGE === '1';
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
    ...(fullPage ? { clip: await fullPageClip(cdp) } : {}),
  });
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', outPath, fs.statSync(outPath).size, 'bytes', fullPage ? '(full page)' : '');

  // 顺带输出页面诊断信息
  const diag = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      url: location.href,
      bodyClass: document.body.className,
      htmlClass: document.documentElement.className,
      wpRoot: !!document.querySelector('.wp-root'),
      wsRoot: !!document.querySelector('.ws-root'),
      appLayer: !!document.querySelector('.app-layer'),
      glassPanels: document.querySelectorAll('.g-panel,.g-panel-strong,.g-subtle').length,
      composer: !!document.querySelector('.composer-input'),
      rootText: (document.body.innerText||'').slice(0,300)
    })`,
    returnByValue: true,
  });
  console.log('DIAG:', diag.result.value);

  cdp.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
