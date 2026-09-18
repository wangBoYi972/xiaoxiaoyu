import { create } from 'zustand';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: 'modified' | 'added' | 'deleted' | 'untracked' | null;
}

export interface Workspace {
  name: string;
  path: string;
  fileTree: FileNode[];
}

export interface Tab {
  id: string;
  type: 'chat' | 'file' | 'diff' | 'search' | 'terminal';
  title: string;
  conversationId?: string;
  filePath?: string;
  content?: string;
  unsaved?: boolean;
  icon?: string;
  /** 常驻标签（工作区的「对话」页）：不可关闭，切走后能随时切回来 */
  pinned?: boolean;

  /* ---------- type: 'diff' 专用 ----------
     由 Agent 提出改动时填充，交给 FileDiffView 并排展示。
     content 放「改后」，originalContent 放「改前」。 */
  originalContent?: string;
  /** 接受该改动 */
  onAccept?: () => void;
  /** 拒绝该改动 */
  onReject?: () => void;
}

/** 生成标签页 id（避免新增 nanoid 依赖） */
export function tabId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface WorkspaceState {
  // 工作区状态
  workspace: Workspace | null;
  isLoadingWorkspace: boolean;

  // 标签页管理
  tabs: Tab[];
  activeTabId: string | null;

  // 文件编辑器
  openFiles: Map<string, { content: string; unsaved: boolean }>;

  // 面板状态
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;

  // 文件树展开状态
  expandedDirs: Set<string>;
  // 已懒加载过子项的目录路径（避免重复拉取）
  loadedDirs: Set<string>;

  // Actions
  setWorkspace: (workspace: Workspace | null) => void;
  setLoadingWorkspace: (loading: boolean) => void;
  updateFileTree: (fileTree: FileNode[]) => void;

  // 标签页操作
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;

  // 文件操作
  setFileContent: (path: string, content: string, unsaved?: boolean) => void;
  markFileSaved: (path: string) => void;
  closeFile: (path: string) => void;

  // 面板操作
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;

  // 文件树操作
  toggleDirExpanded: (path: string) => void;
  setDirExpanded: (path: string, expanded: boolean) => void;
  /** 懒加载目录子项：首次点击目录时从主进程拉取，再展开 */
  loadDirChildren: (dirPath: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // 初始状态
  workspace: null,
  isLoadingWorkspace: false,
  tabs: [],
  activeTabId: null,
  openFiles: new Map(),
  leftPanelVisible: true,
  rightPanelVisible: false,
  leftPanelWidth: 280,
  rightPanelWidth: 320,
  expandedDirs: new Set(),
  loadedDirs: new Set(),

  // Workspace actions
  setWorkspace: (workspace) => {
    if (!workspace) {
      // 关闭工作区：标签页 / 文件缓存 / 展开状态一并清掉
      set({
        workspace: null,
        tabs: [],
        activeTabId: null,
        openFiles: new Map(),
        expandedDirs: new Set(),
        loadedDirs: new Set(),
      });
      return;
    }

    const prev = get();
    const sameProject = prev.workspace?.path === workspace.path;

    // 同一目录：保证有常驻「对话」标签并聚焦即可，不动现有会话
    if (sameProject) {
      const existingChat = prev.tabs.find(t => t.type === 'chat');
      if (existingChat) {
        set({ workspace, activeTabId: existingChat.id });
        return;
      }
    }

    // 换了目录（或首次打开）：开一个全新的常驻对话标签，
    // 旧项目的文件标签一并丢弃（会话本身还在左侧会话列表里，随时能再打开）
    const chatTab: Tab = { id: tabId(), type: 'chat', title: '对话', pinned: true };
    set({
      workspace,
      tabs: [chatTab],
      activeTabId: chatTab.id,
      openFiles: new Map(),
      expandedDirs: new Set(),
      loadedDirs: new Set(),
    });

    // 记住本次项目（启动时恢复用）；所有打开目录的入口都汇聚到这里，保证一致
    try { window.localStorage.setItem('codex_active_project', workspace.name); } catch {}
  },
  setLoadingWorkspace: (loading) => set({ isLoadingWorkspace: loading }),
  updateFileTree: (fileTree) => {
    const { workspace } = get();
    if (workspace) {
      set({ workspace: { ...workspace, fileTree } });
    }
  },

  // Tab actions
  addTab: (tab) => {
    const { tabs } = get();
    const existingTab = tabs.find(t =>
      (tab.type === 'chat' && t.conversationId === tab.conversationId) ||
      (tab.type === 'file' && t.filePath === tab.filePath)
    );

    if (existingTab) {
      set({ activeTabId: existingTab.id });
    } else {
      set({
        tabs: [...tabs, tab],
        activeTabId: tab.id,
      });
    }
  },

  removeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const newTabs = tabs.filter(t => t.id !== tabId);
    let newActiveId = activeTabId;

    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        newActiveId = newTabs[Math.min(index, newTabs.length - 1)].id;
      } else {
        newActiveId = null;
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTab: (tabId, updates) => {
    const { tabs } = get();
    set({
      tabs: tabs.map(t => t.id === tabId ? { ...t, ...updates } : t),
    });
  },

  // File actions
  setFileContent: (path, content, unsaved = false) => {
    const { openFiles } = get();
    openFiles.set(path, { content, unsaved });
    set({ openFiles: new Map(openFiles) });
  },

  markFileSaved: (path) => {
    const { openFiles, tabs } = get();
    const file = openFiles.get(path);
    if (file) {
      openFiles.set(path, { ...file, unsaved: false });
      set({
        openFiles: new Map(openFiles),
        tabs: tabs.map(t => t.filePath === path ? { ...t, unsaved: false } : t),
      });
    }
  },

  closeFile: (path) => {
    const { openFiles, tabs } = get();
    openFiles.delete(path);
    const tab = tabs.find(t => t.filePath === path);
    if (tab) {
      get().removeTab(tab.id);
    }
    set({ openFiles: new Map(openFiles) });
  },

  // Panel actions
  toggleLeftPanel: () => set((state) => ({ leftPanelVisible: !state.leftPanelVisible })),
  toggleRightPanel: () => set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: width }),

  // File tree actions
  toggleDirExpanded: (path) => {
    const { expandedDirs } = get();
    if (expandedDirs.has(path)) {
      expandedDirs.delete(path);
    } else {
      expandedDirs.add(path);
    }
    set({ expandedDirs: new Set(expandedDirs) });
  },

  setDirExpanded: (path, expanded) => {
    const { expandedDirs } = get();
    if (expanded) {
      expandedDirs.add(path);
    } else {
      expandedDirs.delete(path);
    }
    set({ expandedDirs: new Set(expandedDirs) });
  },

  // 懒加载目录子项：首次展开时从主进程拉取该目录的直接子项，递归合并进 fileTree
  loadDirChildren: async (dirPath) => {
    const { loadedDirs, expandedDirs } = get();

    // 已加载过 → 直接展开（数据已在 fileTree 里）
    if (loadedDirs.has(dirPath)) {
      set({ expandedDirs: new Set(expandedDirs).add(dirPath) });
      return;
    }

    const api = window.electronAPI;
    if (!api?.workspace?.expandDir) return;

    try {
      const result = await api.workspace.expandDir(dirPath);
      if (!result?.success || !Array.isArray(result.children)) return;

      const { workspace } = get();
      if (!workspace) return;

      const merged = mergeChildren(workspace.fileTree, dirPath, result.children);
      set({
        workspace: { ...workspace, fileTree: merged },
        loadedDirs: new Set(loadedDirs).add(dirPath),
        expandedDirs: new Set(expandedDirs).add(dirPath),
      });
    } catch (error) {
      console.error('懒加载目录失败:', error);
    }
  },
}));

/** 递归地把 children 合并到 fileTree 中 path 匹配的目录节点 */
function mergeChildren(nodes: FileNode[], dirPath: string, children: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (node.path === dirPath) {
      return { ...node, children };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: mergeChildren(node.children, dirPath, children) };
    }
    return node;
  });
}
