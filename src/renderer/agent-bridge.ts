// Agent 模式的渲染层桥接
// 两个方向：
//   主进程 → 渲染层：tool-call / tool-result 流式 chunk、agent:confirm-request 命令确认
//   渲染层 → 主进程：respondAgentConfirm 回传用户决定
// 工具轨迹与权限请求统一挂在「当前正在流式输出的助手消息」上（见 chat-store 的 Agent 字段）。
import api from '../api';
import { useChatStore } from './stores/chat-store';
import { useWorkspaceStore, tabId } from './stores/workspace-store';
import type { ToolCallInfo, DiffLine } from './components/chat/ToolCallBlock';
import { buildDiff } from './components/chat/ToolCallBlock';
import type { PermissionRequest } from './components/chat/PermissionCard';

/** 当前助手消息 id（工具轨迹都挂它上面）；找不到返回 null */
export function currentAssistantId(): string | null {
  const msgs = useChatStore.getState().messages;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i].id;
  }
  return null;
}

/** 读一条消息上已有的工具调用（合并结果时需要保留 args） */
function getToolCall(messageId: string, callId: string): ToolCallInfo | undefined {
  const msg = useChatStore.getState().messages.find(m => m.id === messageId);
  return msg?.toolCalls?.[callId];
}

/** 追加/延续一个文本或思考片段，让 MessageBubble 能按「思考→文本→工具」交错渲染 */
function appendStreamSegment(messageId: string, kind: 'text' | 'thinking', text: string): void {
  if (!text) return;
  const store = useChatStore.getState();
  const msg = store.messages.find(m => m.id === messageId);
  const segs = msg?.segments || [];
  const last = segs[segs.length - 1];

  if (last && last.kind === kind) {
    // 延续最后一个同类片段，避免每帧产生一堆碎片
    const merged = { ...last, text: (last.text || '') + text };
    useChatStore.setState({
      messages: store.messages.map(m =>
        m.id === messageId ? { ...m, segments: [...segs.slice(0, -1), merged] } : m
      ),
    });
    return;
  }
  store.appendSegment(messageId, { kind, text });
}

/** text-delta / thinking-delta → 写入有序片段（与 content 字段并行维护） */
export function appendTextDelta(messageId: string | null, text: string): void {
  if (messageId) appendStreamSegment(messageId, 'text', text);
}

export function appendThinkingDelta(messageId: string | null, text: string): void {
  if (messageId) appendStreamSegment(messageId, 'thinking', text);
}

/** 工具调用开始时间（算耗时用） */
const toolCallStarts = new Map<string, number>();

/** tool-call chunk → 新增一张工具卡片（running 态）并插入片段序列 */
export function handleToolCall(
  messageId: string | null,
  call: { id: string; name: string; arguments: string }
): void {
  if (!messageId || !call?.id) return;
  toolCallStarts.set(call.id, Date.now());
  useChatStore.getState().upsertToolCall(messageId, {
    id: call.id,
    name: call.name,
    args: call.arguments || '',
    status: 'running',
  });
  useChatStore.getState().appendSegment(messageId, { kind: 'tool', toolCallId: call.id });
}

/**
 * edit_file 结果 → 用调用参数里的 old/new 现算行级 diff，
 * 卡片展开直接看改了什么（此前 diff 字段一直没人填，形同虚设）
 */
function diffForToolResult(name: string, argsRaw: string): DiffLine[] | undefined {
  if (name !== 'edit_file' || !argsRaw) return undefined;
  try {
    const a = JSON.parse(argsRaw);
    const oldStr = a?.old_string ?? a?.oldStr ?? a?.old ?? '';
    const newStr = a?.new_string ?? a?.newStr ?? a?.new ?? '';
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') return undefined;
    if (!oldStr && !newStr) return undefined;
    return buildDiff(oldStr, newStr);
  } catch {
    return undefined;
  }
}

/** 拼绝对路径（渲染层没有 node path 模块，手写个够用的） */
function joinPath(root: string, rel: string): string {
  if (/^([a-zA-Z]:[\\/]|\/)/.test(rel)) return rel; // 已经是绝对路径
  const sep = root.includes('\\') ? '\\' : '/';
  return root.replace(/[\\/]+$/, '') + sep + rel.replace(/^[\\/]+/, '');
}

/**
 * edit_file 成功后开一个只读 diff 标签（待办 #3：FileDiffView 接入 Agent 流）。
 * 「改前」没法事后拿盘上的旧内容，用参数逆向还原：
 * 把改后全文里的 new_string 换回 old_string（replace_all 用 split/join）。
 * 注意 replace 的第二个参数若直接传字符串，`$&` 等会被特殊解释，必须包一层函数。
 */
