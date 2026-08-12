// 提供商管理路由 — 每个用户独立配置 API Key
import { Router, Request, Response } from 'express';
import { authMiddleware, getUserId } from '../middleware/auth';
import { queryAll, queryOne, execute } from '../store/database';
import { encryptApiKey, decryptApiKey } from '../store/crypto';
import { ModelRouter } from '../../adapters/index';
import { logger } from '../utils/logger';

// 预设提供商（所有用户可见）
const BUILTIN: Array<{ id: string; name: string; baseUrl: string }> = [
  { id: 'ollama', name: 'Ollama 本地 🆓', baseUrl: 'http://127.0.0.1:11434' },
  { id: 'glm', name: '智谱 GLM 🆓', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'anthropic', name: 'Claude', baseUrl: '' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'moonshot', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'gemini', name: 'Gemini 🆓', baseUrl: '' },
  { id: 'ernie', name: '文心一言 🆓', baseUrl: '' },
];

export function providerRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  // GET /api/providers — 预设列表 + 用户自己的配置
  router.get('/', (req: Request, res: Response) => {
    const uid = getUserId(req);
    const saved = queryAll(
      'SELECT id, name, api_key_enc, base_url, enabled, models_json, extra_headers_json FROM provider_configs WHERE user_id = ?',
      [uid]
    );

    const providers = BUILTIN.map(preset => {
      const s = saved.find((r: any) => r.id === preset.id);
      if (s) return {
        id: s.id, name: preset.name, hasApiKey: !!s.api_key_enc,
        baseUrl: s.base_url || preset.baseUrl, enabled: !!s.enabled,
        models: s.models_json ? JSON.parse(s.models_json) : [],
        hasSecretKey: s.extra_headers_json ? !!(JSON.parse(s.extra_headers_json)).client_secret : false,
      };
      return {
        id: preset.id, name: preset.name, hasApiKey: false,
        baseUrl: preset.baseUrl, enabled: false, models: [], hasSecretKey: false,
      };
    });
    res.json(providers);
  });

  // PUT /api/providers/:id — 保存（带 user_id）
  router.put('/:id', (req: Request, res: Response) => {
    const uid = getUserId(req);
    const config = req.body;
    if (!config.id || !config.name) {
      res.status(400).json({ error: '缺少 id 或 name' }); return;
    }

    let apiKeyEnc: string | null = null;
    if (config.apiKey) {
      apiKeyEnc = encryptApiKey(config.apiKey);
    } else {
      const existing = queryOne('SELECT api_key_enc FROM provider_configs WHERE id = ? AND user_id = ?', [config.id, uid]);
      apiKeyEnc = existing?.api_key_enc || null;
    }

    // 保存 extraHeaders（如文心 secretKey）到 extra_headers_json
    const extraHeaders = config.extraHeaders || config.secretKey ? JSON.stringify(config.extraHeaders || { client_secret: config.secretKey || '' }) : null;

    execute(
      'INSERT OR REPLACE INTO provider_configs (id, user_id, name, api_key_enc, base_url, enabled, models_json, extra_headers_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [config.id, uid, config.name, apiKeyEnc, config.baseUrl || null, config.enabled ? 1 : 0, JSON.stringify(config.models || []), extraHeaders]
    );
    res.json({ ok: true });
  });

  // DELETE /api/providers/:id — 删除（验证归属）
  router.delete('/:id', (req: Request, res: Response) => {
    const uid = getUserId(req);
    execute('DELETE FROM provider_configs WHERE id = ? AND user_id = ?', [req.params.id, uid]);
    res.json({ ok: true });
  });

  // POST /api/providers/:id/test — 测试连接（使用用户自己的配置）
  router.post('/:id/test', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const row = queryOne(
        'SELECT id, name, api_key_enc, base_url, extra_headers_json FROM provider_configs WHERE id = ? AND user_id = ? AND enabled = 1',
        [req.params.id, uid]
      );
      if (!row) { res.json({ ok: false, error: '请先在设置中启用并配置此模型' }); return; }

      const apiKey = row.api_key_enc ? decryptApiKey(row.api_key_enc) : '';
      const baseUrl = row.base_url || '';
      if (!apiKey && req.params.id !== 'ollama') { res.json({ ok: false, error: 'API Key 未配置' }); return; }

      const router2 = new ModelRouter();
      const ok = await router2.testProvider({ id: row.id, name: row.name, apiKey, baseUrl, enabled: true, models: [], extraHeaders: row.extra_headers_json ? JSON.parse(row.extra_headers_json as string) : undefined });
      if (ok) {
        res.json({ ok: true });
      } else {
        res.json({ ok: false, error: `无法连接到 ${row.name} API。请检查：1) API Key 是否正确 2) 网络是否可达 3) API 地址是否正确（当前: ${baseUrl || '默认'})` });
      }
    } catch (error: any) {
      res.json({ ok: false, error: error.message });
    }
  });

  return router;
}
