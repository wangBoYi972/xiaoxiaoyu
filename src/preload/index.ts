import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的安全 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 聊天
  sendChatMessage: (data: {
    providerId: string;
    modelId: string;
    messages: Array<{ role: string; content: string | any[] }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    conversationId?: string;
    /** Agent 模式：注入内置工具（读写文件/执行命令/搜索），需配合 workspacePath */
    agentMode?: boolean;
    /** Agent 工作区根目录（沙箱边界） */
    workspacePath?: string;
  }) => ipcRenderer.invoke('chat:send', data),

  stopGeneration: () => ipcRenderer.send('chat:stop'),

  onStreamChunk: (callback: (chunk: {
    type: string;
    textDelta?: string;
    thinkingDelta?: string;
    toolCall?: unknown;
    /** type === 'tool-result' 时的结构化工具执行结果 */
    toolResult?: { id: string; name: string; success: boolean; output: string };
    doneReason?: string;
    usage?: { inputTokens: number; outputTokens: number };
    error?: { message: string; code?: string };
  }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: unknown) => callback(chunk as any);
    ipcRenderer.on('chat:stream-chunk', handler);
    return () => ipcRenderer.removeListener('chat:stream-chunk', handler);
  },

  // 工作区（主进程 handler：workspace:open/close/get-tree/expand-dir/refresh）
  workspace: {
    open: () => ipcRenderer.invoke('workspace:open'),
    close: (workspacePath?: string) => ipcRenderer.invoke('workspace:close', workspacePath),
    getFileTree: (workspacePath: string) => ipcRenderer.invoke('workspace:get-tree', workspacePath),
    refresh: (workspacePath: string) => ipcRenderer.invoke('workspace:refresh', workspacePath),
    expandDir: (dirPath: string) => ipcRenderer.invoke('workspace:expand-dir', dirPath),
    onFileChange: (callback: (event: { type: string; path: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('workspace:file-changed', handler);
      return () => ipcRenderer.removeListener('workspace:file-changed', handler);
    },
  },

  // Agent：run_command 执行前用户确认（主进程发起 → 渲染层弹窗 → 回传结果）
  onAgentConfirmRequest: (callback: (req: { id: string; title: string; detail: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('agent:confirm-request', handler);
    return () => ipcRenderer.removeListener('agent:confirm-request', handler);
  },
  respondAgentConfirm: (id: string, allowed: boolean) =>
    ipcRenderer.send('agent:confirm-response', { id, allowed }),

  // 项目启动器（真启动：主进程 spawn，继承完整系统环境 JDK/PATH/JAVA_HOME）
  runner: {
    /** 在工作区里跑任意命令（优先用 command，否则回退 npm run <script>） */
    start: (data: { script?: string; cwd: string; command?: string }) =>
      ipcRenderer.invoke('runner:start', data),
    stop: () => ipcRenderer.invoke('runner:stop'),
    status: () => ipcRenderer.invoke('runner:status'),
    /** 探测项目类型与候选启动命令（Node/Maven/Gradle/Python/Go/静态） */
    detect: (cwd: string) => ipcRenderer.invoke('runner:detect', cwd),
    /** 探测环境：node / java(JAVA_HOME) / python / git / maven */
    checkEnv: () => ipcRenderer.invoke('runner:check-env'),
    onOutput: (callback: (chunk: {
      id: string;
      type: 'start' | 'stdout' | 'stderr' | 'exit' | 'error' | 'stopped';
      script?: string;
      command?: string;
      cwd?: string;
      data?: string;
      code?: number;
    }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: any) => callback(chunk);
      ipcRenderer.on('runner:output', handler);
      return () => ipcRenderer.removeListener('runner:output', handler);
    },
  },

  // 对话管理
  listConversations: (userId?: number | string) => ipcRenderer.invoke('conv:list', userId),
  getConversation: (id: string, userId?: number | string) => ipcRenderer.invoke('conv:get', id, userId),
  createConversation: (data: { title?: string; modelId: string; providerId: string; userId?: number | string }) =>
    ipcRenderer.invoke('conv:create', data),
  deleteConversation: (id: string, userId?: number | string) => ipcRenderer.invoke('conv:delete', id, userId),
  renameConversation: (id: string, title: string, userId?: number | string) => ipcRenderer.invoke('conv:rename', id, title, userId),

  // 消息管理
  listMessages: (conversationId: string) => ipcRenderer.invoke('msg:list', conversationId),

  // 设置
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:get-all'),

  // 提供商配置
  listProviders: () => ipcRenderer.invoke('provider:list'),
  saveProvider: (config: {
    id: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
    enabled: boolean;
    models: string[];
  }) => ipcRenderer.invoke('provider:save', config),
  deleteProvider: (id: string) => ipcRenderer.invoke('provider:delete', id),
  testProvider: (id: string) => ipcRenderer.invoke('provider:test', id),

  // 文件操作
  openFileDialog: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('file:open-dialog', options),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),

  // 工作区文件操作（编辑器 / 文件树使用，全部限制在已授权工作区内）
  file: {
    openDialog: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('file:open-dialog', options),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    readText: (filePath: string) => ipcRenderer.invoke('file:read-text', filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
    delete: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
    listDir: (dirPath: string) => ipcRenderer.invoke('file:list-dir', dirPath),
    search: (workspacePath: string, query: string, filePattern?: string) =>
      ipcRenderer.invoke('file:search', workspacePath, query, filePattern),
    getGitStatus: (filePath: string) => ipcRenderer.invoke('file:get-git-status', filePath),
    getDiff: (filePath: string) => ipcRenderer.invoke('file:get-diff', filePath),
  },

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // 应用事件监听
  onNewChat: (callback: () => void) => {
    ipcRenderer.on('app:new-chat', callback);
    return () => ipcRenderer.removeListener('app:new-chat', callback);
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('app:open-settings', callback);
    return () => ipcRenderer.removeListener('app:open-settings', callback);
  },

  // 更新
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    ipcRenderer.on('update:available', (_e, info) => callback(info));
    return () => ipcRenderer.removeListener('update:available', callback as any);
  },
  onUpdateProgress: (callback: (progress: { stage: string; percent: number }) => void) => {
    ipcRenderer.on('update:progress', (_e, p) => callback(p));
    return () => ipcRenderer.removeListener('update:progress', callback as any);
  },
  onUpdateError: (callback: (error: { message: string }) => void) => {
    ipcRenderer.on('update:error', (_e, err) => callback(err));
    return () => ipcRenderer.removeListener('update:error', callback as any);
  },
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: (downloadUrl: string) => ipcRenderer.invoke('update:install', downloadUrl),
  getUpdateUrl: () => ipcRenderer.invoke('update:getUrl'),
  setUpdateUrl: (url: string) => ipcRenderer.invoke('update:setUrl', url),
  onAnnouncement: (callback: (ann: any) => void) => {
    ipcRenderer.on('announcement:show', (_e, ann) => callback(ann));
    return () => ipcRenderer.removeListener('announcement:show', callback as any);
  },
  markAnnouncementRead: (id: string) => ipcRenderer.invoke('announcement:read', id),
  showAnnouncements: () => ipcRenderer.invoke('announcement:show'),

  // 技能系统
  listSkills: () => ipcRenderer.invoke('skills:list'),
  remoteSkillCatalog: () => ipcRenderer.invoke('skills:remote-catalog'),
  installSkill: (data: any) => ipcRenderer.invoke('skills:install', data),
  deleteSkill: (id: string) => ipcRenderer.invoke('skills:delete', id),
  exportSkill: (id: string) => ipcRenderer.invoke('skills:export', id),
  importSkill: (jsonStr: string) => ipcRenderer.invoke('skills:import', jsonStr),

  // RAG（语义检索 / 向量索引）
  rag: {
    getConfig: () => ipcRenderer.invoke('rag:get-config'),
    setConfig: (patch: Record<string, unknown>) => ipcRenderer.invoke('rag:set-config', patch),
    probe: () => ipcRenderer.invoke('rag:probe'),
    status: (workspace: string) => ipcRenderer.invoke('rag:status', workspace),
    index: (workspace: string) => ipcRenderer.invoke('rag:index', workspace),
    cancel: () => ipcRenderer.invoke('rag:cancel'),
    clear: (workspace: string) => ipcRenderer.invoke('rag:clear', workspace),
    search: (data: { workspace: string; query: string; topK?: number }) =>
      ipcRenderer.invoke('rag:search', data),
    ollamaModels: (url?: string) => ipcRenderer.invoke('rag:ollama-models', url),
    pullModel: (model?: string) => ipcRenderer.invoke('rag:pull-model', model),
    onProgress: (callback: (p: unknown) => void) => {
      const handler = (_e: unknown, p: unknown) => callback(p);
      ipcRenderer.on('rag:progress', handler as any);
      return () => ipcRenderer.removeListener('rag:progress', handler as any);
    },
  },

  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // 认证（桌面版）— QQ 邮箱 + 验证码
  authLogin: (data: { username: string; password: string }) => ipcRenderer.invoke('auth:login', data),
  authRegister: (data: { username: string; password: string; code?: string }) => ipcRenderer.invoke('auth:register', data),
  authMe: (userId: number) => ipcRenderer.invoke('auth:me', userId),
  sendVerificationCode: (email: string, purpose?: 'register' | 'reset') =>
    ipcRenderer.invoke('auth:send-code', { email, purpose }),
  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    ipcRenderer.invoke('auth:reset-password', data),
  getSmtpStatus: (userId?: number | string) => ipcRenderer.invoke('auth:smtp-status', userId),
  getRegistrationMode: () => ipcRenderer.invoke('auth:registration-mode'),
  // 通用直通：仅开放 finetune: 前缀，避免把全部 IPC 暴露给渲染层
  invoke: (channel: string, ...args: unknown[]) => {
    if (typeof channel !== 'string' || !channel.startsWith('finetune:')) {
      return Promise.resolve({ ok: false, error: `不允许的通道: ${channel}` });
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  setSmtpConfig: (cfg: { user?: string; pass?: string; host?: string; port?: number }, userId?: number | string) =>
    ipcRenderer.invoke('auth:set-smtp', cfg, userId),

  // Ollama（桌面版本地模式）
  checkOllamaStatus: () => ipcRenderer.invoke('ollama:status'),
  ollamaSetup: () => ipcRenderer.invoke('ollama:setup'),
  onOllamaStatus: (cb: (s: any) => void) => {
    const handler = (_e: any, s: any) => cb(s);
    ipcRenderer.on('ollama:status', handler);
    return handler;
  },
  offOllamaStatus: (handler: any) => ipcRenderer.removeListener('ollama:status', handler),
  onOllamaProgress: (cb: (p: any) => void) => {
    const handler = (_e: any, p: any) => cb(p);
    ipcRenderer.on('ollama:progress', handler);
    return handler;
  },
  offOllamaProgress: (handler: any) => ipcRenderer.removeListener('ollama:progress', handler),
});
