// Agent 模式的渲染层桥接
// 两个方向：
//   主进程 → 渲染层：tool-call / tool-result 流式 chunk、agent:confirm-request 副作用操作确认
//   渲染层 → 主进程：respondAgentConfirm 回传用户决定
// 工具轨迹与权限请求统一挂在「当前正在流式输出的助手消息」上（见 chat-store 的 Agent 字段）。
import api from '../api';
import { useChatStore } from './stores/chat-store';
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

}

/** 主进程发来的副作用操作确认 → 挂到当前助手消息，MessageBubble 会渲染 PermissionCard */
export function attachPermission(req: { id: string; title: string; detail: string }): void {
  if (!req?.id) return;
  const messageId = currentAssistantId();
  if (!messageId) return;
  const request: PermissionRequest = {
    id: req.id,
    tool: req.title === '应用文件改动' ? 'edit_file' : 'run_command',
    description: req.title || '执行终端命令',
    detail: req.detail || '',
    risk: 'high',
    // 主进程侧 180s 超时视为拒绝，这里同步展示倒计时
    expiresAt: Date.now() + 180_000,
  };
  useChatStore.getState().setPermission(messageId, request);
}

/** 用户点了允许/拒绝 → 回传主进程并清掉卡片 */
export function respondPermission(id: string, decision: 'allow' | 'deny'): void {
  api.respondAgentConfirm(id, decision !== 'deny');
  const msgs = useChatStore.getState().messages;
  const owner = msgs.find(m => m.permission?.id === id);
  if (owner) useChatStore.getState().setPermission(owner.id, null);
}

/** 订阅副作用操作确认请求，返回取消订阅函数（在流式发送期间挂载即可） */
export function subscribeAgentConfirm(): () => void {
  return api.onAgentConfirmRequest(attachPermission);
}
