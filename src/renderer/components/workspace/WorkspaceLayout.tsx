import React, { useEffect, useState } from 'react';
import { message } from 'antd';
import {
  FolderOpenOutlined,
  FolderOutlined,
  CloseOutlined,
  MessageOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BgColorsOutlined,
  MinusOutlined,
  BorderOutlined,
} from '@ant-design/icons';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useSettingsStore } from '../../stores/settings-store';
import FileTree from './FileTree';
import TabBar from './TabBar';
import ContentArea from './ContentArea';
import ConversationList from './ConversationList';
import { SettingsDrawer } from '../settings/SettingsDrawer';

/**
 * 玻璃化工作区布局
 * ── 结构：壁纸层（App 里）→ 顶部玻璃工具栏 → 三栏玻璃面板
 * ── 所有颜色走 glass.css 的 CSS 变量，支持暗/亮双主题 + 自定义壁纸
 */
const WorkspaceLayout: React.FC = () => {
  const {
    workspace,
    isLoadingWorkspace,
    leftPanelVisible,
    rightPanelVisible,
    toggleLeftPanel,
    toggleRightPanel,
    setWorkspace,
    setLoadingWorkspace,
  } = useWorkspaceStore();

  const { settingsOpen, toggleSettings } = useSettingsStore();

  const [dragOver, setDragOver] = useState(false);

  // 无边框窗口（主进程 frame:false）需要渲染层自绘窗口控制按钮
  const isElectron = !!(window as any).electronAPI;
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');

  const openWorkspace = async () => {
    try {
      setLoadingWorkspace(true);
      const result = await window.electronAPI.workspace.open();
      if (result.success && result.workspace) {
        setWorkspace(result.workspace);
      } else {
        // 之前失败是静默的，用户只会觉得「点了没反应」
        message.error(result?.error || '打开工作区失败');
      }
    } catch (error) {
      console.error('打开工作区失败:', error);
    } finally {
      setLoadingWorkspace(false);
    }
  };

  const closeWorkspace = async () => {
    if (!workspace) return;
    try {
      await window.electronAPI.workspace.close(workspace.path);
    } catch {}
    setWorkspace(null);
    try {
      window.localStorage.removeItem('codex_active_project');
    } catch {}
  };

  // 拖入文件夹 → 直接打开（Codex 风格）
  useEffect(() => {
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const items = e.dataTransfer?.items;
      const folderItem = Array.from(items || []).find((it) => it.kind === 'file') as any;
      if (!folderItem?.webkitGetAsEntry) return;
      const entry = folderItem.webkitGetAsEntry();
      if (!entry?.isDirectory) return;
      openWorkspace();
    };
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onLeave = () => setDragOver(false);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    return () => {
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
    };
  }, []);

  // 恢复上次打开的项目
  useEffect(() => {
    const saved = localStorage.getItem('codex_active_project');
    if (!saved || workspace) return;
    try {
      const api = window.electronAPI;
      if (/^([A-Za-z]:|\\|\/)/.test(saved)) {
        api.workspace.getFileTree?.(saved).then((res: any) => {
          if (res?.success) {
            setWorkspace({
              path: saved,
              name: saved.split(/[\\/]/).pop() || saved,
              fileTree: res.fileTree || [],
            });
          }
        });
      }
    } catch {}
  }, []);

  return (
    <div className="ws-root">
      {/* ============ 顶部玻璃工具栏 ============ */}
      <div className="ws-toolbar g-panel g-sheen">
        {/* 左侧：面板切换 */}
        <button
          className={`g-icon-btn ${leftPanelVisible ? 'on' : ''}`}
          onClick={toggleLeftPanel}
          title={leftPanelVisible ? '收起侧边栏' : '展开侧边栏'}
        >
          {leftPanelVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
        </button>

        {/* 品牌 */}
        <div className="ws-brand">
          <div className="ws-logo">
            <FolderOutlined />
          </div>
          <span className="ws-brand-name">小小榆</span>
        </div>

        {/* 中部：工作区状态 */}
        <div className="ws-center">
          {workspace ? (
            <div className="g-chip">
              <FolderOutlined />
              <span className="ws-path" title={workspace.path}>
                {workspace.name}
                <span className="ws-path-sub">{workspace.path}</span>
              </span>
              <CloseOutlined className="ws-close" onClick={closeWorkspace} />
            </div>
          ) : (
            <button className="g-chip primary" onClick={openWorkspace} disabled={isLoadingWorkspace}>
              <FolderOpenOutlined />
              {isLoadingWorkspace ? '打开中…' : '打开项目目录'}
            </button>
          )}
        </div>

        {/* 右侧：会话面板 + 外观 + 设置 */}
        <button
          className={`g-icon-btn ${rightPanelVisible ? 'on' : ''}`}
          onClick={toggleRightPanel}
          title="会话列表"
        >
          <MessageOutlined />
        </button>
        <button className="g-icon-btn" onClick={toggleSettings} title="外观与设置">
          <BgColorsOutlined />
        </button>
        <button className="g-icon-btn" onClick={toggleSettings} title="设置">
          <SettingOutlined />
        </button>

        {/* 窗口控制（无边框窗口自绘，仅 Windows/Linux 桌面端） */}
        {isElectron && !isMac && (
          <div className="ws-win-controls">
            <button className="g-icon-btn" onClick={() => window.electronAPI.minimizeWindow()} title="最小化">
              <MinusOutlined />
            </button>
            <button className="g-icon-btn" onClick={() => window.electronAPI.maximizeWindow()} title="最大化 / 还原">
              <BorderOutlined />
            </button>
            <button className="g-icon-btn ws-win-close" onClick={() => window.electronAPI.closeWindow()} title="关闭窗口">
              <CloseOutlined />
            </button>
          </div>
        )}
      </div>

      {/* 拖入高亮 */}
      {dragOver && (
        <div className="ws-dropzone">
          <div className="ws-dropzone-text">拖放文件夹到此处打开</div>
        </div>
      )}

      {/* ============ 主内容区：三栏玻璃 ============ */}
      <div className="ws-main">
        {/* 左：文件树 */}
        {leftPanelVisible && (
          <div className="ws-panel ws-panel-left g-panel g-sheen">
            <FileTree />
          </div>
        )}

        {/* 中：标签 + 内容 */}
        <div className="ws-center-col">
          <TabBar />
          <div className="ws-content">
            <ContentArea />
          </div>
        </div>

        {/* 右：会话列表 */}
        {rightPanelVisible && (
          <div className="ws-panel ws-panel-right g-panel g-sheen">
            <ConversationList />
          </div>
        )}
      </div>

      {/* 设置抽屉（含外观/壁纸） */}
      <SettingsDrawer open={settingsOpen} onClose={toggleSettings} />
    </div>
  );
};

export default WorkspaceLayout;
