import React, { useState } from 'react';
import {
  CaretRightOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CodeOutlined,
  DiffOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons';

/**
 * 工具调用块 — 展示 Agent 的一次工具执行
 * 视觉参考 Claude Code / Codex CLI：
 *   ┌ ○ Read  src/main/index.ts                     ✓ 12ms
 *   └─ 展开后：行号内容 / diff / 终端输出
 */

export type ToolStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCallInfo {
  id: string;
  name: string;
  /** 原始 JSON 参数字符串 */
  args: string;
  status: ToolStatus;
  /** 执行结果（文本 / diff 内容） */
  output?: string;
  /** 执行耗时 ms */
  durationMs?: number;
  /** 结构化 diff（edit_file 用） */
  diff?: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  text: string;
  lineNo?: number;
}

interface Props {
  call: ToolCallInfo;
  /** 默认是否展开（运行中的工具默认展开） */
  defaultOpen?: boolean;
}

/* ---------------- 工具元信息映射 ---------------- */
const TOOL_META: Record<string, { icon: React.ReactNode; label: string; summarize: (a: any) => string }> = {
  read_file: {
    icon: <EyeOutlined />,
    label: 'Read',
    summarize: (a) => a?.path || a?.file_path || '',
  },
  write_file: {
    icon: <FileAddOutlined />,
    label: 'Write',
    summarize: (a) => a?.path || a?.file_path || '',
  },
  edit_file: {
    icon: <EditOutlined />,
    label: 'Edit',
    summarize: (a) => a?.path || a?.file_path || '',
  },
  list_dir: {
    icon: <FolderOpenOutlined />,
    label: 'List',
    summarize: (a) => a?.path || '.',
  },
  search_code: {
    icon: <SearchOutlined />,
    label: 'Search',
    summarize: (a) => {
      const q = a?.query || a?.pattern || '';
      const p = a?.path ? ` in ${a.path}` : '';
      return `${q}${p}`;
    },
  },
  run_command: {
    icon: <PlayCircleOutlined />,
    label: 'Bash',
    summarize: (a) => a?.command || a?.cmd || '',
  },
  write_todos: { icon: <CodeOutlined />, label: 'Todos', summarize: () => '' },
};

function metaOf(name: string) {
  return TOOL_META[name] || {
    icon: <CodeOutlined />,
    label: name,
    summarize: () => '',
  };
}

/** 安全解析参数 JSON */
function parseArgs(raw: string): any {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/** 生成行级 diff（简易 LCS，用于 edit_file 的 old/new 对比） */
export function buildDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = (oldStr ?? '').split('\n');
  const b = (newStr ?? '').split('\n');

  // 简易公共前后缀裁剪，避免大文件全量比对
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1, endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }

  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ type: 'ctx', text: a[i], lineNo: i + 1 });
  for (let i = start; i <= endA; i++) out.push({ type: 'del', text: a[i], lineNo: i + 1 });
  for (let i = start; i <= endB; i++) out.push({ type: 'add', text: b[i], lineNo: i + 1 });
  for (let i = endA + 1; i < a.length; i++) out.push({ type: 'ctx', text: a[i], lineNo: i + 1 });
  return out;
}

const StatusDot: React.FC<{ status: ToolStatus }> = ({ status }) => {
  if (status === 'running' || status === 'pending') return <span className="tool-spin" />;
  if (status === 'success') return <CheckCircleFilled style={{ color: 'var(--success)', fontSize: 13 }} />;
  return <CloseCircleFilled style={{ color: 'var(--danger)', fontSize: 13 }} />;
};

const ToolCallBlock: React.FC<Props> = ({ call, defaultOpen }) => {
  const meta = metaOf(call.name);
  const argsObj = parseArgs(call.args);
  const summary = meta.summarize(argsObj);
  const isRunning = call.status === 'running' || call.status === 'pending';
  const [open, setOpen] = useState(defaultOpen ?? false);

  // 运行中自动展开，结束后可保持展开
  const expanded = isRunning || open;

  const hasBody = !!call.output || (call.diff && call.diff.length > 0);

  return (
    <div className="tool-block" data-status={call.status}>
      <div className="tool-head" onClick={() => setOpen((v) => !v)}>
        <CaretRightOutlined
          style={{
            fontSize: 9,
            color: 'var(--text-quaternary)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--dur) var(--ease)',
          }}
        />
        <span className="tool-icon">{meta.icon}</span>
        <span className="tool-name">{meta.label}</span>
        {summary && <span className="tool-arg" title={summary}>{summary}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {call.durationMs !== undefined && call.status !== 'running' && (
            <span style={{ fontSize: 10.5, color: 'var(--text-quaternary)', fontFamily: 'monospace' }}>
              {call.durationMs}ms
            </span>
          )}
          <StatusDot status={call.status} />
        </span>
      </div>

      {expanded && hasBody && (
        <div className="tool-body g-scroll">
          {call.diff && call.diff.length > 0 ? (
            <div className="diff-view">
              {call.diff.map((d, i) => (
                <div key={i} className={`diff-line diff-${d.type}`}>
                  <span className="dl-no">{d.lineNo ?? ''}</span>
                  <span>
                    {d.type === 'add' ? '+ ' : d.type === 'del' ? '- ' : '  '}
                    {d.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="term-out">{colorizeOutput(call.output || '')}</pre>
          )}
        </div>
      )}

      {expanded && !hasBody && isRunning && (
        <div className="tool-waiting">
          <span className="tool-spin" />
          {call.status === 'pending' ? '排队中，等待执行…' : '执行中…'}
        </div>
      )}
    </div>
  );
};

/** 终端输出简易着色：错误红、成功绿 */
function colorizeOutput(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((ln, i) => {
    let cls = '';
    if (/^\s*(error|✗|Error|ERROR|failed|FAILED)/.test(ln) || /error TS\d+/.test(ln)) cls = 't-err';
    else if (/^\s*(ok|✓|success|Success|PASS|passed)/.test(ln)) cls = 't-ok';
    else if (/^\s*\$/.test(ln)) cls = 't-dim';
    return (
      <span key={i} className={cls}>
        {ln}
        {i < lines.length - 1 ? '\n' : ''}
      </span>
    );
  });
}

/** diff 图标导出（供外部复用） */
export const DiffIcon = DiffOutlined;

export default ToolCallBlock;
