// API 传输层入口 — 仅支持 Electron 桌面端 IPC。
//
// 使用方式：
//   import api from '../api';
//   await api.sendChatMessage({ ... });
//
// 不提供浏览器/Web 运行路径。

import type { ApiTransport } from './transport';
import { IpcTransport } from './ipc-transport';

if (typeof window === 'undefined' || !(window as any).electronAPI) {
  throw new Error('小小榆仅支持通过桌面应用运行');
}

const api: ApiTransport = new IpcTransport();

export default api;
export type { ApiTransport, StreamChunk, Conversation, Message, ProviderConfig, ProviderSaveInput, FileData, FileFilter, SkillItem, UpdateInfo, UpdateProgress, Announcement } from './transport';
