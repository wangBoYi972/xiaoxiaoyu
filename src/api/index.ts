// API 传输层入口 — 自动检测运行环境并导出对应实现
//
// 使用方式：
//   import api from '../api';
//   await api.sendChatMessage({ ... });
//
// 检测逻辑：
//   - 如果 window.electronAPI 存在 → IpcTransport（Electron 桌面）
//   - 否则 → HttpTransport（浏览器/Web）

import type { ApiTransport } from './transport';
import { IpcTransport } from './ipc-transport';
import { HttpTransport } from './http-transport';

let api: ApiTransport;

if (typeof window !== 'undefined' && (window as any).electronAPI) {
  // Electron 桌面环境
  api = new IpcTransport();
  console.log('[api] 使用 IPC 传输（Electron）');
} else {
  // 浏览器/服务器 Web 环境
  const httpTransport = new HttpTransport('/api');
  api = httpTransport;
  console.log('[api] 使用 HTTP 传输（Web）');
}

export default api;
export type { ApiTransport, StreamChunk, Conversation, Message, ProviderConfig, ProviderSaveInput, FileData, FileFilter, SkillItem, UpdateInfo, UpdateProgress, Announcement } from './transport';
