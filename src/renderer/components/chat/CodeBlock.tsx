import React from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        margin: '8px 0',
        border: '1px solid rgba(255,255,255,0.2)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      {/* 代码头 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 14px',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          {language || 'text'}
        </Text>
        <Tooltip title={copied ? '已复制' : '复制代码'}>
          <Button
            type="text"
            size="small"
            icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
            onClick={handleCopy}
          />
        </Tooltip>
      </div>

      {/* 代码内容 */}
      <pre
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: '16px',
          margin: 0,
          overflowX: 'auto',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
