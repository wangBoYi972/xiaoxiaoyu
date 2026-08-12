import api from '../../../api';
import React, { useState, useEffect } from 'react';
import { Card, Button, Tag, Space, Typography, Input, Modal, message, Empty, Row, Col, Dropdown, Popconfirm } from 'antd';
import {
  PlusOutlined, ImportOutlined, ExportOutlined, DeleteOutlined,
  ThunderboltOutlined, MoreOutlined, SearchOutlined, AppstoreOutlined,
  CodeOutlined, EditOutlined, TranslationOutlined, BulbOutlined,
  BarChartOutlined, BookOutlined, FileTextOutlined, RobotOutlined,
} from '@ant-design/icons';

const { Text, Paragraph, Title } = Typography;

interface Skill {
  id: string; name: string; description: string; icon: string;
  category: string; systemPrompt: string; temperature?: number; version: string; author?: string;
}

const CAT_ICONS: Record<string, React.ReactNode> = {
  coding: <CodeOutlined />, writing: <EditOutlined />, analysis: <BarChartOutlined />,
  creative: <BulbOutlined />, utility: <RobotOutlined />,
};

const CAT_COLORS: Record<string, string> = {
  coding: '#1677ff', writing: '#52c41a', analysis: '#fa8c16', creative: '#722ed1', utility: '#666',
};

const CAT_NAMES: Record<string, string> = {
  coding: '编程', writing: '写作', analysis: '分析', creative: '创意', utility: '通用',
};

