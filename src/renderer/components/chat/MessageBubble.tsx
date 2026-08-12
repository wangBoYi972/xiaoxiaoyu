import React from 'react';
import { Avatar, Button, Space, Tooltip, Typography, Image } from 'antd';
import { UserOutlined, RobotOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import type { ImageAttachment } from '../../stores/chat-store';

const { Text } = Typography;

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageAttachment[];
  thinking?: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorMessage?: string;
  createdAt: number;
}

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  isStreaming: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({ message, isLast, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasThinking = message.thinking && message.thinking.length > 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  return (
    <div className="msg-enter"
      style={{
        display: 'flex',
        gap: 12,
        padding: '14px 0',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      {/* 头像 */}
      <Avatar
        size={42}
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={{
          background: isUser
            ? 'linear-gradient(135deg, #1677ff, #4096ff)'
            : 'linear-gradient(135deg, #722ed1, #b37feb)',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
        }}
      />

      {/* 消息内容 */}
      <div style={{ flex: 1, minWidth: 0, fontSize: 15 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <Text strong style={{ fontSize: 14 }}>
            {isUser ? '你' : '小小榆'}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(message.createdAt * 1000).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </div>

        {/* 思考过程 */}
        {hasThinking && <ThinkingBlock content={message.thinking || ''} />}

        {/* 错误信息 */}
        {message.isError && (
          <div
            style={{
              padding: '8px 12px',
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <Text type="danger">{message.errorMessage || '请求失败'}</Text>
          </div>
        )}

        {/* 用户上传的图片 */}
        {message.images && message.images.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {message.images.map((img, i) => {
              const src = `data:${img.mimeType};base64,${img.data}`;
              return (
                <Image
                  key={i}
                  src={src}
                  width={120}
                  style={{ borderRadius: 12, objectFit: 'cover', border: '1px solid rgba(0,0,0,0.08)' }}
                  preview={{ mask: '点击预览' }}
                />
              );
            })}
          </div>
        )}

        {/* 消息文本 */}
        <div
          className="markdown-content glass-bubble"
          style={{
            background: isUser
              ? 'rgba(22,119,255,0.12)'
              : 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '14px 18px',
            borderRadius: 16,
            borderTopRightRadius: isUser ? 6 : 16,
            borderTopLeftRadius: isUser ? 16 : 6,
            border: isUser
              ? '1px solid rgba(22,119,255,0.18)'
              : '1px solid rgba(255,255,255,0.45)',
            lineHeight: 1.7,
            boxShadow: isUser
              ? '0 2px 8px rgba(22,119,255,0.06)'
              : '0 4px 16px rgba(0,0,0,0.04)',
          }}
        >
          {isUser ? (
            <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
          ) : (
            <MarkdownRenderer
              content={message.content}
              isStreaming={isStreaming}
            />
          )}
        </div>

        {/* 操作按钮 */}
        {!isUser && !isStreaming && message.content && (
          <Space style={{ marginTop: 4 }}>
            <Tooltip title="复制">
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy} />
            </Tooltip>
            {isLast && (
              <Tooltip title="重新生成">
                <Button type="text" size="small" icon={<ReloadOutlined />} />
              </Tooltip>
            )}
          </Space>
        )}
      </div>
    </div>
  );
});
