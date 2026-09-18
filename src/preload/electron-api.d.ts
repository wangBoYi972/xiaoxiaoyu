// preload 暴露的 window.electronAPI 类型契约
// 与 src/preload/index.ts 实现、src/api/transport.ts 的 ApiTransport 保持同步。

/** 文件树节点（与 renderer/stores/workspace-store 的 FileNode 结构一致） */
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: 'modified' | 'added' | 'deleted' | 'untracked' | null;
}

/** 主进程统一返回信封 */
export interface IpcResult<T = unknown> {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  sendChatMessage: (data: {
    providerId: string;
    modelId: string;
    messages: Array<{ role: string; content: string | any[] }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    conversationId?: string;
    /** Agent 模式：注入内置工具（读写文件 / 执行命令 / 搜索） */
    agentMode?: boolean;
    /** Agent 工作区根目录（沙箱边界） */
    workspacePath?: string;
  }) => Promise<void>;

  stopGeneration: () => void;

  onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void;

  // ========== RAG（语义检索 / 向量索引）==========
  rag: {
    getConfig: () => Promise<RagConfig>;
    setConfig: (patch: Partial<RagConfig>) => Promise<RagConfig>;
    probe: () => Promise<{ ok?: boolean; backend?: string; label?: string; dim?: number; error?: string }>;
    status: (workspace: string) => Promise<{ chunks: number; files: number; model: string; error?: string }>;
    index: (workspace: string) => Promise<{ ok: boolean; files?: number; chunks?: number; backend?: string; message?: string }>;
    cancel: () => Promise<boolean>;
    clear: (workspace: string) => Promise<boolean>;
    search: (data: { workspace: string; query: string; topK?: number }) => Promise<RagHit[]>;
    ollamaModels: (url?: string) => Promise<{ ok: boolean; models: string[]; error?: string }>;
    pullModel: (model?: string) => Promise<{ ok: boolean; model?: string; message?: string }>;
    onProgress: (callback: (p: {
      phase: 'scan' | 'embed' | 'pull' | 'done' | 'error' | 'cancelled';
      done: number; total: number; current?: string; message?: string;
    }) => void) => () => void;
  };

  // ========== Agent ==========
  onAgentConfirmRequest: (callback: (req: { id: string; title: string; detail: string }) => void) => () => void;
  respondAgentConfirm: (id: string, allowed: boolean) => void;

  // ========== Workspace ==========
  workspace: {
    open: () => Promise<IpcResult & { workspace?: { path: string; name: string; fileTree: FileNode[] } }>;
    close: (workspacePath?: string) => Promise<IpcResult>;
    getFileTree: (workspacePath: string) => Promise<IpcResult & { fileTree?: FileNode[] }>;
    refresh: (workspacePath: string) => Promise<IpcResult & { fileTree?: FileNode[] }>;
    expandDir: (dirPath: string) => Promise<IpcResult & { children?: FileNode[] }>;
    onFileChange: (callback: (event: { type: string; path: string }) => void) => () => void;
  };

  // ========== File ==========
  file: {
    read: (filePath: string) => Promise<IpcResult & { data?: string; mimeType?: string; name?: string }>;
    readText: (filePath: string) => Promise<IpcResult & { content?: string; path?: string }>;
    write: (filePath: string, content: string) => Promise<IpcResult & { path?: string }>;
    listDir: (dirPath: string) => Promise<IpcResult & { files?: Array<{ name: string; path: string; type: string; isDirectory: boolean; isFile: boolean }> }>;
    search: (workspacePath: string, query: string, filePattern?: string) => Promise<IpcResult & { results?: Array<{ path: string; name: string; line?: number; content?: string }> }>;
    getGitStatus: (filePath: string) => Promise<IpcResult & { status?: string | null }>;
    getDiff: (filePath: string) => Promise<IpcResult & { diff?: string }>;
    delete: (filePath: string) => Promise<IpcResult>;
    rename: (oldPath: string, newPath: string) => Promise<IpcResult>;
  };

