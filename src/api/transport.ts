// API 传输层接口定义
// 所有方法签名对应 preload/index.ts 中的 electronAPI（桌面端）。

import type { ImageAttachment } from '../renderer/stores/chat-store';
import type { FileNode } from '../renderer/stores/workspace-store';

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

/** Agent 执行命令前的确认请求（渲染层弹窗 → 回传 allowed） */
export interface AgentConfirmRequest {
  id: string;
  title: string;
  detail: string;
}

// ========== 认证 ==========

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  role: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** 机器可读的错误码，例如 SMTP_NOT_CONFIGURED */
  code?: string;
  message?: string;
  user?: AuthUser;
  /** 远程公告数据 */
  token?: string;
}

export type MailPurpose = 'register' | 'reset';

export interface SmtpStatus {
  configured: boolean;
  smtpUser?: string;
  smtpHost?: string;
  smtpPort?: number;
}

/** 工作区（本地文件系统）能力 */
export interface OpenedWorkspace {
  path: string;
  name: string;
  fileTree: FileNode[];
}

export interface WorkspaceTransport {
  /** 打开目录选择框；取消返回 null */
  open(): Promise<OpenedWorkspace | null>;
  close(workspacePath?: string): Promise<void>;
  getFileTree(workspacePath: string): Promise<FileNode[]>;
  /** 强制刷新文件树（绕过缓存） */
  refresh(workspacePath: string): Promise<FileNode[]>;
  /** 懒加载展开某个目录 */
  expandDir(dirPath: string): Promise<FileNode[]>;
  onFileChange(callback: (event: { type: string; path: string }) => void): () => void;
}


export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isPinned: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  tokenCount?: number;
  files?: string;
  createdAt: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  hasApiKey?: boolean;
  baseUrl: string;
  enabled: boolean;
  models?: string[];
}

export interface ProviderSaveInput {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
  extraHeaders?: Record<string, string>;
}

export interface FileData {
  data: string;    // base64
  mimeType: string;
  name: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  version: string;
  author?: string;
  downloadUrl?: string;
}

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseNotes: string;
  downloadUrl: string;
  sha256?: string;
}

export interface UpdateProgress {
  stage: string;
  percent: number;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  level: 'info' | 'warning' | 'important';
  validUntil?: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled: boolean;
}

export interface MCPServerInfo extends MCPServerConfig {
  status: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ApiTransport {
  // ========== Chat ==========
  sendChatMessage(data: {
    providerId: string;
    modelId: string;
    messages: Array<{ role: string; content: string | any[] }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    conversationId?: string;
    /** Agent 模式：注入内置工具（读写文件 / 执行命令 / 搜索） */
    agentMode?: boolean;
    /** Agent 工作区根目录（沙箱边界，必填于 agentMode） */
    workspacePath?: string;
  }): Promise<void>;
  stopGeneration(): void;
  onStreamChunk(callback: (chunk: StreamChunk) => void): () => void;

  // ========== Agent ==========
  /** 监听主进程发来的命令确认请求（桌面端） */
  onAgentConfirmRequest(callback: (req: AgentConfirmRequest) => void): () => void;
  /** 回传用户是否允许执行该命令 */
  respondAgentConfirm(id: string, allowed: boolean): void;

  // ========== Workspace ==========
  workspace: WorkspaceTransport;

  // ========== Conversations ==========
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(data: { title?: string; modelId: string; providerId: string }): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;

  // ========== Messages ==========
  listMessages(conversationId: string): Promise<Message[]>;

  // ========== Settings ==========
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;

  // ========== Providers ==========
  listProviders(): Promise<ProviderConfig[]>;
  saveProvider(config: ProviderSaveInput): Promise<void>;
  deleteProvider(id: string): Promise<void>;
  testProvider(id: string): Promise<boolean>;

  // ========== Files ==========
  openFileDialog(options?: { filters?: FileFilter[] }): Promise<string[]>;
  readFile(filePath: string): Promise<FileData>;

  // ========== Window controls (desktop-only) ==========
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  isMaximized(): Promise<boolean>;
  getAppVersion(): Promise<string>;

  // ========== App events ==========
  onNewChat(callback: () => void): () => void;
  onOpenSettings(callback: () => void): () => void;

  // ========== Updates ==========
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void;
  onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void;
  onUpdateError(callback: (error: { message: string }) => void): () => void;
  checkUpdate(): Promise<void>;
  installUpdate(downloadUrl: string): Promise<void>;
  getUpdateUrl(): Promise<string>;
  setUpdateUrl(url: string): Promise<void>;

  // ========== Announcements ==========
  onAnnouncement(callback: (ann: Announcement) => void): () => void;
  markAnnouncementRead(id: string): Promise<void>;
  showAnnouncements(): Promise<void>;

  // ========== Auth（桌面端 IPC） ==========
  /** 邮箱 + 密码登录 */
  authLogin(data: { username: string; password: string }): Promise<AuthResult>;
  /** QQ 邮箱注册（需邮箱验证码） */
  authRegister(data: { username: string; password: string; code?: string }): Promise<AuthResult>;
  /** 发送邮箱验证码 */
  sendVerificationCode(email: string, purpose?: MailPurpose): Promise<AuthResult>;
  /** 邮箱验证码重置密码 */
  resetPassword(data: { email: string; code: string; newPassword: string }): Promise<AuthResult>;
  /** 发件邮箱（SMTP）配置状态 */
  getSmtpStatus(): Promise<SmtpStatus>;
  /** 保存 SMTP 配置 */
  setSmtpConfig(cfg: { user?: string; pass?: string; host?: string; port?: number }): Promise<AuthResult>;
  /** 注册模式：库里还没有账号时，首个注册免验证码（自动成为管理员） */
  getRegistrationMode(): Promise<{ firstAccount: boolean }>;
  /** 退出登录 */
  logout?(): void;

  // ========== Skills ==========
  listSkills(): Promise<SkillItem[]>;
  remoteSkillCatalog(): Promise<{ success: boolean; error?: string; skills: SkillItem[] }>;
  installSkill(data: { url?: string; skill?: SkillItem }): Promise<{ success: boolean; error?: string }>;
  deleteSkill(id: string): Promise<{ success: boolean; error?: string }>;
  exportSkill(id: string): Promise<string | null>;
  importSkill(jsonStr: string): Promise<{ success: boolean; error?: string }>;
}
