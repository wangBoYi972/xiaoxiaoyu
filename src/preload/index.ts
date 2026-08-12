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
  }) => ipcRenderer.invoke('chat:send', data),

  stopGeneration: () => ipcRenderer.send('chat:stop'),

  onStreamChunk: (callback: (chunk: {
    type: string;
    textDelta?: string;
    thinkingDelta?: string;
    toolCall?: unknown;
    doneReason?: string;
    usage?: { inputTokens: number; outputTokens: number };
    error?: { message: string; code?: string };
  }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: unknown) => callback(chunk as any);
    ipcRenderer.on('chat:stream-chunk', handler);
    return () => ipcRenderer.removeListener('chat:stream-chunk', handler);
  },

  // 对话管理
  listConversations: () => ipcRenderer.invoke('conv:list'),
  getConversation: (id: string) => ipcRenderer.invoke('conv:get', id),
  createConversation: (data: { title?: string; modelId: string; providerId: string }) =>
    ipcRenderer.invoke('conv:create', data),
  deleteConversation: (id: string) => ipcRenderer.invoke('conv:delete', id),
  renameConversation: (id: string, title: string) => ipcRenderer.invoke('conv:rename', id, title),

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

  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // 认证（桌面版）
  authLogin: (data: { username: string; password: string }) => ipcRenderer.invoke('auth:login', data),
  authRegister: (data: { username: string; password: string }) => ipcRenderer.invoke('auth:register', data),
  authMe: (userId: number) => ipcRenderer.invoke('auth:me', userId),

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
