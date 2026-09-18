import React, { useEffect, useState } from 'react';
import { Button, Input } from 'antd';
import {
  PlusOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  SearchOutlined,
  MoreOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useConversationStore, Conversation } from '../../stores/conversation-store';
import { useWorkspaceStore, tabId } from '../../stores/workspace-store';
import { useModelStore } from '../../stores/model-store';

const SHOW_MORE_COUNT = 5;

const ConversationList: React.FC = () => {
  const { conversations, loadConversations, deleteConversation, renameConversation, setActive } = useConversationStore();
  const { activeProviderId, activeModelId } = useModelStore();
  const { addTab, setWorkspace } = useWorkspaceStore();
  // 项目名的唯一真源是 workspace store（与顶部标签 / 输入区 chips 同步）
  const projectName = useWorkspaceStore(s => s.workspace?.name || '');
  const api = (window as any).electronAPI;
  const [searchText, setSearchText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const filtered = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchText.toLowerCase())
  );
  const visible = showAll ? filtered : filtered.slice(0, SHOW_MORE_COUNT);

  const openChat = (conv: Conversation) => {
    addTab({
      id: tabId(),
      type: 'chat',
      title: conv.title || '对话',
      conversationId: conv.id,
    });
    setActive(conv.id);
  };

  const handleNewChat = () => {
    // 复用"空会话"策略：直接开一个无 conversationId 的标签页，
    // 首次发送时由 InputArea 自动创建会话
    addTab({
      id: tabId(),
      type: 'chat',
      title: '新会话',
      conversationId: '',
    });
  };

  const handleDelete = async (convId: string) => {
    try {
      await deleteConversation(convId);
      // 该会话若开着标签页，一并关掉，避免留下死会话
      const ws = useWorkspaceStore.getState();
      ws.tabs
        .filter((t) => t.type === 'chat' && t.conversationId === convId)
        .forEach((t) => ws.removeTab(t.id));
      loadConversations();
    } catch {}
  };

  const handleRename = async (convId: string) => {
    if (editingTitle.trim()) {
      try {
        await renameConversation(convId, editingTitle.trim());
        loadConversations();
      } catch {}
    }
    setEditingId(null);
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent',
    }}>
      {/* 顶部：搜索 + 新建 */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--g-stroke)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--text-quaternary)' }} />}
            placeholder="搜索会话"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="small"
            style={{
              flex: 1,
              background: 'var(--g-panel-light)',
              border: '1px solid var(--g-stroke)',
              color: 'var(--text-secondary)',
            }}
          />
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={handleNewChat}
            style={{ color: 'var(--text-tertiary)' }}
          />
        </div>
      </div>

      {/* 工作区（项目）绑定 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--g-stroke)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginBottom: 4 }}>项目目录</div>
        <div
          onClick={async () => {
            try {
              const result = await api.workspace.open();
              if (result) {
                // 走 workspace store：文件树 / 顶部标签 / 输入区 chips 一起更新
                setWorkspace(result);
                loadConversations();
              }
            } catch {}
          }}
          style={{
            fontSize: 12,
            color: projectName ? 'var(--text-secondary)' : 'var(--text-quaternary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            background: 'var(--g-panel-light)',
            border: '1px solid var(--g-stroke)',
          }}
        >
          <FolderOpenOutlined style={{ fontSize: 12 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectName || '选择目录（可选，供 AI 操作代码）'}
          </span>
        </div>
      </div>

      {/* 会话列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-quaternary)', padding: '4px 8px 6px' }}>
          最近会话
        </div>
        {visible.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '24px 16px',
            color: 'var(--text-quaternary)',
            fontSize: 12,
          }}>
            {searchText ? '没有找到匹配的会话' : '还没有会话，点击上方 ＋ 开始'}
          </div>
        ) : (
          visible.map((conv: Conversation) => (
            <div
              key={conv.id}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                background: hoveredId === conv.id ? 'var(--g-hover)' : 'transparent',
                transition: 'background 0.12s',
                position: 'relative',
              }}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => openChat(conv)}
            >
              {editingId === conv.id ? (
                <Input
                  size="small"
                  defaultValue={conv.title}
                  autoFocus
                  style={{ background: 'var(--g-panel-light)', border: '1px solid var(--g-stroke)', color: 'var(--text-primary)', fontSize: 12 }}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(conv.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <div style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: 36,
                  }}>
                    {conv.title || '未命名'}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-quaternary)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <ClockCircleOutlined style={{ fontSize: 10 }} />
                    {new Date((conv.updatedAt || conv.createdAt) * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    {typeof conv.messageCount === 'number' && conv.messageCount > 0 && ` · ${conv.messageCount} 条`}
                  </div>
                </>
              )}

              {hoveredId === conv.id && editingId !== conv.id && (
                <div style={{ position: 'absolute', right: 6, top: 8 }}>
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    style={{ color: '#6b7280' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(conv.id);
                      setEditingTitle(conv.title || '');
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
        {filtered.length > SHOW_MORE_COUNT && !showAll && (
          <Button
            type="link"
            size="small"
            block
            onClick={() => setShowAll(true)}
            style={{ color: '#6b7280', justifyContent: 'center', marginTop: 4 }}
          >
            显示更多
          </Button>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
