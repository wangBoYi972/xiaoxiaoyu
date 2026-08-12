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
        'SELECT id, name, api_key_enc, base_url FROM provider_configs WHERE id = ? AND enabled = 1',
        [id]
      );
      if (!row) return false;

      const apiKey = row.api_key_enc ? decryptApiKey(row.api_key_enc) : '';
      const baseUrl = row.base_url || '';
      if (!apiKey && id !== 'ollama') return false;

      const router = new ModelRouter();
      return await router.testProvider({
        id: row.id,
        name: row.name,
        apiKey,
        baseUrl,
        enabled: true,
        models: [],
      });
    } catch (error) {
      logger.error('测试提供商连接失败', error as Error);
      return false;
    }
  });
}
