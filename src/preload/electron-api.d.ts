export interface ElectronAPI {
  sendChatMessage: (data: {
    providerId: string;
    modelId: string;
    messages: Array<{ role: string; content: string | any[] }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    conversationId?: string;
  }) => Promise<void>;

  stopGeneration: () => void;

  onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void;

  listConversations: () => Promise<Conversation[]>;
  getConversation: (id: string) => Promise<Conversation | null>;
  createConversation: (data: { title?: string; modelId: string; providerId: string }) => Promise<Conversation>;
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

  getAppVersion: () => Promise<string>;
}

export interface StreamChunk {
  type: 'text-delta' | 'thinking-delta' | 'tool-call' | 'done' | 'error';
  textDelta?: string;
  thinkingDelta?: string;
  toolCall?: unknown;
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
