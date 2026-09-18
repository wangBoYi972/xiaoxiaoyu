import { create } from 'zustand';
import { useWorkspaceStore } from './workspace-store';

/**
 * 项目启动器的渲染层状态（2026-09-19 / 2026-09-20 扩展）
 *
 * 「启动项目」= 主进程直接 spawn（继承完整系统环境：JDK/JAVA_HOME/PATH/MAVEN_HOME），
 * 输出流式回传到这里，由 TerminalView 面板展示。聊天流不再掺和启动逻辑。
 *
 * 2026-09-20：支持任意命令字符串 + 自动探测 Node/Maven/Gradle/Python/Go/静态项目。
 */

export interface RunnerLine {
  id: number;
  kind: 'start' | 'stdout' | 'stderr' | 'exit' | 'error' | 'stopped';
  text: string;
}

export interface EnvProbe {
  ok: boolean;
  version: string;
  home?: string;
  path?: string;
}

export interface RunnerEnv {
  node: EnvProbe;
  java: EnvProbe;
  python: EnvProbe;
  git: EnvProbe;
  maven: EnvProbe;
  vars: Record<string, string>;
}

export interface ProjectCommand {
  id: string;
  label: string;
  command: string;
  cwd?: string;
  description?: string;
}

export interface ProjectDetect {
  kind: 'node' | 'maven' | 'gradle' | 'python' | 'go' | 'static' | 'unknown';
  label: string;
  files: string[];
  commands: ProjectCommand[];
}

/** 最多保留的输出行数（防长跑 dev server 撑爆内存） */
const MAX_LINES = 3000;

/** 去掉 ANSI 转义序列与控制字符（彩色输出、光标移动、窗口标题等都会把面板搞花） */
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC：窗口标题等
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;:?]*[ -/]*[@-~]/g, '') // CSI：颜色 / 光标控制
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@-Z\\-_]/g, '') // 其余单字符转义（如 ESC(B 字符集切换）
    .replace(/\r\n/g, '\n'); // 先把 CRLF 还原成换行，剩下的孤立 \r 由行内覆盖逻辑处理
}

/** 压掉行中段超长空隙（构建工具按 80 列对齐，在宽面板里会拉出巨大空白） */
function collapseGaps(line: string): string {
  return line.replace(/(\S) {5,}(?=\S)/g, '$1    ');
}

/** 时长格式化：36s / 5m12s */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

interface RunnerState {
  running: boolean;
  script: string;
  command: string;
  /** 本次运行开始的时间戳（用于面板显示用时），0 表示无运行记录 */
  startedAt: number;
  lines: RunnerLine[];
  env: RunnerEnv | null;
  envChecking: boolean;

  /** 项目探测相关 */
  detect: ProjectDetect | null;
  detecting: boolean;
  detectError: string;
  selectedCommandId: string;
  customCommand: string;

  /** 挂载时调用：订阅主进程输出流（幂等，多次调用安全） */
  init: () => void;
  /** 拉一次环境探测（JDK 等） */
  fetchEnv: () => Promise<void>;
  /** 探测当前工作区项目类型与候选命令 */
  detectProject: (cwd?: string) => Promise<void>;
  /** 选择候选命令 */
  selectCommand: (id: string) => void;
  /** 修改自定义命令 */
  setCustomCommand: (cmd: string) => void;
  /** 启动：优先用自定义命令，否则用 selectedCommand，npm 场景可回退 script */
  start: (opts?: { script?: string; command?: string }) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
}

let lineSeq = 0;
let unsubscribed: (() => void) | null = null;
/** 半行缓冲：一次 data 不保证以换行结尾，攒到下个 chunk 再成行（按流分开记） */
const pendingPartials: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

function resetPartials(): void {
  pendingPartials.stdout = '';
  pendingPartials.stderr = '';
}

/** 一条原始输出流 → 清理后的行数组；\r 覆盖型进度行只保留最后一帧 */
function chunkToLines(raw: string): string[] {
  const out: string[] = [];
  const segs = raw.split('\n');
  // 结尾的 \n 只是行终止符，不是空行；真正的空行是连续两个 \n 产生的
  if (segs.length > 1 && segs[segs.length - 1] === '') segs.pop();
  for (const seg of segs) {
    const cr = seg.lastIndexOf('\r');
    const line = (cr >= 0 ? seg.slice(cr + 1) : seg).replace(/\s+$/, '');
    if (!line) {
      // 连续空行压成一个，构建日志里的花式分段空行不再把排版撑散
      if (out.length && out[out.length - 1] === '') continue;
      out.push('');
    } else {
      out.push(collapseGaps(line));
    }
  }
  return out;
}

/** 进程收尾时把没等到换行符的半行冲出来，避免最后一行输出丢失 */
function flushPartials(emit: (kind: RunnerLine['kind'], text: string) => void): void {
  for (const stream of ['stdout', 'stderr'] as const) {
    const rest = pendingPartials[stream];
    pendingPartials[stream] = '';
    const line = rest.replace(/\s+$/, '');
    if (line) emit(stream, collapseGaps(line));
  }
}

const electron = () => (window as any).electronAPI?.runner;

