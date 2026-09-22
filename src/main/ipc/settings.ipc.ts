import { ipcMain } from 'electron';
import { getDatabase, saveDatabase } from '../store/database';
import { encryptApiKey, decryptApiKey } from '../store/crypto';
import { logger } from '../utils/logger';
import { ModelRouter } from '../../adapters/index';

// sql.js 辅助函数
function queryOne(sql: string, params: any[] = []): any | null {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result: any = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function queryAll(sql: string, params: any[] = []): any[] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function execute(sql: string, params: any[] = []): void {
  const db = getDatabase();
  db.run(sql, params);
  // 设置类操作只需持久化，不需要每次都存（读写比例低，延迟无所谓）
  saveDatabase();
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (_event, key: string) => {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value || null;
  });

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  });

  ipcMain.handle('settings:get-all', () => {
    const rows = queryAll('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  });

  // 提供商配置
  ipcMain.handle('provider:list', () => {
    const rows = queryAll(
      'SELECT id, name, api_key_enc, base_url, enabled, models_json, extra_headers_json FROM provider_configs ORDER BY sort_order ASC'
    );
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      hasApiKey: !!row.api_key_enc,
      baseUrl: row.base_url || '',
      enabled: !!row.enabled,
      models: row.models_json ? JSON.parse(row.models_json) : [],
      hasSecretKey: row.extra_headers_json ? !!(JSON.parse(row.extra_headers_json)).client_secret : false,
    }));
  });

  ipcMain.handle('provider:save', (_event, config: {
    id: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
    enabled: boolean;
    models: string[];
    extraHeaders?: Record<string, string>;
  }) => {
    let apiKeyEnc: string | null = null;
    if (config.apiKey) {
      apiKeyEnc = encryptApiKey(config.apiKey);
    } else {
      const existing = queryOne('SELECT api_key_enc FROM provider_configs WHERE id = ?', [config.id]);
      apiKeyEnc = existing?.api_key_enc || null;
    }
    const extraHeadersJson = config.extraHeaders ? JSON.stringify(config.extraHeaders) : null;
    execute(
      'INSERT OR REPLACE INTO provider_configs (id, name, api_key_enc, base_url, enabled, models_json, extra_headers_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [config.id, config.name, apiKeyEnc, config.baseUrl || null, config.enabled ? 1 : 0, JSON.stringify(config.models), extraHeadersJson]
    );
  });

  ipcMain.handle('provider:delete', (_event, id: string) => {
    execute('DELETE FROM provider_configs WHERE id = ?', [id]);
  });

  ipcMain.handle('provider:test', async (_event, id: string) => {
    try {
      const row = queryOne(
        'SELECT id, name, api_key_enc, base_url, models_json FROM provider_configs WHERE id = ? AND enabled = 1',
        [id]
      );
      if (!row) return false;

      const apiKey = row.api_key_enc ? decryptApiKey(row.api_key_enc) : '';
      const baseUrl = row.base_url || '';
      if (!apiKey && id !== 'ollama') return false;

      // 带上用户配置的模型 ID：测试连接要用真实存在的模型去试，
      // 否则适配器会回退到 deepseek-chat，中转站上没这个模型就误判"连接失败"
      let models: string[] = [];
      if (row.models_json) {
        try { models = JSON.parse(row.models_json) || []; } catch { models = []; }
      }

      const router = new ModelRouter();
      return await router.testProvider({
        id: row.id,
        name: row.name,
        apiKey,
        baseUrl,
        enabled: true,
        models,
      });
    } catch (error) {
      logger.error('测试提供商连接失败', error as Error);
      return false;
    }
  });

  /**
   * 使用设置弹窗中尚未保存的 Key 拉取模型列表。
   * Key 为空时沿用已加密保存的 Key，避免用户为了刷新模型重复粘贴密钥。
   */
  ipcMain.handle('provider:list-models', async (_event, draft: {
    id?: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    extraHeaders?: Record<string, string>;
  }) => {
    const id = typeof draft?.id === 'string' ? draft.id.trim() : '';
    if (!id) return { success: false, error: '缺少提供商标识' };
    try {
      const existing = queryOne(
        'SELECT api_key_enc, base_url, extra_headers_json FROM provider_configs WHERE id = ?',
        [id]
      );
      const apiKey = draft.apiKey?.trim() || (existing?.api_key_enc ? decryptApiKey(existing.api_key_enc) : '');
      let savedHeaders: Record<string, string> = {};
      try { savedHeaders = existing?.extra_headers_json ? JSON.parse(existing.extra_headers_json) : {}; } catch { /* 忽略损坏的旧配置 */ }
      const config = {
        id,
        name: draft.name?.trim() || id,
        apiKey,
        baseUrl: draft.baseUrl?.trim() || existing?.base_url || '',
        enabled: true,
        models: [],
        extraHeaders: { ...savedHeaders, ...(draft.extraHeaders || {}) },
      };
      const models = await new ModelRouter().listModels(config);
      if (!models.length) return { success: false, error: '未获取到模型，请检查 API 地址、Key 和模型列表权限' };
      return { success: true, models };
    } catch (error: any) {
      logger.error('获取提供商模型失败', error);
      return { success: false, error: error?.message || '获取模型失败' };
    }
  });
}
