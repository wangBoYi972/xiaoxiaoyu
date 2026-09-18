import { ipcMain } from 'electron';
import { registerChatHandlers } from './chat.ipc';
import { registerConversationHandlers } from './conversation.ipc';
import { registerSettingsHandlers } from './settings.ipc';
import { registerFileHandlers } from './file.ipc';
import { registerWindowHandlers } from './window.ipc';
import { registerMcpHandlers } from './mcp.ipc';
import { registerSkillsHandlers } from './skills.ipc';
import { registerAuthHandlers } from './auth.ipc';
import { registerOllamaHandlers } from './ollama.ipc';
import { registerWorkspaceHandlers } from './workspace.ipc';
import { registerRunnerHandlers } from './runner.ipc';
import { registerRagHandlers } from './rag.ipc';
import './finetune.ipc';

export function registerIpcHandlers(): void {
  registerAuthHandlers();
  registerChatHandlers();
  registerConversationHandlers();
  registerSettingsHandlers();
  registerFileHandlers();
  registerWindowHandlers();
  registerMcpHandlers();
  registerSkillsHandlers();
  registerOllamaHandlers();
  registerWorkspaceHandlers();
  registerRunnerHandlers();
  registerRagHandlers();
}