async function openDiffTabForEdit(argsRaw: string): Promise<void> {
  const ws = useWorkspaceStore.getState();
  const root = ws.workspace?.path;
  if (!root) return;

  let a: any;
  try { a = JSON.parse(argsRaw || ''); } catch { return; }
  const rel = a?.path || a?.file_path || '';
  const oldStr = a?.old_string ?? '';
  const newStr = a?.new_string ?? '';
  if (!rel || typeof oldStr !== 'string' || typeof newStr !== 'string') return;

  try {
    const res = await window.electronAPI?.file?.readText?.(joinPath(root, rel));
    if (!res?.success) return;
    const after: string = res.content ?? '';
    const before = a?.replace_all
      ? after.split(newStr).join(oldStr)
      : after.replace(newStr, () => oldStr);
    if (before === after) return; // 还原不出差异（如多处替换只还原一处）就不开标签

    const fileName = rel.split(/[\\/]/).pop() || rel;
    const abs = joinPath(root, rel);
    // readText 是异步的，重新取一次最新状态再动标签
    const cur = useWorkspaceStore.getState();

    // 同路径的文件标签已打开：同步刷新盘上最新内容，避免 Agent 改完编辑器里还是旧文
    // （有未保存改动时不动用户的编辑缓冲）
    const fileTab = cur.tabs.find(t => t.type === 'file' && t.filePath === abs);
    if (fileTab && !fileTab.unsaved) {
      cur.updateTab(fileTab.id, { content: after, unsaved: false });
      cur.setFileContent(abs, after, false);
    }

    /**
     * 审阅回调。改动此刻已经在盘上（edit_file 已成功），所以：
     *  - 接受 = 认可现状，关闭审阅标签；
     *  - 拒绝 = 把还原出的改前内容写回盘上，同步打开的编辑器，再关标签。
     * 回调里都重新 getState()，避免闭包捕获过期状态。
     */
    const attachReviewHandlers = (tid: string) => {
      const handlers = {
        onAccept: () => {
          useWorkspaceStore.getState().removeTab(tid);
        },
        onReject: () => {
          void (async () => {
            try {
              const res = await window.electronAPI?.file?.write?.(abs, before);
              if (res && res.success === false) throw new Error(res.error || '写入失败');
              const st = useWorkspaceStore.getState();
              const openTab = st.tabs.find(t => t.type === 'file' && t.filePath === abs && !t.unsaved);
              if (openTab) {
                st.updateTab(openTab.id, { content: before });
                st.setFileContent(abs, before, false);
              }
            } catch (err) {
              // 写回失败时保留标签，让用户能在编辑器里手动处理
              console.error('[agent-bridge] 拒绝改动，写回原内容失败:', err);
              return;
            }
            useWorkspaceStore.getState().removeTab(tid);
          })();
        },
      };
      useWorkspaceStore.getState().updateTab(tid, handlers);
    };

    const existing = cur.tabs.find(t => t.type === 'diff' && t.filePath === abs);
    if (existing) {
      // 同一文件多次编辑：刷新现有标签内容，不抢焦点
      cur.updateTab(existing.id, { content: after, originalContent: before });
      attachReviewHandlers(existing.id);
    } else {
      const tid = tabId();
      cur.addTab({
        id: tid,
        type: 'diff',
        title: `改动 · ${fileName}`,
        filePath: abs,
        content: after,
        originalContent: before,
      });
      attachReviewHandlers(tid);
    }
  } catch { /* 读不到就放弃，工具卡里还有行级 diff 兜底 */ }
}

/** tool-result chunk → 把对应卡片改成成功/失败并写入输出 */
export function handleToolResult(
  messageId: string | null,
  result: { id: string; name: string; success: boolean; output: string }
): void {
  if (!messageId || !result?.id) return;
  const prev = getToolCall(messageId, result.id);
  const name = result.name || prev?.name || '';
  const startedAt = toolCallStarts.get(result.id);
  if (startedAt) toolCallStarts.delete(result.id);
  useChatStore.getState().upsertToolCall(messageId, {
    id: result.id,
    name,
    args: prev?.args || '',
    status: result.success ? 'success' : 'error',
    output: result.output || '',
    durationMs: startedAt ? Date.now() - startedAt : prev?.durationMs,
    diff: prev?.diff ?? diffForToolResult(name, prev?.args || ''),
  });

  // 编辑成功 → 打开/刷新只读 diff 标签（不阻塞消息流）
  if (name === 'edit_file' && result.success) {
    void openDiffTabForEdit(prev?.args || '').catch(() => {});
  }
}

/** 主进程发来的命令确认 → 挂到当前助手消息，MessageBubble 会渲染 PermissionCard */
export function attachPermission(req: { id: string; title: string; detail: string }): void {
  if (!req?.id) return;
  const messageId = currentAssistantId();
  if (!messageId) return;
  const request: PermissionRequest = {
    id: req.id,
    tool: 'run_command',
    description: req.title || '执行终端命令',
    detail: req.detail || '',
    risk: 'high',
    // 主进程侧 180s 超时视为拒绝，这里同步展示倒计时
    expiresAt: Date.now() + 180_000,
  };
  useChatStore.getState().setPermission(messageId, request);
}

/** 用户点了允许/拒绝 → 回传主进程并清掉卡片 */
export function respondPermission(id: string, decision: 'allow' | 'allow-always' | 'deny'): void {
  // 注意：主进程目前只接收布尔「本次是否允许」，"本会话总是允许" 记为允许本次
  api.respondAgentConfirm(id, decision !== 'deny');
  const msgs = useChatStore.getState().messages;
  const owner = msgs.find(m => m.permission?.id === id);
  if (owner) useChatStore.getState().setPermission(owner.id, null);
}

/** 订阅命令确认请求，返回取消订阅函数（在流式发送期间挂载即可） */
export function subscribeAgentConfirm(): () => void {
  return api.onAgentConfirmRequest(attachPermission);
}
