import api from '../../../api';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Input, Select, Space, Tooltip, Image, Popover, Slider, Typography, Tag } from 'antd';
import { SendOutlined, PauseCircleOutlined, PictureOutlined, SettingOutlined, ThunderboltOutlined, CloseOutlined } from '@ant-design/icons';
import { useChatStore, ImageAttachment } from '../../stores/chat-store';
import { useModelStore } from '../../stores/model-store';
import { useConversationStore } from '../../stores/conversation-store';
import { v4 as uuidv4 } from 'uuid';

const { Text } = Typography;

interface SkillItem {
  id: string; name: string; description: string; icon: string; category: string; systemPrompt: string; temperature?: number;
}

export function InputArea() {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [allSkills, setAllSkills] = useState<SkillItem[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [showParams, setShowParams] = useState(false);
  const textAreaRef = useRef<any>(null);

  const { messages, isStreaming, conversationId, addMessage, appendToLastMessage, appendThinking, setStreaming, setConversationId, setError } = useChatStore();
  const { activeProviderId, activeModelId, availableModels, setActiveProvider, setActiveModel } = useModelStore();
  const { createConversation, activeId } = useConversationStore();

  // 加载技能
  useEffect(() => {
    api.listSkills().then((list: SkillItem[]) => { setAllSkills(list || []); }).catch(() => {});
  }, []);

  // 组合选中的技能提示词
  const combinedSysPrompt = activeSkillIds
    .map((id) => allSkills.find((s) => s.id === id)?.systemPrompt)
    .filter(Boolean)
    .join('\n\n');

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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && !images.length) return;
    if (isStreaming) return;

    // ====== 技能安装命令检测 ======
    const installMatch = text.match(/^(安装|添加|启用|下载)\s*(技能|skill)[:：]?\s*(.+)$/i);
    const listMatch  = text.match(/^(技能列表|技能市场|有哪些技能|查看技能)/i);
    const delMatch   = text.match(/^(删除|卸载|移除)\s*(技能|skill)[:：]?\s*(.+)$/i);

    if (installMatch) {
      const query = installMatch[3].trim().toLowerCase();
      const target = allSkills.find((s) =>
        s.id.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      );
      if (target) {
        await api.installSkill({ skill: target });
        setActiveSkillIds((prev) => prev.includes(target.id) ? prev : [...prev, target.id]);
        addMessage({ id: uuidv4(), role: 'system', content: `技能「${target.name}」已安装并启用`, createdAt: Math.floor(Date.now() / 1000) });
      } else {
        addMessage({ id: uuidv4(), role: 'system', content: `未找到匹配"${query}"的技能。输入"技能列表"查看所有可用技能`, createdAt: Math.floor(Date.now() / 1000) });
      }
      setInput('');
      return;
    }

    if (listMatch) {
      const list = allSkills.map((s) => `${s.icon} **${s.name}** (${s.id}) - ${s.description}`).join('\n');
      addMessage({ id: uuidv4(), role: 'system', content: `## 可用技能\n\n${list}\n\n输入"安装技能 XXX"即可安装`, createdAt: Math.floor(Date.now() / 1000) });
      setInput('');
      return;
    }

    if (delMatch) {
      const query = delMatch[3].trim().toLowerCase();
      const target = allSkills.find((s) =>
        s.id.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query)
      );
      if (target) {
        await api.deleteSkill(target.id);
        setActiveSkillIds((prev) => prev.filter((id) => id !== target.id));
        addMessage({ id: uuidv4(), role: 'system', content: `技能「${target.name}」已卸载`, createdAt: Math.floor(Date.now() / 1000) });
      } else {
        addMessage({ id: uuidv4(), role: 'system', content: `未找到技能"${query}"`, createdAt: Math.floor(Date.now() / 1000) });
      }
      setInput('');
      return;
    }

    // ====== 正常发送 ======
    const finalText = text || '请描述这张图片';

    let msgContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    if (images.length > 0) {
      msgContent = [{ type: 'text', text: finalText }, ...images.map((img) => ({ type: 'image_url' as const, image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))];
    } else {
      msgContent = finalText;
    }

    addMessage({ id: uuidv4(), role: 'user', content: finalText, images: images.length > 0 ? [...images] : undefined, createdAt: Math.floor(Date.now() / 1000) });
    setInput(''); setImages([]);
    addMessage({ id: uuidv4(), role: 'assistant', content: '', isStreaming: true, createdAt: Math.floor(Date.now() / 1000) });
    setStreaming(true);

    let convId = conversationId || activeId;
    if (!convId) { const c = await createConversation(finalText.slice(0, 50), activeModelId, activeProviderId); convId = c.id; setConversationId(convId); }

    const msgHistory = [
      ...messages.map((m) => {
        if (m.images?.length) return { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((img: ImageAttachment) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))] };
        return { role: m.role, content: m.content };
      }),
      { role: 'user' as const, content: msgContent },
    ];

    let cleanup: (() => void) | null = null;
    try {
      // RAF 节流：将高频 chunk 合并到每帧一次的状态更新，避免 React 过载
      let pendingText = '';
      let pendingThinking = '';
      let rafId: number | null = null;
      let isDone = false;

      const flushPending = () => {
        rafId = null;
        if (pendingText) { appendToLastMessage(pendingText); pendingText = ''; }
        if (pendingThinking) { appendThinking(pendingThinking); pendingThinking = ''; }
        if (isDone) { setStreaming(false); if (cleanup) cleanup(); }
      };

      cleanup = api.onStreamChunk((chunk) => {
        if (chunk.type === 'text-delta' && chunk.textDelta) {
          pendingText += chunk.textDelta;
        } else if (chunk.type === 'thinking-delta' && chunk.thinkingDelta) {
          pendingThinking += chunk.thinkingDelta;
        } else if (chunk.type === 'error' && chunk.error) {
          if (rafId !== null) { cancelAnimationFrame(rafId); flushPending(); }
          setError(chunk.error.message);
          return;
        } else if (chunk.type === 'done') {
          isDone = true;
        } else {
          return; // 其他类型不处理
        }
        // 每帧最多更新一次 React 状态
        if (rafId === null) {
          rafId = requestAnimationFrame(flushPending);
        }
      });
      await api.sendChatMessage({ providerId: activeProviderId, modelId: activeModelId, messages: msgHistory, systemPrompt: combinedSysPrompt || undefined, temperature, maxTokens: 4096, conversationId: convId });
    } catch (err: any) { setError(err.message || '发送失败'); setStreaming(false); if (cleanup) cleanup(); }
  }, [input, images, isStreaming, messages, conversationId, activeId, activeProviderId, activeModelId, combinedSysPrompt, temperature]);

  const providerOptions = [
    { label: 'Claude', value: 'anthropic' }, { label: 'OpenAI', value: 'openai' }, { label: 'DeepSeek', value: 'deepseek' },
    { label: '通义千问', value: 'qwen' }, { label: '智谱GLM', value: 'glm' }, { label: 'Kimi', value: 'moonshot' },
    { label: 'Gemini', value: 'gemini' }, { label: '文心一言', value: 'ernie' }, { label: 'Ollama', value: 'ollama' },
  ];

  const isMobile = window.innerWidth < 768;
  return (
    <div style={{ padding: isMobile ? '8px 8px 12px' : '12px 24px 16px', maxWidth: 800, margin: '0 auto 16px', width: '100%' }}>
      {/* 图片预览 */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <Image src={`data:${img.mimeType};base64,${img.data}`} width={56} height={56} style={{ borderRadius: 10, objectFit: 'cover' }} preview={{ mask: '' }} />
              <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -8, right: -8, borderRadius: '50%', width: 18, height: 18, minWidth: 18, fontSize: 10, background: 'rgba(255,255,255,0.9)' }} />
            </div>
          ))}
        </div>
      )}

      {/* 模型 + 技能选择 */}
      <Space style={{ marginBottom: 6, flexWrap: 'wrap' }} size={4}>
        <Select size="small" value={activeProviderId} onChange={setActiveProvider} options={providerOptions} style={{ minWidth: 80 }} bordered={false} />
        <Select size="small" value={activeModelId} onChange={setActiveModel}
          options={availableModels.map((m) => ({ label: m.displayName, value: m.id }))} style={{ minWidth: 140 }} bordered={false} />
        <Select mode="multiple" size="small" value={activeSkillIds} onChange={setActiveSkillIds}
          placeholder={<span><ThunderboltOutlined /> 技能</span>}
          bordered={false} style={{ minWidth: 120, maxWidth: 220 }}
          maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length}`}
          options={allSkills.map((s) => ({ label: `${s.icon} ${s.name}`, value: s.id }))} />
        <Popover open={showParams} onOpenChange={setShowParams} trigger="click"
          content={<div style={{ width: 220 }}>
            <Text style={{ fontSize: 12 }}>温度 (创造性): {temperature.toFixed(1)}</Text>
            <Slider min={0} max={2} step={0.1} value={temperature} onChange={setTemperature} marks={{ 0: '精确', 1: '平衡', 2: '创意' }} />
          </div>}>
          <Button size="small" type="text" icon={<SettingOutlined />} />
        </Popover>
      </Space>

      {/* 输入区 */}
      <div className="glass-input" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderRadius: 16, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
        <Tooltip title="上传图片"><Button type="text" className="btn-icon" icon={<PictureOutlined />} onClick={handleFileSelect} /></Tooltip>
        <Input.TextArea ref={textAreaRef} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={images.length > 0 ? '描述图片... (Enter 发送)' : '输入消息... (Enter 发送, Shift+Enter 换行)'}
          autoSize={{ minRows: 1, maxRows: 6 }} variant="borderless" style={{ background: 'transparent', flex: 1 }} disabled={isStreaming} />
        {isStreaming
          ? <Tooltip title="停止"><Button type="text" danger className="btn-icon" icon={<PauseCircleOutlined />} onClick={() => { api.stopGeneration(); setStreaming(false); }} /></Tooltip>
          : <Tooltip title="发送"><Button type="primary" className="btn-send" icon={<SendOutlined />} onClick={handleSend} disabled={!(input.trim() || images.length)} /></Tooltip>}
      </div>
    </div>
  );
}
