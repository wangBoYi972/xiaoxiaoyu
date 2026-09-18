import React, { useEffect, useRef, useState } from 'react';
import {
  StopOutlined,
  ClearOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CodeOutlined,
  PlayCircleOutlined,
  RocketOutlined,
  ArrowDownOutlined,
  CodeFilled,
} from '@ant-design/icons';
import { Select, Input, Button, Space, Tooltip } from 'antd';
import { useRunnerStore, type RunnerLine, formatDuration } from '../../stores/runner-store';
import { useWorkspaceStore } from '../../stores/workspace-store';

/**
 * 项目运行面板（2026-09-20 重设计）
 *
 * 主进程 spawn 任意命令，stdout/stderr 流式打到这里的输出区。
 * 视觉与排版规则：
 *  - 环境探测渲染成一行品牌色小胶囊，版本只显示短号（完整号在悬浮提示里）；
 *  - 日志按语义着色：[INFO]/[WARN]/[ERROR] 变成固定宽度的等级徽章，天然左对齐；
 *    BUILD SUCCESS / FAILURE 整行高亮，下载行淡显；
 *  - 空行折叠、进度条 \r 覆盖帧只留最后一帧（在 runner-store 里完成）。
 */

/** 行文本里的 URL 转成可点击链接（dev server 的 http://localhost:5173 之类） */
function linkify(text: string): React.ReactNode {
  if (!text) return '\u00A0';
  const parts = text.split(/(https?:\/\/[^\s)>\]]+)/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="term-link">{p}</a>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
}

/** 抓取行首的日志等级，如 Maven 的 [INFO] / [WARNING] */
const LEVEL_RE = /^\s*\[(INFO|NOTICE|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)\]\s*/;

function badgeLevel(level: string): 'info' | 'warn' | 'error' | 'debug' {
  switch (level) {
    case 'INFO':
    case 'NOTICE':
      return 'info';
    case 'WARN':
    case 'WARNING':
      return 'warn';
    case 'DEBUG':
    case 'TRACE':
      return 'debug';
    default:
      return 'error';
  }
}

function renderLogLine(text: string): React.ReactNode {
  const m = text.match(LEVEL_RE);
  if (!m) return linkify(text);
  const label = m[1] === 'WARNING' ? 'WARN' : m[1];
  return (
    <>
      <span className={`log-badge ${badgeLevel(m[1])}`}>{label}</span>
      {linkify(text.slice(m[0].length)) || '\u00A0'}
    </>
  );
}

const lineClass: Record<RunnerLine['kind'], string> = {
  start: 'term-line start',
  stdout: 'term-line stdout',
  stderr: 'term-line stderr',
  exit: 'term-line exit',
  error: 'term-line error',
  stopped: 'term-line stopped',
};

