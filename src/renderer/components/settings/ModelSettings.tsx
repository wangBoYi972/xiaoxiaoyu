import api from '../../../api';
import React, { useState } from 'react';
import { Switch, Button, Tag, Space, message, Typography, Card, Badge } from 'antd';
import {
  ApiOutlined, EditOutlined, ThunderboltOutlined, CheckCircleFilled,
  CloseCircleFilled, QuestionCircleFilled, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useModelStore } from '../../stores/model-store';
import { ProviderConfigModal } from './ProviderConfigModal';
import { CustomProviderModal, type CustomProviderInput } from './CustomProviderModal';

const { Text } = Typography;

export function ModelSettings() {
  const { providers, saveProvider, refreshModels, addCustomProvider, removeCustomProvider } = useModelStore();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (input: CustomProviderInput) => {
    const id = await addCustomProvider(input);
    setCreating(false);
    message.success(`已添加「${input.name}」，可在输入框左上角直接切换`);
    // 顺手测一下连通性
    try {
      const ok = await api.testProvider(id);
      message[ok ? 'success' : 'warning']({ content: ok ? '连接测试通过' : '连接测试未通过，请检查地址与 Key' });
    } catch { /* ignore */ }
  };

  const handleRemove = async (id: string, name: string) => {
    await removeCustomProvider(id);
    message.success(`已删除「${name}」`);
  };

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
          className={`glass-card ${p.enabled ? 'is-on' : ''}`}
          style={{ marginBottom: 10 }}
          styles={{ body: { padding: '14px 18px' } }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* 左侧：图标 + 名称 + 状态 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <div className={`glass-card-icon ${p.enabled ? '' : 'is-off'}`}>
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
              {p.custom && (
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(p.id, p.name)}
                  style={{ borderRadius: 8, fontSize: 12 }}
                >
                  删除
                </Button>
              )}
            </Space>
          </div>
        </Card>
      ))}

      <Button
        block
        icon={<PlusOutlined />}
        onClick={() => setCreating(true)}
        style={{ borderRadius: 10, fontWeight: 500, marginTop: 6 }}
      >
        新增自定义供应商（任意 OpenAI 兼容端点）
      </Button>

      <CustomProviderModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={handleCreate}
      />

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
