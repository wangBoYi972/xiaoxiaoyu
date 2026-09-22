import React, { useState } from 'react';
import { CheckOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { MarkdownRenderer } from './MarkdownRenderer';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock, { type ToolCallInfo } from './ToolCallBlock';
import PermissionCard, { type PermissionRequest } from './PermissionCard';

/**
 * 消息气泡 — 玻璃质感
 * 一条 assistant 消息内可能有：思考块 → 文本 → 工具调用块（交错）
 * 所以这里按「内容片段」顺序渲染，而不是把工具调用当纯文本。
 */

export interface MessageSegment {
  kind: 'text' | 'thinking' | 'tool';
  text?: string;
  toolCallId?: string;
}

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  /** 有序内容片段（有则优先按它渲染） */
  segments?: MessageSegment[];
  toolCalls?: Record<string, ToolCallInfo>;
  permission?: PermissionRequest;
  createdAt?: number;
  streaming?: boolean;
}

interface Props {
  message: ChatMessageView;
  onCopy?: (text: string) => void;
  onRegenerate?: () => void;
  onPermissionRespond?: (id: string, d: 'allow' | 'deny') => void;
}

const fmtTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const MessageBubble: React.FC<Props> = ({ message, onCopy, onRegenerate, onPermissionRespond }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    const t = message.content || '';
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    onCopy?.(t);
  };

  /* ---------- 渲染一组内容片段 ---------- */
  const renderBody = () => {
    const segs = message.segments;
    if (segs && segs.length > 0) {
      return segs.map((s, i) => {
        if (s.kind === 'thinking') {
          return <ThinkingBlock key={i} content={s.text || ''} />;
        }
        if (s.kind === 'tool') {
          const call = s.toolCallId ? message.toolCalls?.[s.toolCallId] : undefined;
          if (!call) return null;
          return <ToolCallBlock key={call.id} call={call} />;
        }
        // 流式光标只挂在最后一个文本片段上，否则每个片段都带一个光标
        const isLastText = i === segs.length - 1;
        return (
          <div key={i} className="markdown-content">
            <MarkdownRenderer
              content={s.text || ''}
              isStreaming={!!message.streaming && isLastText}
            />
          </div>
        );
      });
    }

    /* 无片段信息时回退到简单渲染 */
    return (
      <>
        {message.thinking && <ThinkingBlock content={message.thinking} />}
        {!!message.toolCalls && Object.values(message.toolCalls).map((c) => (
          <ToolCallBlock key={c.id} call={c} />
        ))}
        {!!message.content && (
          <div className="markdown-content">
            <MarkdownRenderer
              content={message.content}
              isStreaming={!!message.streaming}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      {/* 头像 */}
      <div className={`msg-avatar ${isUser ? 'user' : 'agent'}`}>
        {isUser ? '我' : <span className="dot" />}
      </div>

      {/* 正文 */}
      <div className="msg-col">
        <div className="msg-meta">
          <span>{isUser ? '我' : 'Agent'}</span>
          {!!message.createdAt && <span>{fmtTime(message.createdAt)}</span>}
        </div>

        {!isUser ? (
          <div className="msg-bubble agent">
            {renderBody()}
          </div>
        ) : (
          <div className="msg-bubble user">
            <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
          </div>
        )}

        {/* 权限确认（附在 agent 消息末尾） */}
        {!isUser && message.permission && onPermissionRespond && (
          <PermissionCard request={message.permission} onRespond={onPermissionRespond} />
        )}

        {/* 操作条 */}
        <div className="msg-actions">
          <button className="msg-act" onClick={handleCopy} title="复制">
            {copied ? <CheckOutlined /> : <CopyOutlined />} {copied ? '已复制' : '复制'}
          </button>
          {!isUser && onRegenerate && (
            <button className="msg-act" onClick={onRegenerate} title="重新生成">
              <ReloadOutlined /> 重试
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
