// IPC 传输实现 — 包裹 window.electronAPI（Electron 环境）
// 每个方法直接 delegate 到 preload 暴露的 electronAPI

import type {
  ApiTransport, StreamChunk, Conversation, Message,
  ProviderConfig, ProviderSaveInput, FileData, FileFilter,
  SkillItem, UpdateInfo, UpdateProgress, Announcement,
  AgentConfirmRequest, AuthResult, MailPurpose, SmtpStatus, WorkspaceTransport,
  OpenedWorkspace,
} from './transport';
import type { FileNode } from '../renderer/stores/workspace-store';

export class IpcTransport implements ApiTransport {
  private api: any;

  constructor() {
    if (!(window as any).electronAPI) {
      throw new Error('IpcTransport 需要 Electron 环境，未检测到 window.electronAPI');
    }
    this.api = (window as any).electronAPI;
  }

  // ========== Chat ==========
  async sendChatMessage(data: Parameters<ApiTransport['sendChatMessage']>[0]): Promise<void> {
    return this.api.sendChatMessage(data);
  }
  stopGeneration(): void {
    this.api.stopGeneration();
  }
  onStreamChunk(callback: (chunk: StreamChunk) => void): () => void {
    return this.api.onStreamChunk(callback);
  }

  // ========== Agent ==========
  onAgentConfirmRequest(callback: (req: AgentConfirmRequest) => void): () => void {
    if (!this.api.onAgentConfirmRequest) return () => {};
    return this.api.onAgentConfirmRequest(callback);
  }
  respondAgentConfirm(id: string, allowed: boolean): void {
    this.api.respondAgentConfirm?.(id, allowed);
  }

  // ========== Workspace ==========
  // 主进程返回统一为 { success, error? } 信封，这里解开成前端友好的形状
  workspace: WorkspaceTransport = {
    open: async (): Promise<OpenedWorkspace | null> => {
      const res = await this.api.workspace?.open?.();
      return res?.success && res.workspace ? (res.workspace as OpenedWorkspace) : null;
    },
    close: async (workspacePath?: string): Promise<void> => {
      await this.api.workspace?.close?.(workspacePath);
    },
    getFileTree: async (workspacePath: string): Promise<FileNode[]> => {
      const res = await this.api.workspace?.getFileTree?.(workspacePath);
      return res?.success ? (res.fileTree || []) : [];
    },
    refresh: async (workspacePath: string): Promise<FileNode[]> => {
      const res = await this.api.workspace?.refresh?.(workspacePath);
      return res?.success ? (res.fileTree || []) : [];
    },
    expandDir: async (dirPath: string): Promise<FileNode[]> => {
      const res = await this.api.workspace?.expandDir?.(dirPath);
      return res?.success ? (res.children || []) : [];
    },
    onFileChange: (callback: (event: { type: string; path: string }) => void): (() => void) => {
      if (!this.api.workspace?.onFileChange) return () => {};
      return this.api.workspace.onFileChange(callback);
    },
  };

  // ========== Conversations ==========
  /** 当前登录用户 id（多账号数据隔离用）；游客返回空串 */
  private currentUserId(): string {
    try {
      const u = JSON.parse(localStorage.getItem('auth_user') || localStorage.getItem('desktop_user') || 'null');
      return u && u.id != null ? String(u.id) : '';
    } catch { return ''; }
  }

  async listConversations(): Promise<Conversation[]> {
    return this.api.listConversations(this.currentUserId());
  }
  async getConversation(id: string): Promise<Conversation | null> {
    return this.api.getConversation(id, this.currentUserId());
  }
  async createConversation(data: { title?: string; modelId: string; providerId: string }): Promise<Conversation> {
    return this.api.createConversation({ ...data, userId: this.currentUserId() });
  }
  async deleteConversation(id: string): Promise<void> {
    return this.api.deleteConversation(id, this.currentUserId());
  }
  async renameConversation(id: string, title: string): Promise<void> {
    return this.api.renameConversation(id, title, this.currentUserId());
  }

  // ========== Messages ==========
  async listMessages(conversationId: string): Promise<Message[]> {
    return this.api.listMessages(conversationId);
  }

  // ========== Settings ==========
  async getSetting(key: string): Promise<string | null> {
    return this.api.getSetting(key);
  }
  async setSetting(key: string, value: string): Promise<void> {
    return this.api.setSetting(key, value);
  }
  async getAllSettings(): Promise<Record<string, string>> {
    return this.api.getAllSettings();
  }

