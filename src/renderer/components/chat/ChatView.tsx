import React, { useEffect, useRef } from 'react';
import { Typography } from 'antd';
import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useChatStore } from '../../stores/chat-store';
import { useModelStore } from '../../stores/model-store';
import { useConversationStore } from '../../stores/conversation-store';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';

const { Text } = Typography;

/** 时间格式化 */
function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function ChatView() {
  const { messages, isStreaming, conversationId } = useChatStore();
  const { activeModelId, availableModels } = useModelStore();
  const { conversations } = useConversationStore();
  const messageListRef = useRef<HTMLDivElement>(null);

  const conv = conversations.find((c) => c.id === conversationId);
  const model = availableModels.find((m) => m.id === activeModelId);

  useEffect(() => {
    if (messageListRef.current) {
      // 使用 RAF 避免与渲染帧不同步
      requestAnimationFrame(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
        }
      });
    }
  }, [messages.length, isStreaming ? messages[messages.length - 1]?.content?.length : null]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ===== 对话顶部信息栏 ===== */}
      <div style={{
        padding: window.innerWidth < 768 ? '8px 10px' : '10px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(0,0,0,0.04)',
        background: 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #1677ff, #722ed1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(22,119,255,0.2)',
          }}>
            <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 14 }}>{conv?.title || '对话'}</Text>
            {model && (
              <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                <ThunderboltOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                {model.displayName}
              </Text>
            )}
          </div>
        </div>
        {conv && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {conv.messageCount} 条消息
          </Text>
        )}
      </div>

      {/* ===== 消息列表 ===== */}
      <div ref={messageListRef} className="message-list-container" style={{ flex: 1, overflow: 'auto' }}>
        <MessageList messages={messages} isStreaming={isStreaming} />
      </div>

      {/* ===== 输入区域 ===== */}
      <div style={{ flexShrink: 0 }}>
        <InputArea />
      </div>
    </div>
  );
}
