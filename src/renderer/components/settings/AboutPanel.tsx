import api from '../../../api';
import React, { useState } from 'react';
import { Typography, Descriptions, Button, Space, Divider, Tag, message, Card } from 'antd';
import { CloudUploadOutlined, GithubOutlined, ThunderboltOutlined, RobotOutlined, StarFilled } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export function AboutPanel() {
  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    try { await api.checkUpdate(); message.success('检查完成，如有新版本会弹出通知'); }
    catch { message.error('检查更新失败'); }
    setChecking(false);
  };

  return (
    <div>
      {/* Logo + 标题 */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          width: 68, height: 68, borderRadius: 20, margin: '0 auto 14px',
          overflow: 'hidden',
          boxShadow: '0 8px 28px rgba(22,119,255,0.22)',
        }}>
          <img src="./logo.png" alt="小小榆" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <Title level={3} style={{ margin: 0, fontWeight: 700, background: 'linear-gradient(135deg, #1677ff, #722ed1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          小小榆
        </Title>
        <Space style={{ marginTop: 6 }}>
          <Tag color="blue" style={{ borderRadius: 8, fontSize: 12 }}>v3.0.0</Tag>
          <Tag color="purple" style={{ borderRadius: 8, fontSize: 12 }}>Windows · macOS</Tag>
        </Space>
      </div>

      {/* 核心信息 */}
      <Descriptions column={1} size="small" bordered
        labelStyle={{ fontWeight: 500, fontSize: 12, width: 90 }}
        contentStyle={{ fontSize: 13 }}
        style={{ borderRadius: 12, overflow: 'hidden' }}>
        <Descriptions.Item label="应用名称">小小榆</Descriptions.Item>
        <Descriptions.Item label="版本号">v3.0.0</Descriptions.Item>
        <Descriptions.Item label="技术栈">Electron 33 + React 18 + Ant Design 5 + TypeScript</Descriptions.Item>
        <Descriptions.Item label="支持平台">Windows 10/11 · macOS 13+</Descriptions.Item>
        <Descriptions.Item label="数据存储">SQLite 本地加密存储</Descriptions.Item>
        <Descriptions.Item label="模型支持">Claude / GPT-4o / Gemini / DeepSeek / 通义千问 / 智谱GLM / Kimi / 文心一言 / Ollama</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '16px 0' }} />

      {/* 功能亮点 */}
      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
        <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 6 }} />
        核心功能
      </Text>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {[
          { icon: '💬', label: '流式对话' },
          { icon: '🖼️', label: '图片识别' },
          { icon: '🧩', label: '28个内置技能' },
          { icon: '🎭', label: '角色预设' },
          { icon: '📤', label: '对话导出MD/JSON' },
          { icon: '🔄', label: '自动更新' },
          { icon: '📣', label: '公告推送' },
          { icon: '🌙', label: '深色主题' },
          { icon: '🎨', label: '自定义背景' },
          { icon: '💻', label: 'MCP协议' },
          { icon: '⌨️', label: '全局快捷键' },
          { icon: '🆓', label: '默认免费模型' },
        ].map((f) => (
          <Card key={f.label} size="small" style={{ borderRadius: 10, background: 'rgba(22,119,255,0.03)', border: '1px solid rgba(22,119,255,0.08)' }}
            styles={{ body: { padding: '8px 12px' } }}>
            <Text style={{ fontSize: 12 }}>
              <span style={{ marginRight: 6 }}>{f.icon}</span>
              {f.label}
            </Text>
          </Card>
        ))}
      </div>

      <Divider style={{ margin: '16px 0' }} />

      <Space direction="vertical" style={{ width: '100%' }}>
        <Button block icon={<CloudUploadOutlined />} onClick={handleCheckUpdate} loading={checking}
          style={{ borderRadius: 10, fontWeight: 500 }}>
          检查更新
        </Button>
        <Button block icon={<GithubOutlined />} style={{ borderRadius: 10 }}>
          项目主页
        </Button>
      </Space>

      <Paragraph type="secondary" style={{ textAlign: 'center', marginTop: 16, fontSize: 11 }}>
        小小榆 · 支持所有主流大模型的桌面AI助手
        <br />
        无需编程，开箱即用 · 本地加密，隐私安全
      </Paragraph>
    </div>
  );
}
