import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  isStreaming: boolean;
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  const processedContent = useMemo(() => {
    if (!content) return '';
    return content;
  }, [content]);

  return (
    <div className={isStreaming ? 'streaming-cursor' : ''}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            return isInline ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto' }}>
                <table>{children}</table>
              </div>
            );
          },
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt}
                style={{ maxWidth: '100%', borderRadius: 8, margin: '8px 0' }}
              />
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});