export function SkillsSettings() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [installModal, setInstallModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [newSkillForm, setNewSkillForm] = useState<Partial<Skill>>({});
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const list = await api.listSkills();
      setSkills(list || []);
    } catch { setSkills([]); }
  };

  useEffect(() => { load(); }, []);

  const doImport = async () => {
    try {
      const skill = JSON.parse(importJson);
      const r = await api.importSkill(importJson);
      if (r.success) { message.success('导入成功'); load(); setInstallModal(false); setImportJson(''); }
      else { message.error(r.error || '导入失败'); }
    } catch { message.error('JSON 格式无效'); }
  };

  const doCreate = async () => {
    if (!newSkillForm.id || !newSkillForm.name) { message.error('ID 和 名称必填'); return; }
    const skill: Skill = {
      id: newSkillForm.id, name: newSkillForm.name,
      description: newSkillForm.description || '',
      icon: newSkillForm.icon || '🔧',
      category: newSkillForm.category || 'utility',
      systemPrompt: newSkillForm.systemPrompt || '',
      temperature: newSkillForm.temperature,
      version: '1.0',
      author: newSkillForm.author || '我',
    };
    await api.installSkill({ skill });
    message.success('技能已保存');
    load();
    setEditing(false);
    setInstallModal(false);
    setNewSkillForm({});
  };

  const doDelete = async (id: string) => {
    const r = await api.deleteSkill(id);
    if (r.success) { message.success('已删除'); load(); }
    else { message.error(r.error || '删除失败'); }
  };

  const doExport = async (id: string) => {
    const json = await api.exportSkill(id);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${id}.skill.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  const filtered = skills.filter((s) => {
    if (search && !s.name.includes(search) && !s.description.includes(search)) return false;
    if (activeCategory && s.category !== activeCategory) return false;
    return true;
  });

  const categories = [...new Set(skills.map((s) => s.category))];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 15 }}><ThunderboltOutlined style={{ color: '#1677ff', marginRight: 8 }} />技能管理</Text>
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => { setEditing(false); setInstallModal(true); setImportJson(''); }}
            style={{ borderRadius: 10, fontWeight: 500 }}>导入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(true); setNewSkillForm({}); setInstallModal(true); }}
            style={{ borderRadius: 10, fontWeight: 600 }}>创建技能</Button>
        </Space>
      </div>

      <Input prefix={<SearchOutlined />} placeholder="搜索技能..." value={search}
        onChange={(e) => setSearch(e.target.value)} style={{ borderRadius: 10, marginBottom: 12 }} />

      {/* 分类筛选 */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Tag color={!activeCategory ? 'blue' : 'default'} style={{ cursor: 'pointer', borderRadius: 8, padding: '2px 12px' }}
          onClick={() => setActiveCategory(null)}>全部</Tag>
        {categories.map((cat) => (
          <Tag key={cat} color={activeCategory === cat ? 'blue' : 'default'}
            style={{ cursor: 'pointer', borderRadius: 8, padding: '2px 12px' }}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}>
            {CAT_ICONS[cat]} {CAT_NAMES[cat] || cat}
          </Tag>
        ))}
      </Space>

      {/* 技能列表 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <AppstoreOutlined style={{ fontSize: 36, color: '#d9d9d9' }} />
          <Paragraph type="secondary" style={{ marginTop: 12 }}>暂无匹配的技能</Paragraph>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(true); setNewSkillForm({}); setInstallModal(true); }}
            style={{ borderRadius: 10 }}>创建第一个技能</Button>
        </div>
      ) : (
        <Row gutter={[12, 12]}>
          {filtered.map((s) => (
            <Col span={12} key={s.id}>
              <Card size="small" className="settings-card"
                style={{ borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)' }}
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{s.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 14 }}>{s.name}</Text>
                    <Paragraph type="secondary" style={{ fontSize: 11, margin: '4px 0 0', lineHeight: 1.5 }} ellipsis={{ rows: 2 }}>
                      {s.description}
                    </Paragraph>
                    <Space size={4} style={{ marginTop: 6 }}>
                      <Tag color={CAT_COLORS[s.category]} style={{ borderRadius: 6, fontSize: 10 }}>
                        {CAT_ICONS[s.category]} {CAT_NAMES[s.category] || s.category}
                      </Tag>
                      <Tag style={{ borderRadius: 6, fontSize: 10 }}>v{s.version}</Tag>
                    </Space>
                  </div>
                  <Dropdown menu={{ items: [
                    { key: 'export', icon: <ExportOutlined />, label: '导出', onClick: () => doExport(s.id) },
                    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => doDelete(s.id) },
                  ]}} trigger={['click']}>
                    <Button type="text" size="small" icon={<MoreOutlined />} />
                  </Dropdown>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 创建/导入弹窗 */}
      <Modal
        title={editing ? '创建技能' : '导入技能'}
        open={installModal}
        onCancel={() => setInstallModal(false)}
        onOk={editing ? doCreate : doImport}
        okText={editing ? '创建' : '导入'}
        width={520}
        okButtonProps={{ style: { borderRadius: 10, fontWeight: 600 } }}
        cancelButtonProps={{ style: { borderRadius: 10 } }}
      >
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Input placeholder="技能ID (英文)" value={newSkillForm.id || ''} onChange={(e) => setNewSkillForm({ ...newSkillForm, id: e.target.value })} />
            <Input placeholder="技能名称" value={newSkillForm.name || ''} onChange={(e) => setNewSkillForm({ ...newSkillForm, name: e.target.value })} />
            <Input placeholder="描述" value={newSkillForm.description || ''} onChange={(e) => setNewSkillForm({ ...newSkillForm, description: e.target.value })} />
            <Input placeholder="图标 (emoji)" value={newSkillForm.icon || ''} onChange={(e) => setNewSkillForm({ ...newSkillForm, icon: e.target.value })} />
            <Input.TextArea rows={4} placeholder="系统提示词" value={newSkillForm.systemPrompt || ''} onChange={(e) => setNewSkillForm({ ...newSkillForm, systemPrompt: e.target.value })} />
          </div>
        ) : (
          <div>
            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
              粘贴技能 JSON 内容，或从导出的 .skill.json 文件复制。
            </Paragraph>
            <Input.TextArea rows={8} placeholder='粘贴 JSON...' value={importJson} onChange={(e) => setImportJson(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </div>
        )}
      </Modal>
    </div>
  );
}
