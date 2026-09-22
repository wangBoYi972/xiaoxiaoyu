import api, { type SkillItem } from '../../../api';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Dropdown, Image, Popover, Slider, Typography, Tooltip } from 'antd';
import {
  SendOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  SettingOutlined,
  CodeOutlined,
  RocketOutlined,
  CloseOutlined,
  DownOutlined,
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

const FALLBACK_SKILLS: SkillItem[] = [
  { id: 'coder', name: '代码大师', description: '编程、调试、架构设计、代码审查', icon: '💻', category: 'coding', systemPrompt: '你是一位资深软件工程师。请先分析需求和风险，再给出可运行、可验证的实现建议；代码使用清晰的英文标识符和必要注释。', version: '1.0' },
  { id: 'general', name: '通用助手', description: '多领域智能问答', icon: '🤖', category: 'utility', systemPrompt: '你是一位可靠的通用助手。请准确理解用户目标，给出清晰、可执行且符合事实的回答。', version: '1.0' },
  { id: 'writer', name: '文案策划', description: '营销文案、品牌策划、创意写作', icon: '✍️', category: 'writing', systemPrompt: '你是一位资深文案策划。请根据目标受众、场景和品牌调性输出有感染力、可直接使用的中文文案。', version: '1.0' },
  { id: 'analyst', name: '数据分析', description: '数据解读、可视化建议、报告生成', icon: '📊', category: 'analysis', systemPrompt: '你是一位资深数据分析师。请明确分析口径和假设，提炼可验证的洞见，并提出合适的可视化与下一步建议。', version: '1.0' },
  { id: 'translator', name: '翻译专家', description: '中英日韩多语种精准翻译', icon: '🌐', category: 'writing', systemPrompt: '你是一位专业翻译。请准确、流畅地翻译，保留原文含义、语气、格式和专有名词；必要时简要说明歧义。', version: '1.0' },
  { id: 'creative', name: '创意灵感', description: '头脑风暴、故事创作、创新思维', icon: '💡', category: 'creative', systemPrompt: '你是一位创意顾问。请从多个不同角度提出具体、新颖且可落地的创意，并说明各方案适用的场景。', version: '1.0' },
];

export function InputArea({ onFirstSend }: { onFirstSend?: (text: string) => Promise<string | undefined> }) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [showParams, setShowParams] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);
  const [skills, setSkills] = useState<SkillItem[]>(FALLBACK_SKILLS);
  const [selectedSkillId, setSelectedSkillId] = useState('coder');
  const textAreaRef = useRef<any>(null);

  const workspace = useWorkspaceStore((s) => s.workspace);
  const { messages, isStreaming, conversationId, addMessage, appendToLastMessage, appendThinking, setStreaming, setConversationId, setError } = useChatStore();
  const { activeProviderId, activeModelId, availableModels } = useModelStore();
  const { createConversation } = useConversationStore();
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) || skills[0] || FALLBACK_SKILLS[0];

  useEffect(() => {
    let alive = true;
    api.listSkills().then((items) => {
      if (!alive || !Array.isArray(items) || items.length === 0) return;
      setSkills(items);
      if (!items.some((skill) => skill.id === selectedSkillId)) setSelectedSkillId(items[0].id);
    }).catch(() => {});
    return () => { alive = false; };
  }, [selectedSkillId]);

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
      const activeModel = availableModels.find((model) => model.id === activeModelId);
      const canUseTools = !!activeModel?.supportsTools;
      // 只有显式开启「代码大师」、已打开工作区且模型已验证支持工具时才允许 Agent 操作项目。
      const effectiveAgentMode = agentMode && selectedSkill.id === 'coder' && canUseTools && !!workspacePath && !!isElectron;

      if (agentMode && selectedSkill.id === 'coder' && !canUseTools) {
        addMessage({
          id: uuidv4(),
          role: 'system',
          content: '当前模型仅支持问答，未验证工具调用能力，已关闭代码协作。请选择支持工具调用的云端模型后再开启。',
          createdAt: Math.floor(Date.now() / 1000),
        });
      }


      await api.sendChatMessage({
        providerId: activeProviderId,
        modelId: activeModelId,
        messages: msgHistory,
        temperature,
        systemPrompt: selectedSkill.systemPrompt || undefined,
        maxTokens: 4096,
        conversationId: convId,
        agentMode: effectiveAgentMode,
        workspacePath: effectiveAgentMode ? workspacePath : undefined,
      });
      cleanupAll();
    } catch (err: any) { setError(err.message || '发送失败'); setStreaming(false); cleanupAll(); }
  }, [input, images, isStreaming, messages, conversationId, activeProviderId, activeModelId, availableModels, temperature, onFirstSend, agentMode, selectedSkill]);

  const handleSend = useCallback(() => {
    sendText(input);
  }, [sendText, input]);

  /** 打开（或复用）「运行」终端标签，不自动启动 */
  const openRunPanel = useCallback(() => {
    const ws = useWorkspaceStore.getState();
    const existing = ws.tabs.find((t) => t.type === 'terminal');
    if (existing) {
      ws.setActiveTab(existing.id);
    } else {
      const termTab: Tab = { id: tabId(), type: 'terminal', title: '运行', icon: 'rocket' };
      ws.addTab(termTab);
    }
  }, []);

  /** 点击「启动项目」—— 打开终端标签并探测候选命令，执行由用户在面板中确认。 */
  const handleLaunchProject = async () => {
    const electron = (window as any).electronAPI;
    if (!electron?.runner?.detect) return; // 浏览器预览没有启动能力

    openRunPanel();

    // 只探测项目类型与候选命令，绝不自动执行第一条命令。
    await useRunnerStore.getState().detectProject();
  };

  /** 打开工作区（代码大师未激活时点击） */
  const openWorkspace = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.workspace?.open) return;
      const result = await api.workspace.open();
      if (result.success && result.workspace) {
        useWorkspaceStore.getState().setWorkspace(result.workspace);
        setAgentMode(false);
      }
    } catch {}
  }, []);

  const isMobile = window.innerWidth < 768;

  const canLaunch = isElectron && !!workspace;

  /* ---- IDE 风格快捷键（仅桌面端生效）----
   * Ctrl+I  开/关 代码大师（Agent 模式）
   * Ctrl+O  选择项目目录（开启代码大师）
   * Ctrl+`  打开/聚焦 运行面板
   * Esc     停止生成（输入框为空时） */
  useEffect(() => {
    if (!isElectron) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setMasterOpen(true);
      } else if (mod && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        openWorkspace();
      } else if (mod && e.code === 'Backquote') {
        e.preventDefault();
        openRunPanel();
      } else if (e.key === 'Escape' && isStreaming) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        const typing = tag === 'TEXTAREA' || tag === 'INPUT';
        if (!typing) {
          api.stopGeneration();
          setStreaming(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isElectron, workspace, isStreaming, openWorkspace, openRunPanel]);

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

          {/* 代码大师 / Agent 模式：IDE 风格下拉菜单 */}
          <Dropdown
            trigger={['click']}
            open={masterOpen}
            onOpenChange={setMasterOpen}
            overlayClassName="master-skills-dropdown"
            overlayStyle={{ minWidth: 248 }}
            menu={{
              items: skills.map((skill) => ({
                key: skill.id,
                label: (
                  <div className="master-skill-item">
                    <span className="master-skill-icon">{skill.icon}</span>
                    <span className="master-skill-copy">
                      <span className="master-skill-name">{skill.name}</span>
                      <span className="master-skill-desc">{skill.description}</span>
                    </span>
                    {selectedSkillId === skill.id && <span className="master-skill-check">✓</span>}
                  </div>
                ),
              })),
              selectable: false,
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                setMasterOpen(false);
                const skill = skills.find((item) => item.id === key);
                if (skill) {
                  setSelectedSkillId(skill.id);
                  if (skill.id !== 'coder') setAgentMode(false);
                }
              },
            }}
            dropdownRender={(menu) => (
              <>
                <div className="master-menu-title"><CodeOutlined /> 选择技能</div>
                {menu}
                {workspace && selectedSkill.id === 'coder' && (
                  <button
                    type="button"
                    className="master-menu-agent-toggle"
                    onClick={() => setAgentMode((enabled) => !enabled)}
                  >
                    {agentMode ? '关闭代码协作' : '开启代码协作'}
                  </button>
                )}
                <div className="master-menu-footer">
                  {workspace ? (
                    <>
                      <span className="master-menu-dot on" />
                      <span className="master-menu-path" title={workspace.path}>{workspace.name || workspace.path}</span>
                    </>
                  ) : (
                    <span className="master-menu-path muted">未选择项目目录</span>
                  )}
                  <span className={`master-menu-state ${selectedSkill.id === 'coder' && agentMode && workspace ? 'on' : ''}`}>
                    {selectedSkill.name}
                  </span>
                </div>
              </>
            )}
          >
            <button
              className={`g-chip composer-mode-chip has-caret ${agentMode && workspace ? 'active' : ''}`}
              title="代码大师菜单"
            >
              <CodeOutlined />
              <span>{selectedSkill.name}</span>
              {workspace && selectedSkill.id === 'coder' && <span className={`chip-state-dot ${agentMode ? 'on' : ''}`} />}
              <DownOutlined className="chip-caret" />
            </button>
          </Dropdown>

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
            overlayClassName="temperature-popover"
            placement="topRight"
            content={
              <div className="temperature-card">
                <div className="temperature-card-title">
                  <span>温度</span>
                  <strong>{temperature.toFixed(1)}</strong>
                </div>
                <Slider
                  className="temperature-slider"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={setTemperature}
                  tooltip={{ formatter: (value) => value === undefined ? '' : value.toFixed(1) }}
                />
                <div className="temperature-labels">
                  <span>精确</span>
                  <span>平衡</span>
                  <span>创意</span>
                </div>
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
