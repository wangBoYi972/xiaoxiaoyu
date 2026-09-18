// 自定义协议 app:// —— 生产环境渲染层的加载方式
// ────────────────────────────────────────────────────────────
// 为什么不用 loadFile(file://)：
//   file:// 页面是 opaque origin，`new Worker()` 一定被同源策略拦。
//   Monaco 的**语言服务**（TS/JS/JSON/CSS/HTML 的补全、诊断、大纲、sticky scroll）
//   走的是自己的 WorkerManager，不会像基础 editor worker 那样回退主线程，
//   于是打开 .js/.ts 文件时反复抛未捕获异常（2026-09-19 用户实测「js 文件展示不了」）。
//   换成 app:// 这种 standard + secure 的协议后，Worker 正常可用，
//   顺带解锁了 TS 类型级 IntelliSense。
import { app, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { logger } from '../utils/logger';

const SCHEME = 'app';

/**
 * 必须在 app ready 之前调用
 */
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,     // 标准源（有 origin）→ Worker / fetch / localStorage 正常
        secure: true,       // 视为安全上下文
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

let rendererRoot = '';

/**
 * app ready 之后调用。把 app://./xxx 映射到 dist/renderer 下的文件，
 * 未命中的路径回退 index.html（SPA）。
 */
export function registerAppProtocolHandler(): void {
  rendererRoot = path.join(__dirname, '..', '..', 'renderer');

  protocol.handle(SCHEME, async (request) => {
    try {
      const u = new URL(request.url);
      let pathname = decodeURIComponent(u.pathname || '/');
      if (pathname === '/' || pathname === '') pathname = '/index.html';

      const resolved = path.normalize(path.join(rendererRoot, pathname));
      // 防路径穿越
      if (!resolved.startsWith(rendererRoot)) {
        return new Response('forbidden', { status: 403 });
      }

      let file = resolved;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(rendererRoot, 'index.html'); // SPA fallback
      }

      const resp = await net.fetch(pathToFileURL(file).toString());
      // HTML 不缓存（hash 资源交给浏览器缓存）
      if (file.toLowerCase().endsWith('.html')) {
        const headers = new Headers(resp.headers);
        headers.set('Cache-Control', 'no-cache');
        return new Response(resp.body, { status: resp.status, headers });
      }
      return resp;
    } catch (e) {
      logger.error('app:// 请求处理失败:', e instanceof Error ? e : new Error(String(e)));
      return new Response('internal error', { status: 500 });
    }
  });

  logger.info(`app:// 协议已注册，渲染层目录: ${rendererRoot}`);
}

/** 生产环境渲染层入口 URL */
export function getAppRendererURL(): string {
  return `${SCHEME}://./index.html`;
}