  // ========== Providers ==========
  async listProviders(): Promise<ProviderConfig[]> {
    return this.api.listProviders();
  }
  async saveProvider(config: ProviderSaveInput): Promise<void> {
    return this.api.saveProvider(config);
  }
  async deleteProvider(id: string): Promise<void> {
    return this.api.deleteProvider(id);
  }
  async testProvider(id: string): Promise<boolean> {
    return this.api.testProvider(id);
  }

  // ========== Files ==========
  async openFileDialog(options?: { filters?: FileFilter[] }): Promise<string[]> {
    return this.api.openFileDialog(options);
  }
  async readFile(filePath: string): Promise<FileData> {
    return this.api.readFile(filePath);
  }

  // ========== Window controls ==========
  minimizeWindow(): void { this.api.minimizeWindow(); }
  maximizeWindow(): void { this.api.maximizeWindow(); }
  closeWindow(): void { this.api.closeWindow(); }
  async isMaximized(): Promise<boolean> { return this.api.isMaximized(); }
  async getAppVersion(): Promise<string> { return this.api.getAppVersion(); }

  // ========== App events ==========
  onNewChat(callback: () => void): () => void {
    return this.api.onNewChat(callback);
  }
  onOpenSettings(callback: () => void): () => void {
    return this.api.onOpenSettings(callback);
  }

  // ========== Updates ==========
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void {
    return this.api.onUpdateAvailable(callback);
  }
  onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void {
    return this.api.onUpdateProgress(callback);
  }
  onUpdateError(callback: (error: { message: string }) => void): () => void {
    return this.api.onUpdateError(callback);
  }
  async checkUpdate(): Promise<void> { return this.api.checkUpdate(); }
  async installUpdate(downloadUrl: string): Promise<void> { return this.api.installUpdate(downloadUrl); }
  async getUpdateUrl(): Promise<string> { return this.api.getUpdateUrl(); }
  async setUpdateUrl(url: string): Promise<void> { return this.api.setUpdateUrl(url); }

  // ========== Announcements ==========
  onAnnouncement(callback: (ann: Announcement) => void): () => void {
    return this.api.onAnnouncement(callback);
  }
  async markAnnouncementRead(id: string): Promise<void> { return this.api.markAnnouncementRead(id); }
  async showAnnouncements(): Promise<void> { return this.api.showAnnouncements(); }

  // ========== Auth ==========
  async authLogin(data: { username: string; password: string }): Promise<AuthResult> {
    return this.api.authLogin(data);
  }
  async authRegister(data: { username: string; password: string; code: string }): Promise<AuthResult> {
    return this.api.authRegister(data);
  }
  async sendVerificationCode(email: string, purpose: MailPurpose = 'register'): Promise<AuthResult> {
    return this.api.sendVerificationCode(email, purpose);
  }
  async resetPassword(data: { email: string; code: string; newPassword: string }): Promise<AuthResult> {
    return this.api.resetPassword(data);
  }
  async getSmtpStatus(): Promise<SmtpStatus> {
    return this.api.getSmtpStatus?.(this.currentUserId()) ?? { configured: false };
  }
  async setSmtpConfig(cfg: { user?: string; pass?: string; host?: string; port?: number }): Promise<AuthResult> {
    return this.api.setSmtpConfig?.(cfg, this.currentUserId()) ?? { ok: false, error: '当前版本不支持配置 SMTP' };
  }
  async getRegistrationMode(): Promise<{ firstAccount: boolean }> {
    return this.api.getRegistrationMode?.() ?? { firstAccount: false };
  }
  // ========== Skills ==========
  async listSkills(): Promise<SkillItem[]> { return this.api.listSkills(); }
  async remoteSkillCatalog(): Promise<{ success: boolean; error?: string; skills: SkillItem[] }> {
    return this.api.remoteSkillCatalog();
  }
  async installSkill(data: { url?: string; skill?: SkillItem }): Promise<{ success: boolean; error?: string }> {
    return this.api.installSkill(data);
  }
  async deleteSkill(id: string): Promise<{ success: boolean; error?: string }> {
    return this.api.deleteSkill(id);
  }
  async exportSkill(id: string): Promise<string | null> { return this.api.exportSkill(id); }
  async importSkill(jsonStr: string): Promise<{ success: boolean; error?: string }> {
    return this.api.importSkill(jsonStr);
  }
}