  listConversations: (userId?: number | string) => Promise<Conversation[]>;
  getConversation: (id: string, userId?: number | string) => Promise<Conversation | null>;
  createConversation: (data: { title?: string; modelId: string; providerId: string; userId?: number | string }) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  listMessages: (conversationId: string) => Promise<Message[]>;

  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  getAllSettings: () => Promise<Record<string, string>>;

  listProviders: () => Promise<ProviderConfig[]>;
  saveProvider: (config: ProviderConfig) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  testProvider: (id: string) => Promise<boolean>;

  openFileDialog: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>;
  readFile: (filePath: string) => Promise<{ data: string; mimeType: string; name: string }>;

  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;

  onNewChat: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;

  onUpdateAvailable: (callback: (info: { version: string; currentVersion: string; releaseNotes: string; downloadUrl: string }) => void) => () => void;
  onUpdateProgress: (callback: (progress: { stage: string; percent: number }) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;
  checkUpdate: () => Promise<void>;
  installUpdate: (downloadUrl: string) => Promise<void>;
  getUpdateUrl: () => Promise<string>;
  setUpdateUrl: (url: string) => Promise<void>;

  onAnnouncement: (callback: (ann: unknown) => void) => () => void;
  markAnnouncementRead: (id: string) => Promise<void>;
  showAnnouncements: () => Promise<void>;

  listSkills: () => Promise<unknown[]>;
  remoteSkillCatalog: () => Promise<unknown>;
  installSkill: (data: unknown) => Promise<{ success: boolean; error?: string }>;
  deleteSkill: (id: string) => Promise<{ success: boolean; error?: string }>;
  exportSkill: (id: string) => Promise<string | null>;
  importSkill: (jsonStr: string) => Promise<{ success: boolean; error?: string }>;

  getAppVersion: () => Promise<string>;

  // ========== Auth（桌面本地账户：QQ 邮箱 + 邮箱验证码） ==========
  authLogin: (data: { username: string; password: string }) => Promise<AuthResult>;
  authRegister: (data: { username: string; password: string; code?: string }) => Promise<AuthResult>;
  authMe: (userId: number) => Promise<AuthUser | null>;
  sendVerificationCode: (email: string, purpose?: 'register' | 'reset') => Promise<AuthResult>;
  resetPassword: (data: { email: string; code: string; newPassword: string }) => Promise<AuthResult>;
  getSmtpStatus: (userId?: number | string) => Promise<{ configured: boolean; smtpUser?: string; smtpHost?: string; smtpPort?: number }>;
  getRegistrationMode: () => Promise<{ firstAccount: boolean }>;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  setSmtpConfig: (cfg: { user?: string; pass?: string; host?: string; port?: number }) => Promise<AuthResult & { configured?: boolean }>;

  // ========== Ollama（桌面本地模式） ==========
  checkOllamaStatus: () => Promise<unknown>;
  ollamaSetup: () => Promise<unknown>;
  onOllamaStatus: (cb: (s: unknown) => void) => unknown;
  offOllamaStatus: (handler: unknown) => void;
  onOllamaProgress: (cb: (p: unknown) => void) => unknown;
  offOllamaProgress: (handler: unknown) => void;
}

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  role: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  code?: string;
  message?: string;
  user?: AuthUser;
  token?: string;
}

export interface StreamChunk {
  type: 'text-delta' | 'thinking-delta' | 'tool-call' | 'tool-result' | 'done' | 'error';
  textDelta?: string;
  thinkingDelta?: string;
  toolCall?: { id: string; name: string; arguments: string };
  /** Agent 工具执行结果（type === 'tool-result'） */
  toolResult?: { id: string; name: string; success: boolean; output: string };
  doneReason?: 'stop' | 'length' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
  error?: { message: string; code?: string };
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isPinned: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokenCount?: number;
  files?: string;
  createdAt: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  hasApiKey: boolean;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
}

export interface RagConfig {
  backend: 'auto' | 'ollama' | 'openai' | 'local';
  ollamaUrl?: string;
  ollamaModel?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  dim?: number;
  chunkSize: number;
  chunkOverlap: number;
  maxFileBytes: number;
  maxFiles: number;
  autoInject: boolean;
  topK: number;
}

export interface RagHit {
  id: number;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsThinking: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
