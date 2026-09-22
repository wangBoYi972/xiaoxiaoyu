import React from 'react';
import MessageBubble, { type ChatMessageView } from './MessageBubble';
import type { ChatMessage } from '../../stores/chat-store';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onCopy?: (text: string) => void;
  onRegenerate?: (msg: ChatMessage) => void;
  onPermissionRespond?: (id: string, d: 'allow' | 'deny') => void;
}

/**
 * 一次最多渲染的消息条数。
 * 每条消息都是一块 Markdown + 可能的工具卡片，几千条时 DOM 会把渲染层拖死；
 * 超出的历史仍在数据库里（切换会话/搜索都能看到），这里只做展示层的截断。
 */
const MAX_RENDERED = 300;

export function MessageList({
  messages,
  isStreaming,
  onCopy,
  onRegenerate,
  onPermissionRespond,
}: MessageListProps) {
  if (messages.length === 0) {
    return null;
  }

  const hidden = Math.max(0, messages.length - MAX_RENDERED);
  const visible = hidden > 0 ? messages.slice(hidden) : messages;

  const render = (msg: ChatMessage, index: number, isLast: boolean) => {
    // 系统消息：居中提示条
    if (msg.role === 'system') {
      return (
        <div key={msg.id} className="chat-system">
          {msg.content}
        </div>
      );
    }

    const view: ChatMessageView = {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking,
      segments: msg.segments,
      toolCalls: msg.toolCalls,
      permission: msg.permission,
      createdAt: msg.createdAt,
      streaming: (msg.isStreaming ?? false) || (isStreaming && isLast),
    };

    return (
      <MessageBubble
        key={msg.id}
        message={view}
        onCopy={onCopy}
        onRegenerate={isLast ? () => onRegenerate?.(msg) : undefined}
        onPermissionRespond={onPermissionRespond}
      />
    );
  };

  return (
    <div className="chat-list">
      {hidden > 0 && (
        <div className="chat-system">
          已省略较早的 {hidden} 条消息（完整内容保存在本地数据库中）
        </div>
      )}
      {visible.map((msg, i) => render(msg, i, i === visible.length - 1))}
    </div>
  );
}
