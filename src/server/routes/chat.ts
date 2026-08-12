// 聊天路由 — SSE 流式响应
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ModelRouter } from '../../adapters/index';
import { authMiddleware, getUserId } from '../middleware/auth';
import { queryOne, executeBatch } from '../store/database';
import { decryptApiKey } from '../store/crypto';
import { logger } from '../utils/logger';

const modelRouter = new ModelRouter();
const activeRequests = new Map<string, AbortController>();

function loadProviderConfig(providerId: string, userId: number): { apiKey: string; baseUrl: string } | null {
  const row = queryOne(
    'SELECT api_key_enc, base_url FROM provider_configs WHERE id = ? AND user_id = ? AND enabled = 1',
    [providerId, userId]
  );
  if (row) {
    return { apiKey: row.api_key_enc ? decryptApiKey(row.api_key_enc) : '', baseUrl: (row.base_url as string) || '' };
  }
  if (providerId === 'ollama') {
    return { apiKey: '', baseUrl: 'http://127.0.0.1:11434' };
  }
  return null;
}

export function chatRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.post('/send', async (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const end = () => { res.end(); };
    // 注意：不能用 req.on('close') 来关闭响应，因为 body-parser 消费完 body 后 'close' 就会触发

    try {
      const userId = getUserId(req);
      const { providerId, modelId, messages, systemPrompt, temperature, maxTokens, conversationId } = req.body || {};

      if (!providerId || !modelId) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: { message: '缺少 providerId 或 modelId' } })}\n\n`);
        return end();
      }

      const cfg = loadProviderConfig(providerId, userId!);
      if (!cfg) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: { message: `提供商 ${providerId} 未配置` } })}\n\n`);
        return end();
      }

      const stream = modelRouter.chat({
        providerId, modelId,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        messages: messages || [{ role: 'user', content: 'hi' }],
        systemPrompt, temperature, maxTokens,
      });

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }

      // Save to DB (simplified)
      if (conversationId && messages?.length) {
        const now = Math.floor(Date.now() / 1000);
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.content) {
          executeBatch([{
            sql: 'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
            params: [uuidv4(), conversationId, 'user', typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content), now],
          }]);
        }
      }
    } catch (e: any) {
      try { res.write(`data: ${JSON.stringify({ type: 'error', error: { message: e.message || '内部错误' } })}\n\n`); } catch {}
    }
    end();
  });

  router.post('/stop', (req: Request, res: Response) => {
    const uid = getUserId(req);
    for (const [key, c] of activeRequests) {
      if (key.startsWith(`${uid}:`)) { c.abort(); activeRequests.delete(key); }
    }
    res.json({ ok: true });
  });

  return router;
}
