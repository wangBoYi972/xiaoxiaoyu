import React, { useEffect, useState } from 'react';
import {
  FolderOpenOutlined,
  LaptopOutlined,
  BranchesOutlined,
  PlusOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { message, Popover, Input, Button, Typography } from 'antd';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useModelStore } from '../../stores/model-store';
import { useRagStore } from '../../stores/rag-store';
import { useSettingsStore } from '../../stores/settings-store';

const { Text } = Typography;

interface ComposerHeaderProps {
  /** 在 HomeView 里首条消息创建后需要回调（可选） */
  onOpenProject?: () => void;
}

/**
 * 输入区顶部上下文条：项目目录 / 本地环境 / 模型选择
 * 与 ChatView、HomeView 共享同一份 UI，避免两边重复维护。
 */
export const ComposerHeader: React.FC<ComposerHeaderProps> = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const {
    activeProviderId,
    activeModelId,
    providers,
    availableModels,
    setActiveProvider,
    setActiveModel,
    addCustomModel,
  } = useModelStore();
  const rag = useRagStore();
  const openSettingsTab = useSettingsStore((s) => s.openSettingsTab);

  // 工作区变化时初始化 RAG 状态（store 内部保证只绑定一次进度监听）
  useEffect(() => {
    if (workspace?.path) rag.init(workspace.path);
  }, [workspace?.path]);

  /** 手填模型 ID（自定义供应商 / 中转站的模型不在预设列表里时用） */
  const [modelPopOpen, setModelPopOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');

  const submitCustomModel = async () => {
    const id = customModel.trim();
    if (!id) return;
    await addCustomModel(activeProviderId, id);
    setCustomModel('');
    setModelPopOpen(false);
    message.success(`已添加模型：${id}`);
  };

  const openProject = async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.workspace?.open) {
        message.info('请在桌面端使用「选择目录」功能');
        return;
      }
      const result = await api.workspace.open();
      if (result.success && result.workspace) {
        useWorkspaceStore.getState().setWorkspace(result.workspace);
      } else {
        message.error(result?.error || '打开工作区失败');
      }
    } catch (error) {
      console.error('打开工作区失败:', error);
    }
  };

  const isModelSelected = !!(activeModelId && availableModels.find((m) => m.id === activeModelId)?.displayName);

  return (
    <div className="chat-chips">
      <button className="g-chip" onClick={openProject} title={workspace ? `当前项目：${workspace.path}\n点击切换` : '打开项目目录'}>
        <FolderOpenOutlined />
        <span className="chat-chip-text">{workspace?.name || '选择目录'}</span>
      </button>

      <span className="g-chip" title="当前运行环境">
        <LaptopOutlined />
        本地
      </span>

      {/* 代码库语义索引：点开即跳到设置 → 知识库 */}
      {rag.available && (
        <button
          className="g-chip rag-chip"
          onClick={() => openSettingsTab('rag')}
          title={
            rag.status.chunks > 0
              ? `已索引 ${rag.status.chunks} 个向量块 / ${rag.status.files} 个文件\n${rag.status.model}\n对话时会自动检索相关代码注入上下文`
              : '尚未建立索引，点击前往「设置 → 知识库」建立'
          }
        >
          <DatabaseOutlined />
          <span className="chat-chip-text">
            {rag.status.chunks > 0 ? `知识库 ${rag.status.chunks}` : '建立索引'}
          </span>
          {rag.busy && <i className="rag-busy" />}
        </button>
      )}

      {/* 提供商 + 模型 */}
      <span className="g-chip chat-model-chip">
        <BranchesOutlined />
        <select
          className="chat-select"
          value={activeProviderId}
          onChange={(e) => setActiveProvider(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="chat-sep">·</span>
        <select
          className="chat-select"
          value={activeModelId}
          onChange={(e) => setActiveModel(e.target.value)}
          style={{ color: isModelSelected ? 'var(--text-primary)' : 'var(--text-quaternary)' }}
        >
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>

        {/* 手填模型 ID：中转站/私有部署的模型不在预设列表里 */}
        <Popover
          open={modelPopOpen}
          onOpenChange={setModelPopOpen}
          trigger="click"
          placement="top"
          content={
            <div style={{ width: 260 }}>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                给「{providers.find((p) => p.id === activeProviderId)?.name || activeProviderId}」加一个模型 ID
              </Text>
              <Input
                size="small"
                placeholder="例：gpt-4o / glm-4.6"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                onPressEnter={submitCustomModel}
                style={{ borderRadius: 8, marginBottom: 8 }}
              />
              <Button size="small" type="primary" block onClick={submitCustomModel} style={{ borderRadius: 8 }}>
                添加并使用
              </Button>
            </div>
          }
        >
          <button className="g-chip chat-model-add" title="手填模型 ID" type="button">
            <PlusOutlined />
          </button>
        </Popover>
      </span>
    </div>
  );
};
