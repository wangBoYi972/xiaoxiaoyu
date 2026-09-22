import React, { useState } from 'react';
import { Modal, Form, Input, Select, Typography, Tag, Space, Button, message } from 'antd';
import { ApiOutlined, KeyOutlined, LinkOutlined, PlusOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface CustomProviderInput {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
}

interface CustomProviderModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CustomProviderInput) => Promise<void>;
}

const PRESET_URLS = [
  { label: 'OpenAI 官方', value: 'https://api.openai.com/v1' },
  { label: 'OneAPI / 中转', value: 'https://api.example.com/v1' },
  { label: '本地 vLLM', value: 'http://127.0.0.1:8000/v1' },
  { label: 'LM Studio', value: 'http://127.0.0.1:1234/v1' },
  { label: 'Ollama 兼容', value: 'http://127.0.0.1:11434/v1' },
];

/** OpenAI 兼容服务：先请求 /models，再由用户从返回列表选择。 */
export function CustomProviderModal({ open, onClose, onCreate }: CustomProviderModalProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string }>>([]);

  React.useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: '', id: '', baseUrl: '', apiKey: '', models: [] });
      setModelOptions([]);
    }
  }, [open, form]);

  const fetchModels = async () => {
    const values = form.getFieldsValue();
    if (!values.baseUrl?.trim()) {
      form.setFields([{ name: 'baseUrl', errors: ['请先填写 API 地址'] }]);
      return;
    }
    setFetchingModels(true);
    try {
      const result = await window.electronAPI.listProviderModels({
        id: values.id?.trim() || 'custom_preview',
        name: values.name?.trim() || '自定义供应商',
        apiKey: values.apiKey?.trim(),
        baseUrl: values.baseUrl.trim(),
      });
      if (!result.success || !result.models?.length) {
        message.error(result.error || '未获取到可用模型');
        return;
      }
      const options = result.models.map((model) => ({ value: model.id, label: model.displayName || model.id }));
      setModelOptions(options);
      form.setFieldValue('models', []);
      message.success(`已获取 ${options.length} 个模型`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onCreate({
        id: values.id?.trim() || undefined,
        name: values.name.trim(),
        baseUrl: values.baseUrl.trim(),
        apiKey: values.apiKey?.trim() || '',
        models: values.models || [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PlusOutlined style={{ color: 'var(--accent)', fontSize: 18 }} /><span style={{ fontWeight: 600 }}>新增自定义供应商</span></span>}
      open={open} onOk={handleOk} onCancel={onClose} okText="添加" cancelText="取消" destroyOnClose confirmLoading={saving}
      okButtonProps={{ style: { borderRadius: 10, fontWeight: 500 } }} cancelButtonProps={{ style: { borderRadius: 10 } }} styles={{ body: { padding: '20px 24px' } }}
    >
      <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', border: '1px solid var(--g-stroke)', borderRadius: 10, marginBottom: 18 }}><Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>填写 OpenAI 兼容 API 地址和 Key 后，点击获取模型并从下拉列表选择。</Text></div>
      <Form form={form} layout="vertical" size="middle">
        <Form.Item label={<span style={{ fontWeight: 500 }}>显示名称</span>} name="name" rules={[{ required: true, message: '给这个供应商起个名字' }]}><Input placeholder="例：我的中转 / 公司网关 / 本地 vLLM" prefix={<ApiOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>
        <Form.Item label={<span style={{ fontWeight: 500 }}>API 地址</span>} name="baseUrl" rules={[{ required: true, message: '请填写 Base URL' }]} extra={<Space size={4} wrap style={{ marginTop: 6 }}>{PRESET_URLS.map((item) => <Tag key={item.value} style={{ cursor: 'pointer', borderRadius: 6, fontSize: 11 }} onClick={() => form.setFieldValue('baseUrl', item.value)}>{item.label}</Tag>)}</Space>}><Input placeholder="https://your-endpoint/v1" prefix={<LinkOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>
        <Form.Item label={<span style={{ fontWeight: 500 }}>API Key</span>} name="apiKey" extra={<Text type="secondary" style={{ fontSize: 11 }}>本地服务通常可留空</Text>}><Input.Password placeholder="sk-…（可留空）" prefix={<KeyOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} /></Form.Item>
        <Form.Item label={<span style={{ fontWeight: 500 }}>标识 ID（可选）</span>} name="id" extra={<Text type="secondary" style={{ fontSize: 11 }}>留空自动生成；仅字母数字下划线</Text>}><Input placeholder="my_gateway" style={{ borderRadius: 8 }} /></Form.Item>
        <Form.Item label={<span style={{ fontWeight: 500 }}>可用模型</span>} name="models" rules={[{ required: true, message: '请获取或输入至少一个模型 ID' }]} extra="优先从 API 获取；接口不支持枚举时可手动输入模型 ID。"><Select mode="tags" showSearch tokenSeparators={[',', ' ']} optionFilterProp="label" disabled={fetchingModels} placeholder="获取模型或输入模型 ID" options={modelOptions} style={{ borderRadius: 8 }} /></Form.Item>
        <Button type="default" icon={<DownloadOutlined />} loading={fetchingModels} onClick={fetchModels} block style={{ borderRadius: 8, marginTop: -4 }}>获取模型</Button>
      </Form>
    </Modal>
  );
}
