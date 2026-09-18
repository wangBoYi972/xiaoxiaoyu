import api from '../../../api';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Image, Popover, Slider, Typography, Badge, Tooltip } from 'antd';
import {
  SendOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  SettingOutlined,
  CodeOutlined,
  RocketOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useChatStore, ImageAttachment } from '../../stores/chat-store';
import { useModelStore } from '../../stores/model-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useWorkspaceStore, tabId, type Tab } from '../../stores/workspace-store';
import { useRunnerStore } from '../../stores/runner-store';
import { handleToolCall, handleToolResult, subscribeAgentConfirm, appendTextDelta, appendThinkingDelta } from '../../agent-bridge';

// Node 20+/Chromium 原生 UUID（替代 uuid 包，规避 GHSA-w5hq-g745-h8pq）
const uuidv4 = (): string => crypto.randomUUID();

const { Text } = Typography;

/** 仅在桌面端才有内置工具与工作区沙箱 */
const isElectron = !!(window as any).electronAPI;

export function InputArea({ onFirstSend }: { onFirstSend?: (text: string) => Promise<string | undefined> }) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [showParams, setShowParams] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const textAreaRef = useRef<any>(null);

  const workspace = useWorkspaceStore((s) => s.workspace);
  const { messages, isStreaming, conversationId, addMessage, appendToLastMessage, appendThinking, setStreaming, setConversationId, setError } = useChatStore();
  const { activeProviderId, activeModelId } = useModelStore();
  const { createConversation } = useConversationStore();

  const handleFileSelect = async () => {
    const files = await api.openFileDialog({ filters: [{ name: '图片', extensions: ['png','jpg','jpeg','gif','webp','bmp'] }] });
    if (!files.length) return;
    const imgs: ImageAttachment[] = [];
    for (const fp of files) {
      try {
        const fd = await api.readFile(fp);
        if (fd.mimeType.startsWith('image/')) imgs.push({ data: fd.data, mimeType: fd.mimeType, name: fd.name });
      } catch {}
    }
    setImages((p) => [...p, ...imgs]);
  };

  /** 发起一次聊天请求（用于手动输入、快捷启动项目等） */
  const sendText = useCallback(async (text: string) => {
    if (!text.trim() && !images.length) return;
    if (isStreaming) return;

    const finalText = text.trim() || '请描述这张图片';

    let msgContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    if (images.length > 0) {
      msgContent = [{ type: 'text', text: finalText }, ...images.map((img) => ({ type: 'image_url' as const, image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))];
    } else {
      msgContent = finalText;
    }

    addMessage({ id: uuidv4(), role: 'user', content: finalText, images: images.length > 0 ? [...images] : undefined, createdAt: Math.floor(Date.now() / 1000) });
    setInput('');
    setImages([]);
    const assistantMsgId = uuidv4();
    addMessage({ id: assistantMsgId, role: 'assistant', content: '', isStreaming: true, createdAt: Math.floor(Date.now() / 1000) });
    setStreaming(true);

    let convId = conversationId || null;
    if (!convId && onFirstSend) {
      const newId = await onFirstSend(finalText);
      if (newId) { convId = newId; setConversationId(newId); }
    }
    if (!convId) {
      const c = await createConversation(finalText.slice(0, 50), activeModelId, activeProviderId);
      convId = c.id;
      setConversationId(convId);
    }

    const msgHistory = [
      ...messages.map((m) => {
        if (m.images?.length) return { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((img: ImageAttachment) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))] };
        return { role: m.role, content: m.content };
      }),
      { role: 'user' as const, content: msgContent },
    ];

    let cleanup: (() => void) | null = null;
    let unsubscribeConfirm: (() => void) | null = null;
    const cleanupAll = () => {
      cleanup?.(); cleanup = null;
      unsubscribeConfirm?.(); unsubscribeConfirm = null;
    };

    try {
      let pendingText = '';
      let pendingThinking = '';
      let rafId: number | null = null;
      let isDone = false;

      const flushPending = () => {
        rafId = null;
        if (pendingText) { appendToLastMessage(pendingText); appendTextDelta(assistantMsgId, pendingText); pendingText = ''; }
        if (pendingThinking) { appendThinking(pendingThinking); appendThinkingDelta(assistantMsgId, pendingThinking); pendingThinking = ''; }
        if (isDone) { setStreaming(false); cleanupAll(); }
      };

      cleanup = api.onStreamChunk((chunk) => {
        if (useChatStore.getState().conversationId !== convId) {
          pendingText = '';
          pendingThinking = '';
          if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
          cleanupAll();
          api.stopGeneration();
          return;
        }
        if (chunk.type === 'text-delta' && chunk.textDelta) {
          pendingText += chunk.textDelta;
        } else if (chunk.type === 'thinking-delta' && chunk.thinkingDelta) {
          pendingThinking += chunk.thinkingDelta;
        } else if (chunk.type === 'tool-call' && chunk.toolCall) {
          handleToolCall(assistantMsgId, chunk.toolCall);
        } else if (chunk.type === 'tool-result' && chunk.toolResult) {
          handleToolResult(assistantMsgId, chunk.toolResult);
        } else if (chunk.type === 'error' && chunk.error) {
          isDone = true;
          if (rafId !== null) { cancelAnimationFrame(rafId); }
          flushPending();
          setError(chunk.error.message);
          return;
        } else if (chunk.type === 'done') {
          isDone = true;
        } else {
          return;
        }
        if (rafId === null) {
          rafId = requestAnimationFrame(flushPending);
        }
      });

      unsubscribeConfirm = subscribeAgentConfirm();

      const workspacePath = useWorkspaceStore.getState().workspace?.path;
      // 用户可手动关闭 Agent 模式；只有桌面端 + 有工作区 + 开启时才注入内置工具
      const effectiveAgentMode = agentMode && !!workspacePath && !!isElectron;

      if (effectiveAgentMode && activeProviderId === 'ollama') {
        addMessage({
          id: uuidv4(),
          role: 'system',
          content: '当前使用本地模型，小参数模型调用工具（读写文件/执行命令）的稳定性有限；如果它只回文字不动手，建议切到 DeepSeek、Qwen 等云端模型。',
          createdAt: Math.floor(Date.now() / 1000),
        });
      }

      await api.sendChatMessage({
        providerId: activeProviderId,
        modelId: activeModelId,
        messages: msgHistory,
        temperature,
        maxTokens: 4096,
        conversationId: convId,
        agentMode: effectiveAgentMode,
        workspacePath: effectiveAgentMode ? workspacePath : undefined,
      });
      cleanupAll();
    } catch (err: any) { setError(err.message || '发送失败'); setStreaming(false); cleanupAll(); }
  }, [input, images, isStreaming, messages, conversationId, activeProviderId, activeModelId, temperature, onFirstSend, agentMode]);

  const handleSend = useCallback(() => {
    sendText(input);
  }, [sendText, input]);

  /** 点击「启动项目」—— 打开终端标签，探测项目类型并启动第一个候选命令 */
  const handleLaunchProject = async () => {
    const electron = (window as any).electronAPI;
    if (!electron?.runner?.detect) return; // 浏览器预览没有启动能力

    // 打开（或复用）「运行」终端标签
    const ws = useWorkspaceStore.getState();
    const existing = ws.tabs.find((t) => t.type === 'terminal');
    if (existing) {
      ws.setActiveTab(existing.id);
    } else {
      const termTab: Tab = { id: tabId(), type: 'terminal', title: '运行', icon: 'rocket' };
      ws.addTab(termTab);
    }

    // 先探测项目类型与候选命令
    await useRunnerStore.getState().detectProject();
    const { detect } = useRunnerStore.getState();
    const first = detect?.commands[0];
    if (first) {
      useRunnerStore.getState().selectCommand(first.id);
      await useRunnerStore.getState().start();
    }
  };

  /** 打开工作区（代码大师未激活时点击） */
  const openWorkspace = async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.workspace?.open) return;
      const result = await api.workspace.open();
      if (result.success && result.workspace) {
        useWorkspaceStore.getState().setWorkspace(result.workspace);
        setAgentMode(true);
      }
    } catch {}
  };

  const isMobile = window.innerWidth < 768;

  const canLaunch = isElectron && !!workspace;

  return (
    <div style={{ width: '100%' }}>
      {/* 图片预览 */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <Image
                src={`data:${img.mimeType};base64,${img.data}`}
                width={56}
                height={56}
                style={{ borderRadius: 10, objectFit: 'cover' }}
                preview={{ mask: '' }}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  minWidth: 18,
                  fontSize: 10,
                  background: 'var(--g-panel-strong)',
                  border: '1px solid var(--g-stroke)',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* 玻璃输入容器 */}
      <div className="composer">
        <textarea
          ref={textAreaRef}
          className="composer-input g-scroll"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 220) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            images.length > 0 ? '描述图片… (Enter 发送)' : '给小小榆下达任务… (Enter 发送, Shift+Enter 换行)'
          }
          rows={1}
          disabled={isStreaming}
        />

        {/* 底部工具条 */}
        <div className="composer-bar">
          <button className="g-icon-btn" onClick={handleFileSelect} title="上传图片">
            <PictureOutlined />
          </button>

          {/* 代码大师 / Agent 模式开关 */}
          <Tooltip
            title={
              !isElectron
                ? '代码大师模式仅限桌面端使用'
                : workspace
                ? agentMode
                  ? '代码大师已开启：Agent 可操作项目文件并执行命令'
                  : '代码大师已关闭：本次仅做普通对话'
                : '点击选择项目目录以开启代码大师'
            }
          >
            <button
              className={`g-chip composer-mode-chip ${agentMode && workspace ? 'active' : ''}`}
              onClick={() => {
                if (!workspace) { openWorkspace(); return; }
                setAgentMode((v) => !v);
              }}
              title="代码大师"
            >
              <CodeOutlined />
              <span>代码大师</span>
              {workspace && (
                <Badge
                  status={agentMode ? 'success' : 'default'}
                  style={{ marginLeft: 4 }}
                />
              )}
            </button>
          </Tooltip>

          {/* 启动项目：桌面端且已选择工作区时显示 */}
          {canLaunch && (
            <Tooltip title="打开运行面板并启动项目（支持 Maven / Gradle / Node / Python / Go / 静态站点）">
              <button
                className="g-chip composer-mode-chip launch"
                onClick={handleLaunchProject}
                title="启动项目"
              >
                <RocketOutlined />
                <span>启动项目</span>
              </button>
            </Tooltip>
          )}

          {/* 温度参数 */}
          <Popover
            open={showParams}
            onOpenChange={setShowParams}
            trigger="click"
            content={
              <div style={{ width: 220 }}>
                <Text style={{ fontSize: 12 }}>温度 (创造性): {temperature.toFixed(1)}</Text>
                <Slider
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={setTemperature}
                  marks={{ 0: '精确', 1: '平衡', 2: '创意' }}
                />
              </div>
            }
          >
            <button className="g-icon-btn" title="参数">
              <SettingOutlined />
            </button>
          </Popover>

          <div style={{ flex: 1 }} />

          {/* 发送 / 停止 */}
          {isStreaming ? (
            <button
              className="g-send stop"
              title="停止生成"
              onClick={() => {
                api.stopGeneration();
                setStreaming(false);
              }}
            >
              <PauseCircleOutlined />
            </button>
          ) : (
            <button
              className="g-send"
              title="发送"
              onClick={handleSend}
              disabled={!(input.trim() || images.length)}
            >
              <SendOutlined />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
