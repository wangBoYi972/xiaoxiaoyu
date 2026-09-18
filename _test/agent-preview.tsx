import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './../src/renderer/styles/global.css';
import './../src/renderer/styles/glass.css';

import { MessageList } from '../src/renderer/components/chat/MessageList';
import ToolCallBlock, { type ToolCallInfo, buildDiff } from '../src/renderer/components/chat/ToolCallBlock';
import PermissionCard from '../src/renderer/components/chat/PermissionCard';
import ThinkingBlock from '../src/renderer/components/chat/ThinkingBlock';
import { InputArea } from '../src/renderer/components/chat/InputArea';

/* ============================================================
   Agent UI 渲染验证台
   ------------------------------------------------------------
   走真实集成路径：MessageList → MessageBubble → ToolCallBlock /
   PermissionCard / ThinkingBlock，DOM 结构与 ChatView 一致。
   注意：_test/ 下的临时验证页，不属于产品代码。
   ============================================================ */

const NOW = Date.now();

/* ---------- 工具调用样本 ---------- */
const toolSearch: ToolCallInfo = {
  id: 'call_1',
  name: 'search_code',
  args: JSON.stringify({ query: 'handleLogin', path: 'src/server' }),
  status: 'success',
  durationMs: 42,
  output: [
    '$ grep -rn "handleLogin" src/server',
    'src/server/routes/auth.ts:18:export async function handleLogin(req, res) {',
    'src/server/routes/auth.ts:64:  const result = await handleLogin(payload);',
    'src/server/middleware/session.ts:9:import { handleLogin } from "../routes/auth";',
    '',
    '✓ 3 matches in 2 files',
  ].join('\n'),
};

const toolEdit: ToolCallInfo = {
  id: 'call_2',
  name: 'edit_file',
  args: JSON.stringify({ path: 'src/server/routes/auth.ts' }),
  status: 'success',
  durationMs: 118,
  diff: buildDiff(
    [
      '    if (!user) {',
      '      res.status(401).json({ error: "bad credentials" });',
      '      return;',
      '    }',
    ].join('\n'),
    [
      '    if (!user) {',
      '      logger.warn({ email }, "login failed: no such user");',
      '      res.status(401).json({ code: "AUTH_INVALID", message: "邮箱或密码不正确" });',
      '      return;',
      '    }',
    ].join('\n'),
  ),
};

const toolRun: ToolCallInfo = {
  id: 'call_3',
  name: 'run_command',
  args: JSON.stringify({ command: 'npm run build:main' }),
  status: 'running',
};

const toolFail: ToolCallInfo = {
  id: 'call_4',
  name: 'run_command',
  args: JSON.stringify({ command: 'npm run typecheck' }),
  status: 'error',
  durationMs: 3407,
  output: [
    '$ tsc --noEmit',
    'src/server/routes/auth.ts:71:18 - error TS2345: Argument of type \'string | undefined\'',
    '  is not assignable to parameter of type \'string\'.',
    '',
    '19:18  error  1 error found',
    '✗ failed with exit code 2',
  ].join('\n'),
};

const toolPending: ToolCallInfo = {
  id: 'call_5',
  name: 'write_file',
  args: JSON.stringify({ path: 'src/server/utils/errors.ts' }),
  status: 'pending',
};

const longCommand: ToolCallInfo = {
  id: 'call_6',
  name: 'run_command',
  args: JSON.stringify({ command: "git log --oneline --graph --decorate --all -30 | head -20 && echo '---' && git status --short" }),
  status: 'success',
  durationMs: 87,
  output: ['$ git log --oneline --graph --decorate --all -30', '* 4f2a1b0 (HEAD) refactor: structure auth errors', '* 91c3d2e fix: session ttl', '✓ ok'].join('\n'),
};

/* ---------- 会话消息（走 MessageList 真实路径） ---------- */
const messages = [
  {
    id: 'm_0',
    role: 'user' as const,
    content: '帮我把登录接口的错误处理重构一下，现在失败信息太含糊了。',
    createdAt: NOW - 120_000,
  },
  {
    id: 'm_1',
    role: 'assistant' as const,
    content: '',
    createdAt: NOW - 90_000,
    segments: [
      {
        kind: 'thinking' as const,
        text: [
          '用户要把登录接口的错误处理重构一下。',
          '先看看现在 handleLogin 是怎么写的，再决定动哪里。',
          '重点是：不要改变接口的语义，只把错误信息结构化。',
        ].join('\n'),
      },
      { kind: 'text' as const, text: '先定位一下 `handleLogin` 的实现，顺便看看有没有别处调用。' },
      { kind: 'tool' as const, toolCallId: 'call_1' },
      { kind: 'text' as const, text: '找到了。当前失败分支只返回一个裸的 error 字符串，前端拿不到可判别的错误码。我把它改成结构化响应：' },
      { kind: 'tool' as const, toolCallId: 'call_2' },
      { kind: 'text' as const, text: '改完了，跑一下构建确认没破坏类型。' },
      { kind: 'tool' as const, toolCallId: 'call_3' },
    ],
    toolCalls: { call_1: toolSearch, call_2: toolEdit, call_3: toolRun },
  },
  {
    id: 'm_2',
    role: 'assistant' as const,
    content: '',
    createdAt: NOW - 30_000,
    segments: [
      { kind: 'text' as const, text: '需要跑一次数据库迁移来让新的错误码表生效，这一步会写库，先跟你确认。' },
    ],
    permission: {
      id: 'perm_1',
      tool: 'run_command',
      description: '执行数据库迁移（会修改 users 表结构）',
      detail: 'npm run migrate -- --table users --add-column last_login_error',
      risk: 'high' as const,
      expiresAt: NOW + 47_000,
    },
  },
  {
    id: 'm_3',
    role: 'assistant' as const,
    content: '',
    createdAt: NOW - 10_000,
    segments: [
      { kind: 'text' as const, text: '类型检查没过，`email` 可能是 undefined，我补一下判空。' },
      { kind: 'tool' as const, toolCallId: 'call_4' },
    ],
    toolCalls: { call_4: toolFail },
  },
  {
    id: 'm_4',
    role: 'assistant' as const,
    content: '',
    streaming: true,
    createdAt: NOW,
    segments: [{ kind: 'text' as const, text: '正在补判空逻辑，稍等' }],
  },
];

