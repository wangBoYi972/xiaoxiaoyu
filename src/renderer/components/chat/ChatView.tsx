import React, { useEffect, useRef } from 'react';
import api from '../../../api';
import { useChatStore, type ChatMessage } from '../../stores/chat-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { respondPermission } from '../../agent-bridge';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { ComposerHeader } from './ComposerHeader';

interface ChatViewProps {
  /** 常驻「对话」标签页在首条消息发出前还没有会话 id，允许为空 */
  conversationId?: string;
}

export default function ChatView({ conversationId }: ChatViewProps) {
  const { messages, isStreaming, setConversationId, clearMessages, loadMessages } = useChatStore();
  const messageListRef = useRef<HTMLDivElement>(null);
  // 项目名的唯一真源是 workspace store（localStorage 只用于启动时恢复上次项目）
  const projectName = useWorkspaceStore(s => s.workspace?.name || '');

  // 会话切换：
  //  · 同一条会话且消息已在内存（从文件标签切回来）→ 不动，避免打断流式/重复加载
  //  · 换了会话 → 从数据库加载该会话的消息（否则切换会话后画面停留在旧内容）
  //  · 没有会话 → 清空
  useEffect(() => {
    const store = useChatStore.getState();
    if (conversationId && store.conversationId === conversationId && store.messages.length > 0) {
      return;
    }
    setConversationId(conversationId || null);
    if (!conversationId) {
      clearMessages();
      return;
    }
    let cancelled = false;
    api.listMessages(conversationId)
      .then((rows) => {
        if (cancelled) return;
        loadMessages(rows.map(m => ({
          id: m.id,
          role: m.role as ChatMessage['role'],
          content: m.content,
          createdAt: m.createdAt,
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, setConversationId, clearMessages, loadMessages]);

  useEffect(() => {
    if (messageListRef.current) {
      requestAnimationFrame(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
        }
      });
    }
  }, [messages.length, isStreaming ? messages[messages.length - 1]?.content?.length : null]);

  return (
    <div className="chat-root">
      <div ref={messageListRef} className="chat-scroll g-scroll">
        {/* 空会话居中欢迎 */}
        {!messages.length && (
          <div className="chat-empty">
            <div className="chat-empty-mark">⌘</div>
            <div className="chat-empty-title">
              在{' '}
              <span className="chat-empty-project">{projectName || '当前目录'}</span>{' '}
              里想构建什么？
            </div>
          </div>
        )}
        <MessageList messages={messages} isStreaming={isStreaming} onPermissionRespond={respondPermission} />
      </div>

      {/* 底部输入区 */}
      <div className="chat-composer-wrap">
        <ComposerHeader />
        <InputArea />
      </div>
    </div>
  );
}
