import React from 'react';
import { Collapse, Typography } from 'antd';
import { BulbOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  return (
    <Collapse
      ghost
      size="small"
      items={[
        {
          key: 'thinking',
          label: (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <BulbOutlined /> 思考过程
            </Text>
          ),
          children: (
            <div
              style={{
                borderLeft: '3px solid #d9d9d9',
                paddingLeft: 12,
                color: '#8c8c8c',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <Paragraph
                style={{ color: '#8c8c8c', margin: 0, whiteSpace: 'pre-wrap' }}
              >
                {content}
              </Paragraph>
            </div>
          ),
        },
      ]}
    />
  );
}
