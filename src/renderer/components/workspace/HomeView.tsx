import React from 'react';
import { useWorkspaceStore, tabId } from '../../stores/workspace-store';
import { useModelStore } from '../../stores/model-store';
import { useConversationStore } from '../../stores/conversation-store';
import { InputArea } from '../chat/InputArea';
import { ComposerHeader } from '../chat/ComposerHeader';

/**
 * Codex 式初始首页 — 未打开任何标签页时显示。
 *
 * 布局（与 ChatView 空会话态同构，复用同一套 glass 样式类）：
 *   居中 logo + 「在 {项目名} 里想构建什么？」
 *   底部：上下文 chips（项目 / 本地 / 模型）+ 玻璃胶囊输入框
 *
 * 首条消息发送时：创建会话 → 新开 chat 标签页 → 流式回复直接在
 * ChatView 里继续（InputArea 的流处理全部写 zustand store，组件
 * 卸载不断流）。
 */
export default function HomeView() {
  const { workspace, addTab } = useWorkspaceStore();
  const { activeProviderId, activeModelId } = useModelStore();
  const { createConversation } = useConversationStore();

  /** 首条消息 → 创建会话 + 打开 chat 标签页，返回会话 id 交给 InputArea 续流 */
  const handleFirstSend = async (text: string): Promise<string | undefined> => {
    try {
      const conv = await createConversation(text.slice(0, 50), activeModelId, activeProviderId);
      addTab({
        id: tabId(),
        type: 'chat',
        title: text.slice(0, 24) || '新对话',
        conversationId: conv.id,
      });
      return conv.id;
    } catch {
      return undefined;
    }
  };

  return (
    <div className="chat-root">
      <div className="chat-scroll g-scroll">
        <div className="chat-empty">
          <div className="chat-empty-mark">⌘</div>
          <div className="chat-empty-title">
            在 <span className="chat-empty-project">{workspace?.name || '小小榆'}</span>{' '}
            里想构建什么？
          </div>
        </div>
      </div>

      {/* 底部输入区：chips + 玻璃胶囊 */}
      <div className="chat-composer-wrap">
        <ComposerHeader />
        <InputArea onFirstSend={handleFirstSend} />
      </div>
    </div>
  );
}
