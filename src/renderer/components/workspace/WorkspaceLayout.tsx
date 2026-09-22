import React, { useEffect, useRef, useState } from 'react';
import { Dropdown, message } from 'antd';
import {
  FolderOpenOutlined,
  FolderOutlined,
  CloseOutlined,
  MessageOutlined,
  AppstoreOutlined,
  CodeOutlined,
  GlobalOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusOutlined,
  BorderOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useSettingsStore } from '../../stores/settings-store';
import FileTree from './FileTree';
import TabBar from './TabBar';
import ContentArea from './ContentArea';
import ConversationList from './ConversationList';
import BrowserView from './BrowserView';
import { SettingsDrawer } from '../settings/SettingsDrawer';
import { useAuthStore } from '../../stores/auth-store';

const TerminalView = React.lazy(() => import('./TerminalView'));

type QuickTool = 'terminal' | 'browser' | 'files' | 'chat';

const QUICK_TOOLS: Array<{ key: QuickTool; label: string; shortcut: string; icon: React.ReactNode }> = [
  { key: 'terminal', label: '终端', shortcut: 'Ctrl+`', icon: <CodeOutlined /> },
  { key: 'browser', label: '浏览器', shortcut: 'Ctrl+T', icon: <GlobalOutlined /> },
  { key: 'files', label: '文件', shortcut: 'Ctrl+P', icon: <FolderOpenOutlined /> },
  { key: 'chat', label: '侧边聊天', shortcut: 'Ctrl+Alt+S', icon: <MessageOutlined /> },
];

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
    toggleLeftPanel,
    setWorkspace,
    setLoadingWorkspace,
  } = useWorkspaceStore();

  const { settingsOpen, toggleSettings } = useSettingsStore();
  const { user, logout, openLogin } = useAuthStore();

  const [dragOver, setDragOver] = useState(false);
  const [activeTool, setActiveTool] = useState<QuickTool | null>(null);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(268);
  // 终端以运行日志为主体，默认高度要为输出保留足够空间。
  const [terminalHeight, setTerminalHeight] = useState(260);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workspace || !window.electronAPI?.workspace?.onFileChange) return;
    let refreshTimer: number | undefined;
    const unsubscribe = window.electronAPI.workspace.onFileChange(() => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(async () => {
        try {
          const result = await window.electronAPI.workspace.refresh(workspace.path);
          if (result?.success && result.fileTree) useWorkspaceStore.getState().updateFileTree(result.fileTree);
        } catch { /* 文件监听只做增强，失败不影响工作区 */ }
      }, 220);
    });
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      unsubscribe?.();
    };
  }, [workspace?.path]);

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

  const openTerminalTool = () => {
    const ws = useWorkspaceStore.getState();
    // 终端统一作为底部 dock 展示，不再额外创建顶部标签，避免同一面板渲染两次。
    ws.tabs
      .filter((tab) => tab.type === 'terminal')
      .forEach((tab) => ws.removeTab(tab.id));
    setTerminalOpen((open) => {
      const next = !open;
      setActiveTool(next ? 'terminal' : null);
      return next;
    });
  };

  const selectTool = (tool: QuickTool) => {
    if (tool === 'terminal') {
      openTerminalTool();
      return;
    }
    setToolsVisible(true);
    setActiveTool((current) => current === tool ? null : tool);
  };

  const startLeftResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const main = rootRef.current?.querySelector<HTMLElement>('.ws-main');
    if (!main) return;
    const bounds = main.getBoundingClientRect();
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(200, Math.min(460, moveEvent.clientX - bounds.left));
      setLeftPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startTerminalResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(190, Math.min(560, bounds.bottom - moveEvent.clientY - 10));
      setTerminalHeight(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const renderToolPanel = () => {
    if (!activeTool || activeTool === 'terminal') return null;
    if (activeTool === 'files') {
      return <FileTree />;
    }
    if (activeTool === 'chat') {
      return <ConversationList />;
    }
    return null;
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
    <div className="ws-root" ref={rootRef}>
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

        {/* 右侧：工具栏与会话面板 */}
        <button
          className={`g-icon-btn ${toolsVisible ? 'on' : ''}`}
          onClick={() => {
            setToolsVisible((visible) => !visible);
            if (toolsVisible) setActiveTool(null);
          }}
          title={toolsVisible ? '隐藏右侧工具栏' : '显示右侧工具栏'}
        >
          <AppstoreOutlined />
        </button>
        <button
          className={`g-icon-btn ${activeTool === 'chat' ? 'on' : ''}`}
          onClick={() => selectTool('chat')}
          title="会话列表"
        >
          <MessageOutlined />
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
          <div className="ws-panel ws-panel-left g-panel g-sheen" style={{ width: leftPanelWidth, flexBasis: leftPanelWidth }}>
            <div className="ws-file-tree-wrap"><FileTree /></div>
            <Dropdown
              trigger={['click']}
              placement="topLeft"
              menu={{
                items: [
                  { key: 'settings', icon: <SettingOutlined />, label: '设置', onClick: toggleSettings },
                  { type: 'divider' },
                  ...(user
                    ? [{ key: 'logout', icon: <LogoutOutlined />, danger: true, label: '退出登录', onClick: logout }]
                    : [{ key: 'login', icon: <UserOutlined />, label: '登录账户', onClick: openLogin }]),
                ],
              }}
            >
              <button className="ws-account-entry" type="button" title="账号与设置">
                <span className="ws-account-avatar"><UserOutlined /></span>
                <span className="ws-account-copy">
                  <strong>{user?.username || '未登录'}</strong>
                  <small>{user?.role === 'admin' ? '管理员' : user ? '账号与设置' : '游客模式'}</small>
                </span>
                <span className="ws-account-more">•••</span>
              </button>
            </Dropdown>
          </div>
        )}
        {leftPanelVisible && <div className="ws-resizer ws-resizer-vertical" onPointerDown={startLeftResize} role="separator" aria-orientation="vertical" aria-label="调整文件区宽度" />}

        {/* 中：标签 + 内容 */}
        <div className="ws-center-col">
          <TabBar onSelect={() => setActiveTool((tool) => tool === 'browser' ? null : tool)} />
          <div className="ws-content">
            {activeTool === 'browser' ? <BrowserView /> : <ContentArea />}
          </div>
        </div>

        {/* 右侧工具条可由顶部按钮随时隐藏；非浏览器工具从右侧浮出。 */}
        {toolsVisible && (
          <aside className={`ws-tools ${activeTool && activeTool !== 'terminal' && activeTool !== 'browser' ? 'is-open' : ''}`}>
            <div className="ws-tools-list">
              {QUICK_TOOLS.map((tool) => (
                <button
                  key={tool.key}
                  className={`ws-tool-btn ${activeTool === tool.key ? 'active' : ''}`}
                  onClick={() => selectTool(tool.key)}
                  title={`${tool.label}（${tool.shortcut}）`}
                >
                  <span className="ws-tool-icon">{tool.icon}</span>
                  <span>{tool.label}</span>
                  <kbd>{tool.shortcut}</kbd>
                </button>
              ))}
            </div>
            {activeTool && activeTool !== 'terminal' && activeTool !== 'browser' && (
              <div className="ws-tool-panel g-panel g-sheen">
                {renderToolPanel()}
              </div>
            )}
          </aside>
        )}
      </div>

      {terminalOpen && (
        <>
          <div className="ws-resizer ws-resizer-horizontal" onPointerDown={startTerminalResize} role="separator" aria-orientation="horizontal" aria-label="调整终端高度" />
          <section className="ws-terminal-dock g-panel g-sheen" style={{ height: terminalHeight, flexBasis: terminalHeight }}>
          <div className="ws-terminal-dock-head">
            <span><CodeOutlined /> 终端</span>
            <button className="g-icon-btn" onClick={() => { setTerminalOpen(false); setActiveTool(null); }} title="关闭终端"><CloseOutlined /></button>
          </div>
          <div className="ws-terminal-dock-body">
            <React.Suspense fallback={<div className="ws-editor-loading">正在加载终端…</div>}>
              <TerminalView />
            </React.Suspense>
          </div>
          </section>
        </>
      )}

      {/* 设置抽屉（含外观/壁纸） */}
      <SettingsDrawer open={settingsOpen} onClose={toggleSettings} />
    </div>
  );
};

export default WorkspaceLayout;
