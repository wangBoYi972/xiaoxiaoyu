import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useWorkspaceStore } from '../../stores/workspace-store';

/**
 * 标准交互终端。
 * 不重绘 shell 的提示符、日志或输入框；原始内容均由系统 shell 输出。
 */
const TerminalView: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspace?.path);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const terminalApi = window.electronAPI?.terminal;
    if (!host || !terminalApi) {
      setError('真实终端仅在桌面版中可用');
      return;
    }
    if (!workspacePath) {
      setError('请先打开项目目录');
      return;
    }

    let cancelled = false;
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      scrollback: 10_000,
      fontFamily: "Cascadia Mono, Consolas, 'Microsoft YaHei UI', monospace",
      fontSize: 14,
      lineHeight: 1.35,
      theme: {
        background: '#161718', foreground: '#f2f2f2', cursor: '#f2f2f2', cursorAccent: '#161718',
        selectionBackground: '#4f77b766', black: '#161718', brightBlack: '#8a8d91',
        red: '#e06c75', brightRed: '#f07178', green: '#98c379', brightGreen: '#a9d18e',
        yellow: '#e5c07b', brightYellow: '#f0c674', blue: '#61afef', brightBlue: '#82aaff',
        magenta: '#c678dd', brightMagenta: '#d7aefb', cyan: '#56b6c2', brightCyan: '#7fdbca',
        white: '#d7dae0', brightWhite: '#ffffff',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);

    const fit = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      try { fitAddon.fit(); } catch { /* 容器尚未完成布局 */ }
      const id = sessionIdRef.current;
      if (id) terminalApi.resize(id, term.cols, term.rows);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    const frame = requestAnimationFrame(fit);
    const inputSub = term.onData((data) => {
      const id = sessionIdRef.current;
      if (id) terminalApi.write(id, data);
    });
    const dataUnsubscribe = terminalApi.onData(({ id, data }) => {
      if (id === sessionIdRef.current) term.write(data);
    });
    const exitUnsubscribe = terminalApi.onExit(({ id, exitCode }) => {
      if (id === sessionIdRef.current) {
        term.write(`\r\n[PowerShell 已退出，退出码 ${exitCode}]\r\n`);
        sessionIdRef.current = null;
      }
    });

    (async () => {
      fit();
      const result = await terminalApi.create({ cwd: workspacePath, cols: term.cols, rows: term.rows });
      if (cancelled) {
        if (result.id) terminalApi.close(result.id);
        return;
      }
      if (!result.success || !result.id) {
        setError(result.error || '无法启动 PowerShell');
        return;
      }
      sessionIdRef.current = result.id;
      fit();
      term.focus();
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '无法启动 PowerShell');
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      inputSub.dispose();
      dataUnsubscribe();
      exitUnsubscribe();
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      if (id) terminalApi.close(id);
      term.dispose();
    };
  }, [workspacePath]);

  return (
    <div className="shell-terminal-root" onMouseDown={() => hostRef.current?.focus()}>
      {error ? <div className="shell-terminal-error">{error}</div> : null}
      <div ref={hostRef} className="shell-terminal-host" />
    </div>
  );
};

export default TerminalView;