/* ---------- 无片段的回退路径（老消息兼容） ---------- */
const legacyMsg = {
  id: 'm_5',
  role: 'assistant' as const,
  content: '这里是**回退渲染**路径：没有 segments，只有 content + thinking + toolCalls。',
  thinking: '这条用来验证 MessageBubble 在没有 segments 时的兜底分支是否正常。',
  createdAt: NOW - 5_000,
  toolCalls: { call_6: longCommand },
};

const Shell: React.FC = () => {
  const [dark, setDark] = useState(true);

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
      {/* 壁纸层 —— backdrop-filter 要有东西可模糊才看得出玻璃感 */}
      <div className="wp-root">
        <div
          className="wp-image"
          style={{ backgroundImage: 'linear-gradient(140deg,#1b2a5e 0%,#3d1f5c 40%,#0d3b4f 75%,#0a1020 100%)' }}
        />
        <div className="wp-dim" />
        <div className="wp-glow" />
      </div>

      <div className="app-layer">
        {/* 验证台工具条（非产品 UI） */}
        <div className="ws-toolbar g-panel g-sheen" style={{ marginBottom: 0 }}>
          <div className="ws-brand">
            <div className="ws-logo">验</div>
            <span className="ws-brand-name">Agent UI 验证台</span>
          </div>
          <div className="ws-center" />
          <button className="g-chip" onClick={() => apply(!dark)}>
            {dark ? '切到浅色' : '切到深色'}
          </button>
        </div>

        {/* 与 ChatView 完全一致的结构 */}
        <div className="chat-root">
          <div className="chat-scroll g-scroll">
            {/* 1. 真实集成路径 */}
            <MessageList
              messages={messages as any}
              isStreaming={false}
              onPermissionRespond={() => {}}
              onRegenerate={() => {}}
            />

            {/* 2. 组件单独陈列 */}
            <div className="chat-list" style={{ paddingTop: 26 }}>
              <div className="g-label">回退渲染路径（无 segments 的老消息）</div>
              <MessageList messages={[legacyMsg] as any} isStreaming={false} onPermissionRespond={() => {}} />

              <div className="g-label" style={{ marginTop: 26 }}>工具状态 · 全部枚举</div>
              <ToolCallBlock call={toolPending} />
              <ToolCallBlock call={toolRun} />
              <ToolCallBlock call={toolSearch} />
              <ToolCallBlock call={toolEdit} defaultOpen />
              <ToolCallBlock call={toolFail} defaultOpen />
              <ToolCallBlock call={longCommand} defaultOpen />

              <div className="g-label" style={{ marginTop: 26 }}>思考块 · 折叠与展开</div>
              <ThinkingBlock content={'先确认需求边界。\n用户要的是结构化错误，不是换一套鉴权流程。\n所以只动失败分支的响应体，成功分支保持不变。'} />
              <ThinkingBlock content={'这一段用于验证展开态：\n\n1. 检查现有实现\n2. 抽出错误码常量\n3. 更新所有调用点\n4. 跑类型检查'} />

              <div className="g-label" style={{ marginTop: 26 }}>权限卡片 · 低风险 / 高风险 / 已过期</div>
              <PermissionCard
                request={{ id: 'p_low', tool: 'write_file', description: '写入文件 src/server/utils/errors.ts', detail: '+ 24 行', risk: 'low' }}
                onRespond={() => {}}
              />
              <PermissionCard
                request={{ id: 'p_high', tool: 'run_command', description: '执行 shell 命令', detail: 'rm -rf dist/ && npm run build', risk: 'high', expiresAt: NOW + 60_000 }}
                onRespond={() => {}}
              />
              <PermissionCard
                request={{ id: 'p_noexp', tool: 'run_command', description: '不带倒计时的权限请求（expiresAt 缺省）', detail: 'npm run test', risk: 'low' }}
                onRespond={() => {}}
              />
            </div>
          </div>

          <div className="chat-composer-wrap">
            <div className="chat-chips">
              <button className="g-chip"><span className="chat-chip-text">E:\ai-chat-desktop</span></button>
              <button className="g-chip">gpt-5-codex</button>
            </div>
            <InputArea />
          </div>
        </div>
      </div>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Shell />);
