import React from 'react';
import { Modal, Form, Input, Tag, Divider, Typography } from 'antd';
import { ApiOutlined, KeyOutlined, LinkOutlined } from '@ant-design/icons';
import { getPresetModels } from '../../../adapters/index';

const { Text } = Typography;

interface ProviderConfig {
  id: string; name: string; hasApiKey: boolean; baseUrl?: string; enabled: boolean; models: string[];
}

interface ProviderConfigModalProps {
  open: boolean; provider: ProviderConfig; onClose: () => void; onSave: (config: ProviderConfig) => Promise<void>;
}

export function ProviderConfigModal({ open, provider, onClose, onSave }: ProviderConfigModalProps) {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: provider.name, apiKey: '', baseUrl: provider.baseUrl, models: provider.models });
    }
  }, [open, provider, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    // 文心一言需要同时保存 secretKey
    const extraHeaders = values.secretKey ? { client_secret: values.secretKey } : undefined;
    await onSave({
      ...provider,
      name: values.name,
      apiKey: values.apiKey || '',
      baseUrl: values.baseUrl,
      models: values.models || [],
      enabled: true,
      extraHeaders,
    });
  };

  const specialNotes: Record<string, string> = {
    ernie: '百度文心需要同时配置 API Key 和 Secret Key',
    ollama: 'Ollama 无需 API Key，确保 Ollama 服务已运行 (默认 localhost:11434)',
  };

  const presetModels = getPresetModels(provider.id);

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ApiOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>配置 {provider.name}</span>
        </span>
      }
      open={open} onOk={handleOk} onCancel={onClose}
      okText="保存" cancelText="取消" destroyOnClose
      okButtonProps={{ style: { borderRadius: 10, fontWeight: 500 } }}
      cancelButtonProps={{ style: { borderRadius: 10 } }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      {specialNotes[provider.id] && (
        <div style={{ padding: '10px 14px', background: 'rgba(250,173,20,0.06)', border: '1px solid rgba(250,173,20,0.2)', borderRadius: 10, marginBottom: 18 }}>
          <Text style={{ color: '#d48806', fontSize: 12 }}> {specialNotes[provider.id]}</Text>
        </div>
      )}

      <Form form={form} layout="vertical" size="middle">
        <Form.Item label={<span style={{ fontWeight: 500 }}>显示名称</span>} name="name">
          <Input placeholder="提供商名称" prefix={<ApiOutlined style={{ color: '#999' }} />} style={{ borderRadius: 8 }} />
        </Form.Item>

        {provider.id !== 'ollama' && (
          <Form.Item
            label={<span style={{ fontWeight: 500 }}>API Key</span>} name="apiKey"
            extra={provider.hasApiKey ? '已设置密钥，留空保持不变' : undefined}
            rules={!provider.hasApiKey ? [{ required: true, message: '请输入 API Key' }] : []}
          >
            <Input.Password placeholder={provider.hasApiKey ? '留空保持原密钥' : '输入 API Key'}
              prefix={<KeyOutlined style={{ color: '#999' }} />} style={{ borderRadius: 8 }} />
          </Form.Item>
        )}

        <Form.Item label={<span style={{ fontWeight: 500 }}>API 地址</span>} name="baseUrl">
          <Input placeholder="自定义 API 地址（可选）" prefix={<LinkOutlined style={{ color: '#999' }} />} style={{ borderRadius: 8 }} />
        </Form.Item>

        {provider.id === 'ernie' && (
          <Form.Item label={<span style={{ fontWeight: 500 }}>Secret Key</span>} name="secretKey">
            <Input.Password placeholder="输入百度 Secret Key" prefix={<KeyOutlined style={{ color: '#999' }} />} style={{ borderRadius: 8 }} />
          </Form.Item>
        )}

        <Divider style={{ margin: '12px 0' }} />

        <Text style={{ fontSize: 11, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>
          可用模型
        </Text>
        {presetModels.length > 0 ? (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {presetModels.map((m) => (
              <Tag key={m.id} style={{ borderRadius: 6, padding: '2px 10px', fontSize: 12 }}>
                {m.displayName}
                {m.supportsVision && ' '}
                {m.supportsThinking && ' '}
              </Tag>
            ))}
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>连接成功后自动获取模型列表</Text>
        )}
      </Form>
    </Modal>
  );
}
