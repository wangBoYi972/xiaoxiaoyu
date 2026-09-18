import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './../src/renderer/styles/global.css';
import './../src/renderer/styles/glass.css';

import { ComposerHeader } from '../src/renderer/components/chat/ComposerHeader';
import { InputArea } from '../src/renderer/components/chat/InputArea';
import TerminalView from '../src/renderer/components/workspace/TerminalView';
import { useWorkspaceStore } from '../src/renderer/stores/workspace-store';
import { useModelStore } from '../src/renderer/stores/model-store';
import { useRunnerStore } from '../src/renderer/stores/runner-store';

/* ============================================================
   Composer UI 验证台
   用于验证：选择目录 / 代码大师 / 启动项目 / 运行面板（终端输出 + 环境探测）
   ============================================================ */

// 伪造 runner：模拟环境探测 + 流式输出（真实实现见 src/main/ipc/runner.ipc.ts）
let fakeTimer: any = null;
const fakeRunner = {
  checkEnv: async () => ({
    success: true,
    env: {
      node: { ok: true, version: 'v22.22.2' },
      java: { ok: true, version: 'java version "17.0.8" 2023-07-18 LTS', home: 'E:\\IntelliJ IDEA 2025.3.3\\jbr' },
      python: { ok: true, version: 'Python 3.13.12' },
      git: { ok: true, version: 'git version 2.47.0.windows.1' },
      maven: { ok: true, version: 'Apache Maven 3.9.12' },
      vars: { JAVA_HOME: 'E:\\IntelliJ IDEA 2025.3.3\\jbr' },
    },
  }),
  start: async (data: { script: string }) => {
    const script = data.script;
    const push = (type: string, d?: string, extra?: any) => {
      const listeners = (window as any).electronAPI.__runnerListeners || [];
      listeners.forEach((cb: any) => cb({ id: 'fake', type, script, ...extra, data: d }));
    };
    if (fakeTimer) clearInterval(fakeTimer);
    const lines = [
      '> xiaoxiaoyu@3.0.9 dev',
      '> concurrently "npm run dev:vite" "npm run dev:electron"',
      '',
      '[dev:vite]',
      '  VITE v6.0.11  ready in 412 ms',
      '',
      '  ➜  Local:   http://localhost:5173/',
      '  ➜  Network: use --host to expose',
      '[dev:electron]',
      '  [info] 主进程已启动 (app:// 协议)',
    ];
    push('start', `npm run ${script}  (concurrently "npm run dev:vite" "npm run dev:electron")`);
    let i = 0;
    fakeTimer = setInterval(() => {
      if (i < lines.length) {
        push(Math.random() > 0.85 ? 'stderr' : 'stdout', lines[i]);
        i++;
      } else if (i === lines.length) {
        push('stderr', '\x1b[33m警告: some warning text with ANSI color\x1b[0m');
        i++;
      }
    }, 300);
    return { success: true, id: 'fake' };
  },
  stop: async () => { if (fakeTimer) clearInterval(fakeTimer); return { success: true }; },
  status: async () => ({ success: true, running: false }),
  onOutput: (cb: any) => {
    const w = window as any;
    w.electronAPI.__runnerListeners = w.electronAPI.__runnerListeners || [];
    w.electronAPI.__runnerListeners.push(cb);
    return () => {
      w.electronAPI.__runnerListeners = (w.electronAPI.__runnerListeners || []).filter((c: any) => c !== cb);
    };
  },
};

// 在组件模块加载前伪造桌面端 API，让 InputArea 的 isElectron 检测通过
(window as any).electronAPI = {
  ...(window as any).electronAPI,
  workspace: { open: async () => ({ success: true, workspace: null }) },
  file: {
    readText: async () => ({ success: false, content: '' }),
  },
  runner: fakeRunner,
};

const Shell: React.FC = () => {
  const [dark, setDark] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);
  const runningScript = useRunnerStore((s) => s.script);

  useEffect(() => {
    // 给 model store 一点默认数据，避免 select 为空
    useModelStore.setState({
      providers: [
        { id: 'openai', name: 'OpenAI', apiKey: '', baseUrl: '', enabled: true, models: [] },
        { id: 'ollama', name: 'Ollama 本地', apiKey: '', baseUrl: '', enabled: true, models: [] },
      ],
      availableModels: [
        { id: 'gpt-4o', displayName: 'GPT-4o', providerId: 'openai' },
        { id: 'qwen2.5:0.5b', displayName: 'Qwen2.5 0.5B', providerId: 'ollama' },
      ],
      activeProviderId: 'openai',
      activeModelId: 'gpt-4o',
    });
  }, []);

  useEffect(() => {
    if (hasWorkspace) {
      useWorkspaceStore.getState().setWorkspace({
        name: '小小榆',
        path: 'E:\\ai-chat-desktop',
        fileTree: [],
      });
      // 伪造桌面端 file API，让「启动项目」能读到 scripts
      (window as any).electronAPI.file.readText = async () => ({
        success: true,
        content: JSON.stringify({
          scripts: {
            dev: 'concurrently "npm run dev:vite" "npm run dev:electron"',
            build: 'npm run build:renderer && npm run build:main',
            pack: 'npm run build && electron-builder --win --x64',
          },
        }),
      });
    } else {
      useWorkspaceStore.getState().setWorkspace(null);
      (window as any).electronAPI.file.readText = async () => ({ success: false, content: '' });
    }
  }, [hasWorkspace]);

  const apply = (isDark: boolean) => {
    const r = document.documentElement;
    r.classList.toggle('theme-dark', isDark);
    r.classList.toggle('theme-light', !isDark);
    r.setAttribute('data-theme', isDark ? 'dark' : 'light');
    r.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', isDark);
    setDark(isDark);
  };

  useEffect(() => { apply(false); }, []);

  return (
    <>
      <div className="wp-root">
        <div className="wp-image" style={{ backgroundImage: 'linear-gradient(140deg,#1b2a5e 0%,#3d1f5c 40%,#0d3b4f 75%,#0a1020 100%)' }} />
        <div className="wp-dim" />
        <div className="wp-glow" />
      </div>

      <div className="app-layer">
        <div className="ws-toolbar g-panel g-sheen" style={{ marginBottom: 0 }}>
          <div className="ws-brand">
            <div className="ws-logo">验</div>
            <span className="ws-brand-name">Composer UI 验证台</span>
          </div>
          <div className="ws-center" />
          <button className="g-chip" onClick={() => apply(!dark)}>
            {dark ? '切到浅色' : '切到深色'}
          </button>
          <button className={`g-chip ${hasWorkspace ? 'on' : ''}`} onClick={() => setHasWorkspace((v) => !v)}>
            {hasWorkspace ? '已加载项目' : '未加载项目'}
          </button>
        </div>

        <div className="chat-root" style={{ justifyContent: 'flex-end', paddingTop: 12, paddingBottom: 12 }}>
          {showTerminal && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 12px 0' }}>
              <TerminalView />
            </div>
          )}
          <div className="chat-composer-wrap">
            <ComposerHeader />
            <InputArea />
          </div>
        </div>

        {/* 验证台自己的控制条 */}
        <div className="ws-toolbar g-panel g-sheen" style={{ marginTop: 0, paddingTop: 6, paddingBottom: 6 }}>
          <button className={`g-chip ${showTerminal ? 'on' : ''}`} onClick={() => setShowTerminal((v) => !v)}>
            运行面板 {showTerminal ? '开' : '关'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
            {runningScript ? `正在模拟运行: ${runningScript}` : '点击下方「启动项目」选一个 script 试跑'}
          </span>
        </div>
      </div>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Shell />);
