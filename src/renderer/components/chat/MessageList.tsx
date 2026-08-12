import React from 'react';
import { MessageBubble } from './MessageBubble';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorMessage?: string;
  createdAt: number;
}

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
      {messages.map((msg, index) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isLast={index === messages.length - 1}
          isStreaming={isStreaming && index === messages.length - 1}
        />
      ))}
    </div>
  );
}
