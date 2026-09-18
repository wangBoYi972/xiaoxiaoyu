import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './../src/renderer/styles/global.css';
import './../src/renderer/styles/glass.css';

import FileEditor from '../src/renderer/components/workspace/FileEditor';
import FileDiffView from '../src/renderer/components/workspace/FileDiffView';

/* ============================================================
   Monaco 编辑器 / 改动审核 验证台
   ------------------------------------------------------------
   走真实组件（FileEditor 自带 Monaco 装配 + 主题跟随 + 脏标记）。
   浏览器里没有 Electron 主进程，保存走 index.html 里的 stub。
   ============================================================ */

const SAMPLE_TS = `import { createServer } from 'node:http';
import { handleLogin } from './routes/auth';

/**
 * 小小榆 · 本地服务入口
 * 这里只做演示：高亮 / 折叠 / 括号配对 / 多光标 / 查找替换
 */
interface ServerOptions {
  port: number;
  host?: string;
  enableAuth?: boolean;
}

const DEFAULTS: ServerOptions = {
  port: 5199,
  host: '127.0.0.1',
  enableAuth: true,
};

export async function bootstrap(options: Partial<ServerOptions> = {}) {
  const config = { ...DEFAULTS, ...options };

  const server = createServer(async (req, res) => {
    if (config.enableAuth && req.url?.startsWith('/api/auth')) {
      const payload = await readJson(req);
      const result = await handleLogin(payload);
      res.writeHead(result.ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // 演示用：正则、模板串、数字、类型
    const pattern = /^\\/api\\/(?<resource>[a-z]+)$/i;
    const match = req.url?.match(pattern);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(\`matched: \${match?.groups?.resource ?? 'none'} in \${Date.now() - start}ms\`);
  });

  return new Promise<void>((resolve) => {
    server.listen(config.port, config.host, () => {
      console.log(\`✓ 已启动 http://\${config.host}:\${config.port}\`);
      resolve();
    });
  });
}

const start = performance.now();

async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}
`;

const DIFF_ORIGINAL = `    if (!user) {
      res.status(401).json({ error: "bad credentials" });
      return;
    }

    const token = signToken(user.id);
    res.json({ token });
`;

const DIFF_MODIFIED = `    if (!user) {
      logger.warn({ email }, "login failed: no such user");
      res.status(401).json({ code: "AUTH_INVALID", message: "邮箱或密码不正确" });
      return;
    }

    const token = signToken(user.id, { expiresIn: "7d" });
    metrics.increment("auth.login.success");
    res.json({ token, expiresIn: 604800 });
`;

const Shell: React.FC = () => {
  const [dark, setDark] = useState(true);
  const [accepted, setAccepted] = useState<string | null>(null);

  const apply = (isDark: boolean) => {
    const r = document.documentElement;
    r.classList.toggle('theme-dark', isDark);
    r.classList.toggle('theme-light', !isDark);
    r.setAttribute('data-theme', isDark ? 'dark' : 'light');
    r.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', isDark);
    setDark(isDark);
  };

  React.useEffect(() => { apply(true); }, []);

  return (
    <>
      <div className="wp-root">
        <div
          className="wp-image"
          style={{ backgroundImage: 'linear-gradient(140deg,#1b2a5e 0%,#3d1f5c 40%,#0d3b4f 75%,#0a1020 100%)' }}
        />
        <div className="wp-dim" />
        <div className="wp-glow" />
      </div>

      <div className="app-layer">
        <div className="ws-toolbar g-panel g-sheen" style={{ marginBottom: 0 }}>
          <div className="ws-brand">
            <div className="ws-logo">编</div>
            <span className="ws-brand-name">Monaco 验证台</span>
          </div>
          <div className="ws-center" />
          <button className="g-chip" onClick={() => apply(!dark)}>
            {dark ? '切到浅色' : '切到深色'}
          </button>
        </div>

        <div className="ws-main" style={{ gap: 10 }}>
          {/* 左：文件编辑器 */}
          <div className="ws-center-col">
            <div className="ws-content" style={{ minHeight: 0 }}>
              <FileEditor
                tabId="test-tab"
                filePath="E:\\ai-chat-desktop\\src\\server\\index.ts"
                initialContent={SAMPLE_TS}
              />
            </div>
          </div>

          {/* 右：改动审核 */}
          <div className="ws-panel g-panel" style={{ width: 460, flexShrink: 0 }}>
            <FileDiffView
              filePath="src/server/routes/auth.ts"
              original={DIFF_ORIGINAL}
              modified={DIFF_MODIFIED}
              height="100%"
              onAccept={() => setAccepted('已接受改动')}
              onReject={() => setAccepted('已拒绝改动')}
            />
            {accepted && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                {accepted}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Shell />);

/* ------------------------------------------------------------
   调试挂钩（仅验证台使用，不涉及产品代码）
   Monaco 的按键服务跟踪内部修饰键状态，合成的 KeyboardEvent
   进不去；所以暴露 API 来触发需要真实按键才能激活的功能，
   比如查找框（actions.find）和输入（触发脏标记）。
   ------------------------------------------------------------ */
(window as any).__xxyTest = {
  monaco: () => import('monaco-editor'),
  editor: async () => {
    const m = await import('monaco-editor');
    return m.editor.getEditors()[0] || null;
  },
  openFind: async () => {
    const m = await import('monaco-editor');
    const ed = m.editor.getEditors()[0];
    if (!ed) return 'no editor';
    ed.getAction('actions.find')?.run();
    return 'find triggered';
  },
  typeText: async (text: string) => {
    const m = await import('monaco-editor');
    const ed = m.editor.getEditors()[0];
    if (!ed) return 'no editor';
    ed.trigger('test', 'type', { text });
    return 'typed ' + text.length;
  },
};
