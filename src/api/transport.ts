// API 传输层接口定义
// 所有 36 个方法签名，对应 preload/index.ts 中的 electronAPI

import type { ImageAttachment } from '../renderer/stores/chat-store';

export interface StreamChunk {
  type: 'text-delta' | 'thinking-delta' | 'tool-call' | 'done' | 'error';
  textDelta?: string;
  thinkingDelta?: string;
  toolCall?: { id: string; name: string; arguments: string };
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
  }): Promise<void>;
  stopGeneration(): void;
  onStreamChunk(callback: (chunk: StreamChunk) => void): () => void;

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

  // ========== Auth ==========
  authLogin?(username: string, password: string): Promise<{ ok: boolean; error?: string; user?: { id: number; username: string; role: string } }>;
  authRegister?(username: string, password: string): Promise<{ ok: boolean; error?: string; user?: { id: number; username: string; role: string } }>;

  // ========== Skills ==========
  listSkills(): Promise<SkillItem[]>;
  remoteSkillCatalog(): Promise<{ success: boolean; error?: string; skills: SkillItem[] }>;
  installSkill(data: { url?: string; skill?: SkillItem }): Promise<{ success: boolean; error?: string }>;
  deleteSkill(id: string): Promise<{ success: boolean; error?: string }>;
  exportSkill(id: string): Promise<string | null>;
  importSkill(jsonStr: string): Promise<{ success: boolean; error?: string }>;
}