/** stdout 行的附加样式：构建结果整行高亮、下载行淡显 */
function extraClass(l: RunnerLine): string {
  if (l.kind !== 'stdout' && l.kind !== 'stderr') return '';
  if (/BUILD SUCCESS|BUILD SUCCESSFUL/.test(l.text)) return ' build-ok';
  if (/BUILD FAILURE|BUILD ERROR/.test(l.text)) return ' build-fail';
  if (/^(Downloading|Downloaded|Download|Progress \()/i.test(l.text.replace(LEVEL_RE, ''))) return ' dim';
  return '';
}

/** 环境探测胶囊：工具名 + 品牌色圆点 + 短版本号 */
const TOOLS: Array<{ key: 'node' | 'java' | 'python' | 'git' | 'maven'; label: string; color: string }> = [
  { key: 'node', label: 'Node', color: '#3C873A' },
  { key: 'java', label: 'JDK', color: '#E97627' },
  { key: 'python', label: 'Python', color: '#3776AB' },
  { key: 'git', label: 'Git', color: '#F05033' },
  { key: 'maven', label: 'Maven', color: '#C71A36' },
];

function shortVersion(v?: string): string {
  if (!v) return '—';
  const m = v.match(/\d+(?:\.\d+)+/);
  if (m) return m[0];
  return v.length <= 14 ? v : `${v.slice(0, 13)}…`;
}

const TerminalView: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspace?.path);
  const startedAt = useRunnerStore((s) => s.startedAt);
  const {
    lines, running, command, env, envChecking,
    detect, detecting, detectError, selectedCommandId, customCommand,
    init, fetchEnv, detectProject, selectCommand, setCustomCommand, start, stop, clear,
  } = useRunnerStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [localCommand, setLocalCommand] = useState(customCommand);
  const [, tick] = useState(0);

  useEffect(() => {
    init();
    fetchEnv();
    detectProject();
    return () => { /* 输出流保持全局订阅（幂等），不在这里退订 */ };
  }, [init, fetchEnv, detectProject]);

  // 切换工作区时重新探测
  useEffect(() => {
    detectProject();
  }, [workspacePath, detectProject]);

  // 跟随滚动（用户上翻查看历史时暂停自动跟随）
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // 运行中每秒刷新一次「用时」
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const elapsed = running && startedAt ? formatDuration(Date.now() - startedAt) : '';

  const envPill = (
    label: string,
    color: string,
    probe?: { ok: boolean; version: string },
    extra?: string,
  ) => {
    if (!probe) return null;
    return (
      <span
        className={`term-env-pill${probe.ok ? '' : ' off'}`}
        title={`${label}${probe.ok ? ` ${probe.version || '可用'}` : ' 未检测到（不装也能跑部分项目）'}${extra ? `\n${extra}` : ''}`}
      >
        <span className="term-env-dot" style={probe.ok ? { background: color } : undefined} />
        <span className="term-env-name">{label}</span>
        <span className="term-env-ver">{probe.ok ? shortVersion(probe.version) : '未安装'}</span>
      </span>
    );
  };

  const commandOptions = detect?.commands.map((c) => ({
    value: c.id,
    label: c.label,
  })) || [];

  const selectedLabel = detect?.commands.find((c) => c.id === selectedCommandId)?.label || '选择命令';

  return (
    <div className="term-root">
      {/* 环境状态条：直接回答「能不能读到 JDK 这些」 */}
      <div className="term-envbar">
        <span className="term-env-title"><CodeOutlined /> 环境</span>
        {envChecking && <span className="term-env-ver">检测中…</span>}
        {env && !envChecking && TOOLS.map((t) => {
          const probe = env[t.key];
          const extra = t.key === 'java' ? `JAVA_HOME=${env.vars?.JAVA_HOME || '(未设置)'}` : undefined;
          return (
            <React.Fragment key={t.key}>
              {envPill(t.label, t.color, probe, extra)}
            </React.Fragment>
          );
        })}
        <span className={`term-runstate ${running ? 'on' : ''}`}>
          <span className="term-env-dot" />
          {running ? `运行中 · ${elapsed || command || ''}` : '空闲'}
        </span>
      </div>

      {/* 命令选择区 */}
      <div className="term-cmdbar">
        {detect ? (
          <span className="term-detect-chip"><RocketOutlined />{detect.label}</span>
        ) : detecting ? (
          <span className="term-detect-chip off">识别项目类型…</span>
        ) : detectError ? (
          <span className="term-detect-chip err">探测失败</span>
        ) : (
          <span className="term-detect-chip off">未识别项目</span>
        )}

        <Space.Compact style={{ flex: 1, minWidth: 0 }}>
          <Select
            value={selectedCommandId || undefined}
            placeholder={detect?.commands.length ? selectedLabel : '无可选命令'}
            disabled={!detect?.commands.length || running}
            options={commandOptions}
            onChange={(id) => {
              selectCommand(id);
              setLocalCommand('');
              setCustomCommand('');
            }}
            style={{ maxWidth: 260, flex: 1 }}
            size="small"
          />
          <Input
            value={localCommand}
            disabled={running}
            placeholder="或手动输入命令，如 mvn -DskipTests spring-boot:run"
            onChange={(e) => {
              setLocalCommand(e.target.value);
              setCustomCommand(e.target.value);
            }}
            onPressEnter={() => start()}
            size="small"
            style={{ flex: 1 }}
          />
          {running ? (
            <Button danger icon={<StopOutlined />} onClick={stop} size="small">
              停止
            </Button>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => start()} size="small">
              启动
            </Button>
          )}
        </Space.Compact>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Tooltip title="清空输出">
            <Button icon={<ClearOutlined />} onClick={() => { clear(); setLocalCommand(''); setCustomCommand(''); }} size="small" />
          </Tooltip>
          <Tooltip title="重新检测环境">
            <Button icon={<ReloadOutlined />} onClick={() => { fetchEnv(); detectProject(); }} size="small" />
          </Tooltip>
        </div>
      </div>

      {/* 输出区 */}
      <div className="term-body-wrap">
        <div ref={scrollRef} className="term-body" onScroll={onScroll}>
          {lines.length === 0 ? (
            <div className="term-empty">
              <CodeFilled className="term-empty-icon" />
              <div className="term-empty-title">终端就绪</div>
              <div className="term-empty-desc">
                在上方选择或输入启动命令后点「启动」，运行日志会实时打印在这里
              </div>
              <div className="term-empty-examples">
                <code>mvn -DskipTests spring-boot:run</code>
                <code>npm run dev</code>
                <code>go run .</code>
              </div>
            </div>
          ) : (
            lines.map((l) => {
              if (l.kind === 'start') {
                const cmd = l.text.startsWith('$ ') ? l.text.slice(2) : l.text;
                return (
                  <div key={l.id} className="term-line start">
                    <span className="term-prompt">$</span>
                    {cmd}
                  </div>
                );
              }
              if (l.kind === 'exit') {
                const fail = /退出码/.test(l.text);
                return (
                  <div key={l.id} className="term-line">
                    <span className={`exit-pill ${fail ? 'fail' : 'ok'}`}>
                      {fail ? <CloseCircleFilled /> : <CheckCircleFilled />}
                      {l.text}
                    </span>
                  </div>
                );
              }
              if (l.kind === 'stopped') {
                return (
                  <div key={l.id} className="term-line">
                    <span className="exit-pill muted">{l.text}</span>
                  </div>
                );
              }
              return (
                <div key={l.id} className={`${lineClass[l.kind]}${extraClass(l)}`}>
                  {renderLogLine(l.text)}
                </div>
              );
            })
          )}
        </div>
        {!autoScroll && lines.length > 0 && (
          <button type="button" className="term-jump" onClick={scrollToBottom}>
            <ArrowDownOutlined /> 回到最新
          </button>
        )}
      </div>
    </div>
  );
};

export default TerminalView;
