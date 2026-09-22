import React, { useState } from 'react';
import { Modal, Form, Input, Divider, Typography, Select, Button, message } from 'antd';
import { ApiOutlined, KeyOutlined, LinkOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ProviderConfig {
  id: string; name: string; hasApiKey: boolean; baseUrl?: string; enabled: boolean; models: string[];
}

interface FetchedModel {
  id: string;
  displayName: string;
  supportsVision: boolean;
  supportsThinking: boolean;
}

interface ProviderConfigModalProps {
  open: boolean; provider: ProviderConfig; onClose: () => void;
  onSave: (config: { id: string; name: string; apiKey?: string; baseUrl?: string; enabled: boolean; models: string[]; extraHeaders?: Record<string, string> }) => Promise<void>;
}

export function ProviderConfigModal({ open, provider, onClose, onSave }: ProviderConfigModalProps) {
  const [form] = Form.useForm();
  const [models, setModels] = useState<FetchedModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ name: provider.name, apiKey: '', baseUrl: provider.baseUrl, models: provider.models });
    // 已保存模型仅用于回显；点击获取后会被接口真实返回的列表替换。
    setModels(provider.models.map((id) => ({ id, displayName: id, supportsVision: false, supportsThinking: false })));
  }, [open, provider, form]);

  const fetchModels = async () => {
    const values = form.getFieldsValue();
    if (!values.apiKey?.trim() && !provider.hasApiKey && provider.id !== 'ollama') {
      form.setFields([{ name: 'apiKey', errors: ['请先输入 API Key'] }]);
      return;
    }
    setFetchingModels(true);
    try {
      const extraHeaders = values.secretKey ? { client_secret: values.secretKey.trim() } : undefined;
      const result = await window.electronAPI.listProviderModels({
        id: provider.id,
        name: values.name,
        apiKey: values.apiKey?.trim(),
        baseUrl: values.baseUrl?.trim(),
        extraHeaders,
      });
      if (!result.success || !result.models?.length) {
        message.error(result.error || '未获取到可用模型');
        return;
      }
      const nextModels = result.models.map((model) => ({
        id: model.id,
        displayName: model.displayName || model.id,
        supportsVision: model.supportsVision,
        supportsThinking: model.supportsThinking,
      }));
      setModels(nextModels);
      const selected = (values.models || []).filter((id: string) => nextModels.some((model) => model.id === id));
      form.setFieldValue('models', selected);
      message.success(`已获取 ${nextModels.length} 个模型`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleOk = async () => {
    const values = await form.validateFields();
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
    ollama: 'Ollama 无需 API Key，点击获取模型读取本机已安装模型。',
  };

  return (
    <Modal
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ApiOutlined style={{ color: '#1677ff', fontSize: 18 }} /><span style={{ fontWeight: 600 }}>配置 {provider.name}</span></span>}
      open={open} onOk={handleOk} onCancel={onClose} okText="保存" cancelText="取消" destroyOnClose
      okButtonProps={{ style: { borderRadius: 10, fontWeight: 500 } }} cancelButtonProps={{ style: { borderRadius: 10 } }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      {specialNotes[provider.id] && <div style={{ padding: '10px 14px', background: 'rgba(250,173,20,0.06)', border: '1px solid rgba(250,173,20,0.2)', borderRadius: 10, marginBottom: 18 }}><Text style={{ color: '#d48806', fontSize: 12 }}>{specialNotes[provider.id]}</Text></div>}

      <Form form={form} layout="vertical" size="middle">
        <Form.Item label={<span style={{ fontWeight: 500 }}>显示名称</span>} name="name"><Input placeholder="提供商名称" prefix={<ApiOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>
        {provider.id !== 'ollama' && <Form.Item label={<span style={{ fontWeight: 500 }}>API Key</span>} name="apiKey" extra={provider.hasApiKey ? '已设置密钥，留空保持不变' : undefined} rules={!provider.hasApiKey ? [{ required: true, message: '请输入 API Key' }] : []}><Input.Password placeholder={provider.hasApiKey ? '留空保持原密钥' : '输入 API Key'} prefix={<KeyOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>}
        <Form.Item label={<span style={{ fontWeight: 500 }}>API 地址</span>} name="baseUrl"><Input placeholder="自定义 API 地址（可选）" prefix={<LinkOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>
        {provider.id === 'ernie' && <Form.Item label={<span style={{ fontWeight: 500 }}>Secret Key</span>} name="secretKey"><Input.Password placeholder="输入百度 Secret Key" prefix={<KeyOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>}
        <Divider style={{ margin: '12px 0' }} />

        <Form.Item
          label={<span style={{ fontWeight: 500 }}>可用模型</span>}
          name="models"
          rules={[{ required: true, message: '请获取并选择至少一个模型' }]}
          extra={provider.id === 'ernie' ? '文心不提供可用模型枚举，请按控制台已开通的模型 ID 手动输入。' : '输入 Key 后点击获取模型，再从下拉列表选择；也可手动输入模型 ID。'}
        >
          <Select
            mode="tags"
            showSearch
            tokenSeparators={[',', ' ']}
            optionFilterProp="label"
            placeholder={provider.id === 'ernie' ? '输入已开通的模型 ID' : '获取模型或手动输入模型 ID'}
            disabled={fetchingModels}
            options={models.map((model) => ({
              value: model.id,
              label: `${model.displayName}${model.supportsVision ? ' · 视觉' : ''}${model.supportsThinking ? ' · 推理' : ''}`,
            }))}
            style={{ borderRadius: 8 }}
          />
        </Form.Item>
        {provider.id !== 'ernie' && <Button type="default" icon={<DownloadOutlined />} loading={fetchingModels} onClick={fetchModels} block style={{ borderRadius: 8, marginTop: -4 }}>
          获取模型
        </Button>}
      </Form>
    </Modal>
  );
}
