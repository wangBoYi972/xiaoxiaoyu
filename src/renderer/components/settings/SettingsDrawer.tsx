import React from 'react';
import { Drawer, Tabs, Typography, Button } from 'antd';
import { SettingOutlined, ApiOutlined, CloudServerOutlined, InfoCircleOutlined, ThunderboltOutlined, ExperimentOutlined } from '@ant-design/icons';
import { GeneralSettings } from './GeneralSettings';
import { ModelSettings } from './ModelSettings';
import { McpSettings } from './McpSettings';
import { SkillsSettings } from './SkillsSettings';
import { AboutPanel } from './AboutPanel';

const { Text } = Typography;

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewChange?: (view: 'chat' | 'finetune') => void;
}

export function SettingsDrawer({ open, onClose, onViewChange }: SettingsDrawerProps) {
  const handleOpenFinetune = () => {
    onViewChange?.('finetune');
    onClose();
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <span style={{ fontSize: 17, fontWeight: 600, background: 'linear-gradient(135deg, #1677ff, #722ed1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              设置
            </span>
          </div>
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={handleOpenFinetune}
            style={{ borderRadius: 8 }}
          >
            模型微调
          </Button>
        </div>
      }
      placement="right"
      width={500}
      onClose={onClose}
      open={open}
      styles={{
        body: { padding: 0 },
        header: {
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        },
      }}
    >
      <Tabs
        defaultActiveKey="general"
        tabPosition="top"
        centered
        size="large"
        style={{ height: '100%' }}
        tabBarStyle={{
          padding: '8px 16px 0',
          margin: 0,
          background: 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(10px)',
        }}
        items={[
          {
            key: 'general',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SettingOutlined /> 通用
              </span>
            ),
            children: <div style={{ padding: '20px 24px' }}><GeneralSettings /></div>,
          },
          {
            key: 'models',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ApiOutlined /> 模型服务
              </span>
            ),
            children: <div style={{ padding: '20px 24px', height: 'calc(100vh - 150px)', overflow: 'auto' }}><ModelSettings /></div>,
          },
          {
            key: 'skills',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ThunderboltOutlined /> 技能
              </span>
            ),
            children: <div style={{ padding: '20px 24px', height: 'calc(100vh - 150px)', overflow: 'auto' }}><SkillsSettings /></div>,
          },
          {
            key: 'mcp',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudServerOutlined /> MCP
              </span>
            ),
            children: <div style={{ padding: '20px 24px', height: 'calc(100vh - 150px)', overflow: 'auto' }}><McpSettings /></div>,
          },
          {
            key: 'about',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <InfoCircleOutlined /> 关于
              </span>
            ),
            children: <div style={{ padding: '20px 24px' }}><AboutPanel /></div>,
          },
        ]}
      />
    </Drawer>
  );
}
