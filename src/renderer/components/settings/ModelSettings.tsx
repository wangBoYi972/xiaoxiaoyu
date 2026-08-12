import api from '../../../api';
import React, { useState } from 'react';
import { Switch, Button, Tag, Space, message, Typography, Card, Badge } from 'antd';
import {
  ApiOutlined, EditOutlined, ThunderboltOutlined, CheckCircleFilled,
  CloseCircleFilled, QuestionCircleFilled,
} from '@ant-design/icons';
import { useModelStore } from '../../stores/model-store';
import { ProviderConfigModal } from './ProviderConfigModal';

const { Text } = Typography;

export function ModelSettings() {
  const { providers, saveProvider, refreshModels } = useModelStore();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  const handleToggle = async (id: string, enabled: boolean) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    // 切换开关时保留已有的 API Key，不清空
    await saveProvider({ ...p, enabled });
    message.success(enabled ? `${p.name} 已启用` : `${p.name} 已禁用`);
  };

  const handleTest = async (id: string) => {
    const provider = providers.find((x) => x.id === id);
    message.loading({ content: `正在测试 ${provider?.name || id}...`, key: 'test' });
    try {
      const ok = await api.testProvider(id);
      if (ok) {
        message.success({ content: `${provider?.name || id} — 连接成功！`, key: 'test' });
      } else {
        message.error({ content: `${provider?.name || id} — 连接失败，请检查配置`, key: 'test' });
      }
    } catch {
      message.error({ content: '测试请求失败', key: 'test' });
    }
  };

  const editingConfig = editingProvider ? providers.find((p) => p.id === editingProvider) : null;

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'block' }}>
        模型提供商
      </Text>

      {providers.map((p) => (
        <Card
          key={p.id}
          size="small"
          hoverable
          className="settings-card"
          style={{
            marginBottom: 10,
            borderRadius: 14,
            border: p.enabled ? '1px solid rgba(22,119,255,0.2)' : '1px solid rgba(0,0,0,0.06)',
            background: p.enabled ? 'rgba(22,119,255,0.03)' : 'rgba(255,255,255,0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease',
          }}
          styles={{ body: { padding: '14px 18px' } }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* 左侧：图标 + 名称 + 状态 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: p.enabled
                  ? 'linear-gradient(135deg, rgba(22,119,255,0.15), rgba(114,46,209,0.15))'
                  : 'rgba(0,0,0,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
                color: p.enabled ? '#1677ff' : '#999',
                flexShrink: 0,
              }}>
                <ApiOutlined />
              </div>
              <div style={{ minWidth: 0 }}>
                <Space size={4}>
                  <Text strong style={{ fontSize: 14 }}>{p.name}</Text>
                  {p.enabled ? (
                    <Badge status="success" text="" />
                  ) : (
                    <Badge status="default" text="" />
                  )}
                </Space>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {p.enabled
                      ? (p.hasApiKey || p.id === 'ollama' ? ' 已就绪' : ' 待配置 API Key')
                      : '未启用'}
                  </Text>
                </div>
              </div>
            </div>

            {/* 右侧：操作按钮 */}
            <Space size={4} style={{ flexShrink: 0 }}>
              <Switch
                checked={p.enabled}
                onChange={(v) => handleToggle(p.id, v)}
                size="small"
              />
              <Button
                size="small"
                type="text"
                icon={<ThunderboltOutlined />}
                onClick={() => handleTest(p.id)}
                style={{ borderRadius: 8, fontSize: 12 }}
              >
                测试
              </Button>
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => setEditingProvider(p.id)}
                style={{ borderRadius: 8, fontSize: 12 }}
              >
                配置
              </Button>
            </Space>
          </div>
        </Card>
      ))}

      {editingConfig && (
        <ProviderConfigModal
          open={!!editingProvider}
          provider={editingConfig}
          onClose={() => setEditingProvider(null)}
          onSave={async (config) => {
            await saveProvider(config);
            setEditingProvider(null);
            message.success('配置已保存');
          }}
        />
      )}
    </div>
  );
}
