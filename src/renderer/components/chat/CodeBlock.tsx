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
    <div className="code-block">
      {/* 代码头 */}
      <div className="code-block-head">
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