export const useRunnerStore = create<RunnerState>((set, get) => ({
  running: false,
  script: '',
  command: '',
  startedAt: 0,
  lines: [],
  env: null,
  envChecking: false,

  detect: null,
  detecting: false,
  detectError: '',
  selectedCommandId: '',
  customCommand: '',

  init: () => {
    if (unsubscribed) return; // 已订阅
    const runner = electron();
    if (!runner?.onOutput) return;
    unsubscribed = runner.onOutput((chunk: any) => {
      /** 追加若干行；每次都取最新 lines，同一事件里多次追加不丢行；跨 chunk 也压掉连续空行 */
      const appendMany = (kind: RunnerLine['kind'], newLines: string[]) => {
        if (!newLines.length) return;
        const current = get().lines;
        const prevEmpty = current.length > 0 && current[current.length - 1].text === '';
        const cleaned = prevEmpty ? newLines.filter((t, i) => t !== '' || i > 0) : newLines;
        if (!cleaned.length) return;
        const added = cleaned.map((text) => ({ id: ++lineSeq, kind, text }));
        const next = [...current, ...added];
        set({ lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next });
      };
      switch (chunk.type) {
        case 'start':
          set({ running: true, script: chunk.script || '', command: chunk.command || '', startedAt: Date.now() });
          resetPartials();
          appendMany('start', [`$ ${chunk.command || 'npm run ' + chunk.script}`]);
          break;
        case 'stdout':
        case 'stderr': {
          const stream: 'stdout' | 'stderr' = chunk.type;
          let raw = pendingPartials[stream] + stripAnsi(chunk.data || '');
          pendingPartials[stream] = '';
          if (!raw.endsWith('\n')) {
            // 最后一行可能被截断（进度条刷新常不带换行），留给下个 chunk 拼接
            const nl = raw.lastIndexOf('\n');
            if (nl >= 0) {
              pendingPartials[stream] = raw.slice(nl + 1);
              raw = raw.slice(0, nl + 1);
            } else {
              pendingPartials[stream] = raw;
              raw = '';
            }
          }
          if (raw) appendMany(stream, chunkToLines(raw));
          break;
        }
        case 'error':
          flushPartials((kind, text) => appendMany(kind, [text]));
          appendMany('error', [`启动失败: ${chunk.data || '未知错误'}`]);
          set({ running: false });
          break;
        case 'stopped':
          flushPartials((kind, text) => appendMany(kind, [text]));
          appendMany('stopped', [
            `已停止 · ${chunk.data || '用户手动停止'}${get().startedAt ? ` · 用时 ${formatDuration(Date.now() - get().startedAt)}` : ''}`,
          ]);
          set({ running: false });
          break;
        case 'exit': {
          flushPartials((kind, text) => appendMany(kind, [text]));
          const dur = get().startedAt ? ` · 用时 ${formatDuration(Date.now() - get().startedAt)}` : '';
          appendMany('exit', [chunk.code === 0 ? `进程已正常退出${dur}` : `进程退出，退出码 ${chunk.code}`]);
          set({ running: false });
          break;
        }
      }
    });
  },

  fetchEnv: async () => {
    const runner = electron();
    if (!runner?.checkEnv) return;
    set({ envChecking: true });
    try {
      const res = await runner.checkEnv();
      if (res?.success) set({ env: res.env });
    } catch { /* ignore */ }
    set({ envChecking: false });
  },

  detectProject: async (cwd) => {
    const runner = electron();
    if (!runner?.detect) return;
    const root = cwd || useWorkspaceStore.getState().workspace?.path;
    if (!root) {
      set({ detect: null, detectError: '未选择工作区' });
      return;
    }
    set({ detecting: true, detectError: '', selectedCommandId: '', customCommand: '' });
    try {
      const res = await runner.detect(root);
      if (res?.success) {
        const detect: ProjectDetect = {
          kind: res.kind || 'unknown',
          label: res.label || '未识别项目',
          files: res.files || [],
          commands: res.commands || [],
        };
        set({ detect, selectedCommandId: detect.commands[0]?.id || '', detecting: false });
      } else {
        set({ detect: null, detectError: res?.error || '探测失败', detecting: false });
      }
    } catch (e: any) {
      set({ detect: null, detectError: e?.message || '探测异常', detecting: false });
    }
  },

  selectCommand: (id: string) => set({ selectedCommandId: id }),

  setCustomCommand: (cmd: string) => set({ customCommand: cmd }),

  start: async (opts) => {
    const runner = electron();
    if (!runner?.start) return;
    const cwd = useWorkspaceStore.getState().workspace?.path;
    if (!cwd) return;

    get().init();

    let command = opts?.command?.trim() || '';
    let script = opts?.script?.trim() || '';

    // 没传则从 store 里取：自定义命令优先，再选候选命令
    if (!command && !script) {
      const { customCommand, selectedCommandId, detect } = get();
      if (customCommand.trim()) {
        command = customCommand.trim();
      } else if (selectedCommandId && detect?.commands) {
        const selected = detect.commands.find((c) => c.id === selectedCommandId);
        if (selected) {
          command = selected.command;
          if (selected.cwd && selected.cwd !== cwd) {
            // 子模块命令需要切换 cwd（命令里 cd 过去再执行）
            command = `cd /d "${selected.cwd}" && ${selected.command}`;
          }
        }
      }
    }

    if (!command && !script) {
      set({
        running: false,
        lines: [{ id: ++lineSeq, kind: 'error', text: '启动失败: 请先选择或输入启动命令' }],
      });
      return;
    }

    // 启动前清掉旧输出，保持面板聚焦本次运行
    set({ lines: [], running: true });
    try {
      const res = await runner.start({ script, cwd, command });
      if (!res?.success) {
        set({
          running: false,
          lines: [{ id: ++lineSeq, kind: 'error', text: `启动失败: ${res?.error || '未知错误'}` }],
        });
      }
    } catch (e: any) {
      set({ running: false });
      const { lines } = get();
      set({ lines: [...lines, { id: ++lineSeq, kind: 'error', text: `启动失败: ${e?.message || e}` }] });
    }
  },

  stop: async () => {
    const runner = electron();
    if (!runner?.stop) return;
    try { await runner.stop(); } catch { /* ignore */ }
  },

  clear: () => {
    resetPartials();
    set({ lines: [], script: '', command: '', running: false, startedAt: 0 });
  },
}));
