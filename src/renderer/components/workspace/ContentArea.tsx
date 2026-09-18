import React, { Suspense, useEffect } from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { useWorkspaceStore, type Tab } from '../../stores/workspace-store';
import { useChatStore } from '../../stores/chat-store';
import ChatView from '../chat/ChatView';
import HomeView from './HomeView';

/**
 * Monaco 约 5MB，用 React.lazy 拆成独立 chunk，
 * 只有真正打开文件 / 看改动时才加载，不拖慢首屏。
 */
const FileEditor = React.lazy(() => import('./FileEditor'));
const FileDiffView = React.lazy(() => import('./FileDiffView'));
const TerminalView = React.lazy(() => import('./TerminalView'));

const EditorFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="ws-editor-loading" style={{ height: '100%' }}>
    <LoadingOutlined /> {label}
  </div>
);

/**
 * chat 标签页内容。
 * 「对话」是常驻标签，会话 id 可能在首条消息发出后才产生（InputArea 里 createConversation），
 * 这里负责把它回填到标签页上 —— 否则切到文件再切回来，
 * ChatView 会因为拿不到 conversationId 而清空当前会话消息。
 */
const ChatTabContent: React.FC<{ tab: Tab }> = ({ tab }) => {
  const storeConversationId = useChatStore(s => s.conversationId);
  const updateTab = useWorkspaceStore(s => s.updateTab);

  useEffect(() => {
    if (!tab.conversationId && storeConversationId) {
      updateTab(tab.id, { conversationId: storeConversationId });
    }
  }, [tab.id, tab.conversationId, storeConversationId, updateTab]);

  return <ChatView conversationId={tab.conversationId ?? storeConversationId ?? undefined} />;
};

const ContentArea: React.FC = () => {
  const { tabs, activeTabId } = useWorkspaceStore();

  const activeTab = tabs.find(t => t.id === activeTabId);

  if (!activeTab) {
    // Codex 式初始首页：居中标题 + 底部胶囊输入框，首条消息直接开启会话
    return <HomeView />;
  }

  if (activeTab.type === 'chat') {
    return <ChatTabContent tab={activeTab} />;
  }

  if (activeTab.type === 'file') {
    return (
      <Suspense fallback={<EditorFallback label="正在加载编辑器…" />}>
        <FileEditor
          tabId={activeTab.id}
          filePath={activeTab.filePath!}
          initialContent={activeTab.content || ''}
        />
      </Suspense>
    );
  }

  if (activeTab.type === 'diff') {
    return (
      <Suspense fallback={<EditorFallback label="正在加载改动视图…" />}>
        <FileDiffView
          filePath={activeTab.filePath || ''}
          original={activeTab.originalContent || ''}
          modified={activeTab.content || ''}
          height="100%"
          onAccept={activeTab.onAccept}
          onReject={activeTab.onReject}
        />
      </Suspense>
    );
  }

  if (activeTab.type === 'terminal') {
    return (
      <Suspense fallback={<EditorFallback label="正在加载运行面板…" />}>
        <TerminalView />
      </Suspense>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      color: 'var(--text-tertiary)',
    }}>
      暂不支持的标签页类型: {activeTab.type}
    </div>
  );
};

export default ContentArea;
