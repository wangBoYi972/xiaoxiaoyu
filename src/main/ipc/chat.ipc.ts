import { ipcMain, BrowserWindow } from 'electron';
import { getDatabase, saveDatabase } from '../store/database';
import { decryptApiKey } from '../store/crypto';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { ModelRouter } from '../../adapters/index';

const modelRouter = new ModelRouter();
const activeRequests = new Map<string, AbortController>();

// 简单的 token 估算（中文≈1.5字/1token，英文≈4字/1token）
function estimateTokens(text: string | any[]): number {
  if (Array.isArray(text)) {
    return text.reduce((sum, p) => sum + (typeof p === 'string' ? p.length : JSON.stringify(p).length) / 3, 0);
  }
  return Math.ceil(text.length / 3);
}

// 上下文裁剪：保留 system + 最近 N 条消息（最多 MAX_TOKENS）
function trimMessages(messages: any[], maxTokens: number = 80000): any[] {
  const systemMsgs = messages.filter((m: any) => m.role === 'system');
  const otherMsgs = messages.filter((m: any) => m.role !== 'system');

  let total = systemMsgs.reduce((s: number, m: any) => s + estimateTokens(m.content), 0);
  const kept: any[] = [];

  // 从最新往旧遍历
  for (let i = otherMsgs.length - 1; i >= 0; i--) {
    const tok = estimateTokens(otherMsgs[i].content);
    if (total + tok > maxTokens && kept.length >= 4) break; // 至少保留4条
    total += tok;
    kept.unshift(otherMsgs[i]);
  }

  logger.info(`上下文裁剪: ${messages.length} → ${systemMsgs.length + kept.length} 条, ~${Math.round(total)} tokens`);
  return [...systemMsgs, ...kept];
}

function execute(sql: string, params: any[] = [], skipSave = false): void {
  const db = getDatabase();
  db.run(sql, params);
  if (!skipSave) {
    saveDatabase();
  }
}

/** 批量执行 SQL，只在最后保存一次 */
function executeBatch(statements: Array<{ sql: string; params: any[] }>): void {
  const db = getDatabase();
  for (const stmt of statements) {
    db.run(stmt.sql, stmt.params);
  }
  saveDatabase();
}

function loadProviderConfig(providerId: string): { apiKey: string; baseUrl: string; extraHeaders?: Record<string, string> } | null {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT api_key_enc, base_url, extra_headers_json FROM provider_configs WHERE id = ? AND enabled = 1'
  );
  stmt.bind([providerId]);
  let result: { apiKey: string; baseUrl: string; extraHeaders?: Record<string, string> } | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    const apiKeyEnc = row.api_key_enc as string | null;
    const apiKey = apiKeyEnc ? decryptApiKey(apiKeyEnc) : '';
    const baseUrl = (row.base_url as string) || '';
    let extraHeaders: Record<string, string> | undefined;
    if (row.extra_headers_json) {
      try { extraHeaders = JSON.parse(row.extra_headers_json as string); } catch {}
    }
    result = { apiKey, baseUrl, extraHeaders };
  }
  stmt.free();

  if (providerId === 'ollama' && !result) {
    return { apiKey: '', baseUrl: 'http://127.0.0.1:11434' };
  }

  return result;
}

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (event, data) => {
    const {
      providerId,
      modelId,
      messages,
      systemPrompt,
      temperature,
      maxTokens,
      conversationId,
    } = data;

    const abortController = new AbortController();
    const requestId = uuidv4();
    activeRequests.set(requestId, abortController);

    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;

      // 🔑 从数据库加载真实的 API Key
      const providerConfig = loadProviderConfig(providerId);

      if (!providerConfig) {
        win.webContents.send('chat:stream-chunk', {
          type: 'error',
          error: {
            message: `提供商 "${providerId}" 未配置或未启用。请在设置中配置 API Key。`,
            code: 'NO_API_KEY',
          },
        });
        return;
      }

      if (!providerConfig.apiKey && providerId !== 'ollama') {
        win.webContents.send('chat:stream-chunk', {
          type: 'error',
          error: {
            message: `提供商 "${providerId}" 的 API Key 未配置。请在设置中填入 API Key。`,
            code: 'NO_API_KEY',
          },
        });
        return;
      }

      // 上下文裁剪
      const trimmedMessages = trimMessages(messages);
      logger.info(`发送聊天: provider=${providerId}, model=${modelId}, msgs=${trimmedMessages.length}, hasKey=${!!providerConfig.apiKey}`);

      // 调用模型适配器（传入真实凭据）
      const stream = modelRouter.chat({
        providerId,
        modelId,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        extraHeaders: providerConfig.extraHeaders,
        messages: trimmedMessages,
        systemPrompt,
        temperature,
        maxTokens,
        signal: abortController.signal,
      });

      let fullContent = '';
      let thinkingContent = '';

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        if (chunk.textDelta) fullContent += chunk.textDelta;
        if (chunk.thinkingDelta) thinkingContent += chunk.thinkingDelta;

        win.webContents.send('chat:stream-chunk', chunk);

        if (chunk.type === 'done' || chunk.type === 'error') break;
      }

      // 流结束后保存消息（使用批量写入，避免多次 saveDatabase）
      if (fullContent || thinkingContent) {
        let convId = conversationId;
        const now = Math.floor(Date.now() / 1000);
        const batch: Array<{ sql: string; params: any[] }> = [];

        if (!convId) {
          // 新对话：创建对话 + 保存所有消息
          const title = (trimmedMessages[trimmedMessages.length - 1]?.content?.slice(0, 50) || '新对话') as string;
          convId = uuidv4();
          batch.push({
            sql: 'INSERT INTO conversations (id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            params: [convId, title, modelId, providerId, now, now],
          });

          for (const msg of messages) {
            const msgId = uuidv4();
            batch.push({
              sql: 'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
              params: [msgId, convId, msg.role, typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content), now],
            });
          }
        } else {
          // 已有对话：只保存本次新增的用户消息（messages 的最后一条用户消息）
          const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
          if (lastUserMsg) {
            const msgId = uuidv4();
            batch.push({
              sql: 'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
              params: [msgId, convId, 'user', typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content), now],
            });
          }
        }

        // 保存助手回复
        const assistantId = uuidv4();
        const content = thinkingContent
          ? `[思考过程]\n${thinkingContent}\n\n${fullContent}`
          : fullContent;
        batch.push({
          sql: 'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
          params: [assistantId, convId!, 'assistant', content, now],
        });

        // 更新对话元信息
        const addedCount = batch.filter((s) => s.sql.includes('INSERT INTO messages')).length;
        batch.push({
          sql: 'UPDATE conversations SET updated_at = ?, message_count = message_count + ? WHERE id = ?',
          params: [now, addedCount, convId!],
        });

        // 一次性批量执行 + 单次保存
        executeBatch(batch);
      }
    } catch (error) {
      logger.error('聊天请求失败', error as Error);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.webContents.send('chat:stream-chunk', {
          type: 'error',
          error: { message: (error as Error).message || '请求失败', code: 'CHAT_ERROR' },
        });
      }
    } finally {
      activeRequests.delete(requestId);
    }
  });

  ipcMain.on('chat:stop', () => {
    for (const [, controller] of activeRequests) {
      controller.abort();
    }
    activeRequests.clear();
  });
}
