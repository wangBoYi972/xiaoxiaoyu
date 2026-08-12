import api from '../../../api';
import React, { useState, useMemo } from 'react';
import { Button, Input, Checkbox, Popconfirm, Typography, Dropdown, Space, message } from 'antd';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, MessageOutlined,
  ExportOutlined, MoreOutlined, DownloadOutlined, FileMarkdownOutlined,
  FileTextOutlined, ClearOutlined, LogoutOutlined, UserOutlined,
} from '@ant-design/icons';
import { useConversationStore } from '../../stores/conversation-store';
import { useChatStore } from '../../stores/chat-store';
import { useModelStore } from '../../stores/model-store';

const { Text } = Typography;
const isElectron = !!(window as any).electronAPI;

function getCurrentUser(): string {
  try {
    const raw = localStorage.getItem(isElectron ? 'desktop_user' : 'auth_user');
    if (!raw) return '';
    const user = JSON.parse(raw);
    return user.username || '';
  } catch { return ''; }
}

interface SidebarProps { onCollapse: () => void; }

export function Sidebar({ onCollapse }: SidebarProps) {
  const { conversations, activeId, loadConversations, setActive, createConversation, deleteConversation } =
    useConversationStore();
  const { clearMessages, loadMessages, messages } = useChatStore();
  const { activeProviderId, activeModelId } = useModelStore();

  const [search, setSearch] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  React.useEffect(() => { loadConversations(); }, [loadConversations]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const handleNewChat = async () => {
    clearMessages();
    const conv = await createConversation('新对话', activeModelId, activeProviderId);
    if (conv) setActive(conv.id);
  };

  const handleSelect = async (id: string) => {
    if (batchMode) {
      setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
      return;
    }
    setActive(id);
    try {
      const msgs = await api.listMessages(id);
      loadMessages(msgs.map((m: any) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })));
      onCollapse();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    if (activeId === id) clearMessages();
  };

  const handleBatchDelete = async () => {
    for (const id of selected) { await deleteConversation(id); }
    if (selected.has(activeId || '')) clearMessages();
    setSelected(new Set());
    setBatchMode(false);
    message.success(`已删除 ${selected.size} 个对话`);
    loadConversations();
  };

  // 导出对话
  const handleExport = async (id: string, format: 'md' | 'json') => {
    try {
      const msgs = await api.listMessages(id);
      const conv = conversations.find((c) => c.id === id);
      let content = '';
      if (format === 'md') {
        content = `# ${conv?.title || '对话'}\n\n> 模型: ${conv?.modelId || '未知'}\n> 日期: ${new Date((conv?.updatedAt || 0) * 1000).toLocaleString('zh-CN')}\n\n---\n\n`;
        for (const m of msgs as any[]) {
          const role = m.role === 'user' ? '🧑 你' : '🤖 小小榆';
          content += `### ${role}\n\n${m.content}\n\n---\n\n`;
        }
      } else {
        content = JSON.stringify({ title: conv?.title, modelId: conv?.modelId, messages: msgs }, null, 2);
      }
      // 通过 IPC 保存文件
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${conv?.title || '对话'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch { message.error('导出失败'); }
  };

  const handleExportAll = async (format: 'md' | 'json') => {
    const doExport = async (id: string, title: string, modelId: string, updatedAt: number, fmt: string) => {
      try {
        const msgs = await api.listMessages(id);
        let c = '';
        if (fmt === 'md') { c = `# ${title}\n\n> ${modelId}\n> ${new Date(updatedAt * 1000).toLocaleString('zh-CN')}\n\n---\n\n`; for (const m of msgs as any[]) { c += `### ${m.role === 'user' ? '你' : '小小榆'}\n\n${m.content}\n\n---\n\n`; } }
        else { c = JSON.stringify({ title, modelId, messages: msgs }, null, 2); }
        const blob = new Blob([c], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${title}.${fmt}`; a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 300));
      } catch {}
    };
    for (const c of conversations) { await doExport(c.id, c.title, c.modelId, c.updatedAt, format); }
    message.success(`已导出 ${conversations.length} 个对话`);
  };

  const handleLogout = () => {
    localStorage.removeItem(isElectron ? 'desktop_user' : 'auth_user');
    localStorage.removeItem(isElectron ? 'desktop_token' : 'auth_token');
    message.success('已退出登录');
    // 刷新页面回到登录界面
    setTimeout(() => window.location.reload(), 500);
  };

  const moreMenu = {
    items: [
      { key: 'export-md', icon: <FileMarkdownOutlined />, label: '导出全部为 Markdown', onClick: () => handleExportAll('md') },
      { key: 'export-json', icon: <FileTextOutlined />, label: '导出全部为 JSON', onClick: () => handleExportAll('json') },
      { type: 'divider' as const },
      { key: 'batch', icon: <ClearOutlined />, label: '批量删除', onClick: () => { setBatchMode(true); setSelected(new Set()); } },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: handleLogout },
    ],
  };

  return (
    <div className="glass-light" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 10px', margin: '6px', borderRadius: 16, border: '1px solid var(--glass-border)' }}>
      {/* 侧边栏头部 - Logo区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 12px', marginBottom: 4, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <img src="./logo.png" alt="小小榆" style={{
          width: 34, height: 34, borderRadius: 12,
          objectFit: 'cover',
          boxShadow: '0 4px 12px rgba(22,119,255,0.25)',
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <Text strong style={{ fontSize: 16, background: 'linear-gradient(135deg, #1677ff 0%, #0ea5e9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>小小榆</Text>
        </div>
      </div>

      {/* 操作栏 */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Button type="primary" icon={<PlusOutlined style={{ fontSize: 16 }} />} onClick={handleNewChat} style={{ borderRadius: 10, flex: 1, height: 38, fontSize: 14, fontWeight: 600 }}>
          新建对话
        </Button>
        <Dropdown menu={moreMenu} trigger={['click']}>
          <Button icon={<MoreOutlined style={{ fontSize: 16 }} />} style={{ borderRadius: 10, width: 38, height: 38 }} />
        </Dropdown>
      </Space>

      {batchMode && (
        <div style={{ padding: '6px 8px', marginBottom: 6, borderRadius: 10, background: 'rgba(255,77,79,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12 }}>已选 {selected.size} 项</Text>
          <Space>
            <Button size="small" onClick={() => { setBatchMode(false); setSelected(new Set()); }}>取消</Button>
            <Popconfirm title={`确定删除 ${selected.size} 个对话？`} onConfirm={handleBatchDelete}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <Input prefix={<SearchOutlined style={{ fontSize: 16 }} />} size="middle" placeholder="搜索对话..." value={search}
        onChange={(e) => setSearch(e.target.value)} className="glass-input" style={{ marginBottom: 10, borderRadius: 10, height: 38, fontSize: 14 }} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 && <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 20, fontSize: 12 }}>暂无对话</Text>}
        {filtered.map((item) => (
          <div key={item.id} className="glass-card"
            style={{ cursor: 'pointer', padding: '10px 14px', marginBottom: 6, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10,
              ...(activeId === item.id && !batchMode ? { background: 'rgba(22,119,255,0.12)', borderColor: 'rgba(22,119,255,0.25)', boxShadow: '0 2px 12px rgba(22,119,255,0.1)' } : {}),
            }}
            onClick={() => handleSelect(item.id)}
          >
            {batchMode && <Checkbox checked={selected.has(item.id)} style={{ flexShrink: 0 }} />}
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: activeId === item.id ? 'linear-gradient(135deg, #1677ff, #4096ff)' : 'rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <MessageOutlined style={{ color: activeId === item.id ? '#fff' : '#1677ff', fontSize: 15 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong={activeId === item.id} ellipsis style={{ fontSize: 14 }}>{item.title}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.updatedAt * 1000).toLocaleDateString('zh-CN')} · {item.messageCount}条</Text>
            </div>
            {!batchMode && (
              <Dropdown menu={{ items: [
                { key: 'export-md', icon: <FileMarkdownOutlined />, label: '导出 Markdown', onClick: (e: any) => { e.domEvent?.stopPropagation(); handleExport(item.id, 'md'); } },
                { key: 'export-json', icon: <FileTextOutlined />, label: '导出 JSON', onClick: (e: any) => { e.domEvent?.stopPropagation(); handleExport(item.id, 'json'); } },
                { type: 'divider' as const },
                { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleDelete(item.id); } },
              ]}} trigger={['click']}>
                <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
              </Dropdown>
            )}
          </div>
        ))}
      </div>

      {/* 底部用户信息 + 退出登录 */}
      <div style={{
        padding: '10px 6px 4px', marginTop: 4,
        borderTop: '1px solid rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 10,
          background: 'linear-gradient(135deg, #1677ff, #0ea5e9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <UserOutlined style={{ color: '#fff', fontSize: 14 }} />
        </div>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: 500 }} ellipsis>
          {getCurrentUser() || '未登录'}
        </Text>
        <Button
          type="text"
          size="small"
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          title="退出登录"
          style={{ borderRadius: 8 }}
        />
      </div>
    </div>
  );
}
