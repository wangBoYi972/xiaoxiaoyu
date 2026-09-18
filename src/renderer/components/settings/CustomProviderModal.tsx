import React, { useState } from 'react';
import { Modal, Form, Input, Select, Typography, Tag, Space } from 'antd';
import { ApiOutlined, KeyOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';

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

/** 常见可直接照抄的中转/本地端点，点一下填入 */
const PRESET_URLS = [
  { label: 'OpenAI 官方', value: 'https://api.openai.com/v1' },
  { label: 'OneAPI / 中转', value: 'https://api.example.com/v1' },
  { label: '本地 vLLM', value: 'http://127.0.0.1:8000/v1' },
  { label: 'LM Studio', value: 'http://127.0.0.1:1234/v1' },
  { label: 'Ollama 兼容', value: 'http://127.0.0.1:11434/v1' },
];

/**
 * 新增自定义供应商（2026-09-19）
 *
 * 只要接口是 OpenAI 兼容的（/chat/completions），都能接：
 * 官方、中转站、企业网关、本地 vLLM / LM Studio / Ollama 兼容模式……
 * 模型 ID 自己填，不依赖内置预设列表。
 */
export function CustomProviderModal({ open, onClose, onCreate }: CustomProviderModalProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: '', id: '', baseUrl: '', apiKey: '', models: [] });
    }
  }, [open, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onCreate({
        id: values.id?.trim() || undefined,
        name: values.name?.trim(),
        baseUrl: values.baseUrl?.trim(),
        apiKey: values.apiKey?.trim() || '',
        models: values.models || [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PlusOutlined style={{ color: 'var(--accent)', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>新增自定义供应商</span>
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="添加" cancelText="取消" destroyOnClose
      confirmLoading={saving}
      okButtonProps={{ style: { borderRadius: 10, fontWeight: 500 } }}
      cancelButtonProps={{ style: { borderRadius: 10 } }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', border: '1px solid var(--g-stroke)', borderRadius: 10, marginBottom: 18 }}>
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          任何 <b>OpenAI 兼容</b> 的接口都能接（官方 / 中转站 / 企业网关 / 本地 vLLM、LM Studio、Ollama 兼容模式）。
          模型 ID 自己填，不再受内置列表限制。
        </Text>
      </div>

      <Form form={form} layout="vertical" size="middle">
        <Form.Item
          label={<span style={{ fontWeight: 500 }}>显示名称</span>}
          name="name"
          rules={[{ required: true, message: '给这个供应商起个名字' }]}
        >
          <Input placeholder="例：我的中转 / 公司网关 / 本地 vLLM" prefix={<ApiOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontWeight: 500 }}>API 地址</span>}
          name="baseUrl"
          rules={[{ required: true, message: '请填写 Base URL' }]}
          extra={
            <Space size={4} wrap style={{ marginTop: 6 }}>
              {PRESET_URLS.map((u) => (
                <Tag
                  key={u.value}
                  style={{ cursor: 'pointer', borderRadius: 6, fontSize: 11 }}
                  onClick={() => form.setFieldValue('baseUrl', u.value)}
                >
                  {u.label}
                </Tag>
              ))}
            </Space>
          }
        >
          <Input placeholder="https://your-endpoint/v1" prefix={<LinkOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontWeight: 500 }}>API Key</span>}
          name="apiKey"
          extra={<Text type="secondary" style={{ fontSize: 11 }}>本地服务（vLLM / LM Studio / Ollama）通常不需要，可留空</Text>}
        >
          <Input.Password placeholder="sk-…（可留空）" prefix={<KeyOutlined style={{ color: 'var(--text-tertiary)' }} />} style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontWeight: 500 }}>模型 ID</span>}
          name="models"
          extra={<Text type="secondary" style={{ fontSize: 11 }}>输入后回车即可添加，可填多个</Text>}
          rules={[{ required: true, message: '至少填一个模型 ID' }]}
        >
          <Select
            mode="tags"
            placeholder="例：gpt-4o / deepseek-chat / qwen-max"
            tokenSeparators={[',', '，', ' ']}
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontWeight: 500 }}>标识 ID（可选）</span>}
          name="id"
          extra={<Text type="secondary" style={{ fontSize: 11 }}>留空自动生成；仅字母数字下划线</Text>}
        >
          <Input placeholder="my_gateway" style={{ borderRadius: 8 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
