// HTTP 传输实现 — fetch + SSE（Web/服务器 环境）
// 用于替代 Electron IPC，通过 HTTP REST API 与后端通信

import type {
  ApiTransport, StreamChunk, Conversation, Message,
  ProviderConfig, ProviderSaveInput, FileData, FileFilter,
  SkillItem, UpdateInfo, UpdateProgress, Announcement,
  AgentConfirmRequest, AuthResult, MailPurpose, SmtpStatus, WorkspaceTransport,
  OpenedWorkspace,
} from './transport';
import type { FileNode } from '../renderer/stores/workspace-store';

export class HttpTransport implements ApiTransport {
  private baseUrl: string;
  private authToken: string | null = null;
  private streamCallbacks: Set<(chunk: StreamChunk) => void> = new Set();
  private eventCleanups: Map<string, Array<() => void>> = new Map();

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    // 每次请求都从 localStorage 读取，因为模块级单例在登录前就已创建，
    // 此时 token 尚未存入；另外登录时是由 LoginPage 直接写 localStorage
    // 而不经过 HttpTransport.setToken()
    return this.authToken || localStorage.getItem('auth_token');
  }

  setToken(token: string | null): void {
    this.authToken = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.getHeaders(), ...(options.headers as Record<string, string> || {}) },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '请求失败');
      throw new Error(`[${res.status}] ${err}`);
    }
    return res.json();
  }

  // ========== Agent（Web 端暂无主进程确认桥） ==========
  onAgentConfirmRequest(_callback: (req: AgentConfirmRequest) => void): () => void {
    return () => {};
  }
  respondAgentConfirm(_id: string, _allowed: boolean): void {
    /* Web 端由服务端自行处理命令确认 */
  }

  // ========== Workspace（Web 端无本地文件系统） ==========
  workspace: WorkspaceTransport = {
    open: async (): Promise<OpenedWorkspace | null> => {
      console.warn('[http-transport] Web 端不支持打开本地工作区');
      return null;
    },
    close: async (): Promise<void> => {},
    getFileTree: async (): Promise<FileNode[]> => [],
    refresh: async (): Promise<FileNode[]> => [],
    expandDir: async (): Promise<FileNode[]> => [],
    onFileChange: (): (() => void) => () => {},
  };

  // ========== Auth (extra, not in IPC) ==========
  async login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const res = await this.authLogin({ username, password });
    return { ok: res.ok, error: res.error };
  }

  async register(username: string, password: string, code = ''): Promise<{ ok: boolean; error?: string }> {
    const res = await this.authRegister({ username, password, code });
    return { ok: res.ok, error: res.error };
  }

  getCurrentUser(): Promise<{ id: number; username: string; role: string } | null> {
    return this.fetch<{ id: number; username: string; role: string } | null>('/auth/me').catch(() => null);
  }

  /** 统一 POST：不抛异常，统一返回 { ok, error? } 结构，便于登录页直接展示 */
  private async postAuth(path: string, body: unknown): Promise<AuthResult> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.token) this.setToken(data.token);
      const ok = res.ok && data?.ok !== false;
      return { ...data, ok, error: ok ? undefined : (data?.error || `请求失败(${res.status})`) };
    } catch (e: any) {
      return { ok: false, error: e?.message || '连接服务器失败' };
    }
  }

  async authLogin(data: { username: string; password: string }): Promise<AuthResult> {
    return this.postAuth('/auth/login', data);
  }

  async authRegister(data: { username: string; password: string; code: string }): Promise<AuthResult> {
    return this.postAuth('/auth/register', data);
  }

  async sendVerificationCode(email: string, purpose: MailPurpose = 'register'): Promise<AuthResult> {
    return this.postAuth('/auth/send-code', { email, purpose });
  }

  async resetPassword(data: { email: string; code: string; newPassword: string }): Promise<AuthResult> {
    return this.postAuth('/auth/reset-password', data);
  }

  async getSmtpStatus(): Promise<SmtpStatus> {
    try {
      return await this.fetch<SmtpStatus>('/auth/smtp-status');
    } catch {
      return { configured: false };
    }
  }

  async getRegistrationMode(): Promise<{ firstAccount: boolean }> {
    try {
      return await this.fetch<{ firstAccount: boolean }>('/auth/registration-mode');
    } catch {
      return { firstAccount: false };
    }
  }

  async invoke<T = unknown>(): Promise<T> {
    // Web 版没有微调等桌面专属通道
    throw new Error('Web 版暂不支持该功能，请使用桌面版');
  }

  async setSmtpConfig(cfg: { user?: string; pass?: string; host?: string; port?: number }): Promise<AuthResult> {
    try {
      const entries: Array<[string, string | undefined]> = [
        ['smtp_user', cfg.user],
        ['smtp_pass', cfg.pass],
        ['smtp_host', cfg.host],
        ['smtp_port', cfg.port !== undefined ? String(cfg.port) : undefined],
      ];
      for (const [key, value] of entries) {
        if (value === undefined || value === '') continue;
        await this.fetch<void>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
      }
      return { ok: true, message: 'SMTP 配置已保存' };
    } catch (e: any) {
      return { ok: false, error: e?.message || '保存失败' };
    }
  }

  logout(): void {
    this.setToken(null);
    localStorage.removeItem('auth_user');
  }

  // ========== Chat ==========
  async sendChatMessage(data: Parameters<ApiTransport['sendChatMessage']>[0]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/send`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '未知错误');
      this.emitStreamChunk({ type: 'error', error: { message: `[${response.status}] ${err}` } });
      return;
    }

    // 读取 SSE 流
    const reader = response.body?.getReader();
    if (!reader) {
      this.emitStreamChunk({ type: 'error', error: { message: '无法读取响应流' } });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const chunk = JSON.parse(data) as StreamChunk;
              this.emitStreamChunk(chunk);
              if (chunk.type === 'done' || chunk.type === 'error') return;
            } catch { /* skip parse errors */ }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        this.emitStreamChunk({ type: 'error', error: { message: e.message } });
      }
    }
  }

  private abortController: AbortController | null = null;

  stopGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // 同时通知服务器
    fetch(`${this.baseUrl}/chat/stop`, {
      method: 'POST',
      headers: this.getHeaders(),
    }).catch(() => {});
  }

  private emitStreamChunk(chunk: StreamChunk): void {
    for (const cb of this.streamCallbacks) {
      try { cb(chunk); } catch {}
    }
  }

  onStreamChunk(callback: (chunk: StreamChunk) => void): () => void {
    this.streamCallbacks.add(callback);
    return () => { this.streamCallbacks.delete(callback); };
  }

  // ========== Conversations ==========
  async listConversations(): Promise<Conversation[]> {
    return this.fetch<Conversation[]>('/conversations');
  }
  async getConversation(id: string): Promise<Conversation | null> {
    return this.fetch<Conversation | null>(`/conversations/${encodeURIComponent(id)}`);
  }
  async createConversation(data: { title?: string; modelId: string; providerId: string }): Promise<Conversation> {
    return this.fetch<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(data) });
  }
  async deleteConversation(id: string): Promise<void> {
    await this.fetch<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async renameConversation(id: string, title: string): Promise<void> {
    await this.fetch<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ title }) });
  }

  // ========== Messages ==========
  async listMessages(conversationId: string): Promise<Message[]> {
    return this.fetch<Message[]>(`/conversations/${encodeURIComponent(conversationId)}/messages`);
  }

  // ========== Settings ==========
  async getSetting(key: string): Promise<string | null> {
    return this.fetch<{ value: string | null }>(`/settings/${encodeURIComponent(key)}`).then(r => r.value);
  }
  async setSetting(key: string, value: string): Promise<void> {
    await this.fetch<void>(`/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) });
  }
  async getAllSettings(): Promise<Record<string, string>> {
    return this.fetch<Record<string, string>>('/settings');
  }

  // ========== Providers ==========
  async listProviders(): Promise<ProviderConfig[]> {
    return this.fetch<ProviderConfig[]>('/providers');
  }
  async saveProvider(config: ProviderSaveInput): Promise<void> {
    await this.fetch<void>(`/providers/${encodeURIComponent(config.id)}`, { method: 'PUT', body: JSON.stringify(config) });
  }
  async deleteProvider(id: string): Promise<void> {
    await this.fetch<void>(`/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async testProvider(id: string): Promise<boolean> {
    return this.fetch<{ ok: boolean }>(`/providers/${encodeURIComponent(id)}/test`, { method: 'POST' }).then(r => r.ok);
  }

  // ========== Files ==========
  async openFileDialog(options?: { filters?: FileFilter[] }): Promise<string[]> {
    // Web: 使用 HTML5 File API
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (options?.filters?.[0]?.extensions) {
        input.accept = options.filters[0].extensions.map(e => `.${e}`).join(',');
      }
      input.onchange = () => {
        const files = Array.from(input.files || []);
        // Web 模式把文件存到全局临时变量，readFile 会用到
        (window as any).__pendingFiles = files;
        resolve(files.map(f => f.name));
      };
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  async readFile(filePath: string): Promise<FileData> {
    // Web: 从之前 openFileDialog 选中的文件读取
    const files: File[] = (window as any).__pendingFiles || [];
    const file = files.find((f: File) => f.name === filePath);
    if (!file) throw new Error(`文件 "${filePath}" 未找到`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ data: base64, mimeType: file.type || 'image/png', name: file.name });
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  // ========== Window controls (no-op in web) ==========
  minimizeWindow(): void {}
  maximizeWindow(): void {}
  closeWindow(): void {}
  async isMaximized(): Promise<boolean> { return false; }
  async getAppVersion(): Promise<string> { return 'web'; }

  // ========== App events (no-op in web) ==========
  onNewChat(_callback: () => void): () => void { return () => {}; }
  onOpenSettings(_callback: () => void): () => void { return () => {}; }

  // ========== Updates (no-op in web) ==========
  onUpdateAvailable(_callback: (info: UpdateInfo) => void): () => void { return () => {}; }
  onUpdateProgress(_callback: (progress: UpdateProgress) => void): () => void { return () => {}; }
  onUpdateError(_callback: (error: { message: string }) => void): () => void { return () => {}; }
  async checkUpdate(): Promise<void> {}
  async installUpdate(_downloadUrl: string): Promise<void> {}
  async getUpdateUrl(): Promise<string> { return ''; }
  async setUpdateUrl(_url: string): Promise<void> {}

  // ========== Announcements (web: server-based) ==========
  onAnnouncement(callback: (ann: Announcement) => void): () => void {
    // Web 模式：不从服务器推，而是轮询
    return () => {};
  }
  async markAnnouncementRead(id: string): Promise<void> {
    await this.fetch<void>(`/announcements/${encodeURIComponent(id)}/read`, { method: 'POST' });
  }
  async showAnnouncements(): Promise<void> {
    await this.fetch<void>('/announcements');
  }

  // ========== Skills ==========
  async listSkills(): Promise<SkillItem[]> {
    return this.fetch<SkillItem[]>('/skills');
  }
  async remoteSkillCatalog(): Promise<{ success: boolean; error?: string; skills: SkillItem[] }> {
    return this.fetch<{ success: boolean; error?: string; skills: SkillItem[] }>('/skills/remote-catalog');
  }
  async installSkill(data: { url?: string; skill?: SkillItem }): Promise<{ success: boolean; error?: string }> {
    return this.fetch<{ success: boolean; error?: string }>('/skills', { method: 'POST', body: JSON.stringify(data) });
  }
  async deleteSkill(id: string): Promise<{ success: boolean; error?: string }> {
    return this.fetch<{ success: boolean; error?: string }>(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async exportSkill(id: string): Promise<string | null> {
    const res = await this.fetch<{ json: string | null }>(`/skills/${encodeURIComponent(id)}/export`);
    return res.json;
  }
  async importSkill(jsonStr: string): Promise<{ success: boolean; error?: string }> {
    return this.fetch<{ success: boolean; error?: string }>('/skills/import', { method: 'POST', body: JSON.stringify({ json: jsonStr }) });
  }
}
