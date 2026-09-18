import React, { useState } from 'react';
import { Button, Card, Tag, Space, Typography, Empty, message, Popconfirm } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined, CloudServerOutlined, ApiOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface MCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  status: 'running' | 'stopped' | 'error';
}

export function McpSettings() {
  const [servers, setServers] = useState<MCPServer[]>([]);

  const handleToggle = (id: string) => {
    setServers((prev) =>
      prev.map((s) => s.id === id
        ? { ...s, enabled: !s.enabled, status: !s.enabled ? ('running' as const) : ('stopped' as const) }
        : s)
    );
  };

  const handleDelete = (id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAdd = () => {
    message.info('MCP 服务器添加功能即将推出');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 15 }}>
          <CloudServerOutlined style={{ marginRight: 8, color: '#722ed1' }} />
          MCP 服务器管理
        </Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}
          style={{ borderRadius: 10, background: 'linear-gradient(135deg, #722ed1, #b37feb)', border: 'none', fontWeight: 500 }}>
          添加服务器
        </Button>
      </div>

      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.6, padding: '10px 14px', borderRadius: 10, background: 'rgba(114,46,209,0.04)', border: '1px solid rgba(114,46,209,0.1)' }}>
        MCP (Model Context Protocol) 让 AI 能够访问文件系统、数据库、API 等外部工具。
        配置方式与 Claude Desktop 兼容。
      </Paragraph>

      {servers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <ApiOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            暂无 MCP 服务器
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 16 }}>
            添加 MCP 服务器后，AI 将能够调用更多工具来完成复杂任务。
            <br />例如：文件系统访问、数据库查询、浏览器自动化等。
          </Paragraph>
        </div>
      ) : (
        servers.map((server) => (
          <Card key={server.id} size="small" className="glass-card"
            style={{ marginBottom: 8 }}
            styles={{ body: { padding: 14 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                  background: server.status === 'running' ? '#52c41a' : server.status === 'error' ? '#ff4d4f' : '#d9d9d9',
                  boxShadow: server.status === 'running' ? '0 0 6px rgba(82,196,26,0.5)' : 'none',
                }} />
                <Text strong>{server.name}</Text>
                <Tag color={server.status === 'running' ? 'green' : server.status === 'error' ? 'red' : 'default'} style={{ borderRadius: 6, fontSize: 10 }}>
                  {server.status === 'running' ? '运行中' : server.status === 'error' ? '错误' : '已停止'}
                </Tag>
              </Space>
              <Space>
                <Button type="text" size="small"
                  icon={server.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={() => handleToggle(server.id)}
                  style={{ borderRadius: 8 }} />
                <Popconfirm title="确定删除此服务器？" onConfirm={() => handleDelete(server.id)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 8 }} />
                </Popconfirm>
              </Space>
            </div>
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" code style={{ fontSize: 11 }}>
                {server.command} {server.args.join(' ')}
              </Text>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
