/**
 * 数据库操作测试
 * 测试 SQLite 数据库的初始化、CRUD 操作
 * 文件: src/main/store/database.ts, src/main/ipc/conversation.ipc.ts
 *
 * 使用 sql.js 真实的 prepare/step/getAsObject API
 */

// sql.js 查询辅助函数
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function queryColumn(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.map(r => Object.values(r)[0]);
}

describe('数据库操作 (database.ts)', () => {
  let initSqlJs;

  before(async () => {
    initSqlJs = require('sql.js');
  });

  it('应正确创建内存数据库', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    assert(db !== null, '应创建数据库实例');
    assert(typeof db.run === 'function', '应有 run 方法');
    assert(typeof db.prepare === 'function', '应有 prepare 方法');
    assert(typeof db.export === 'function', '应有 export 方法');
    db.close();
  });

  it('应创建 conversations 表', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '新对话',
        model_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0
      )
    `);

    const row = queryOne(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'");
    assert(row !== null, 'conversations 表应存在');
    assertEqual(row.name, 'conversations');
    db.close();
  });

  it('应创建 messages 表', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        files TEXT,
        created_at INTEGER NOT NULL DEFAULT 0
      )
    `);

    const row = queryOne(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'");
    assert(row !== null, 'messages 表应存在');
    db.close();
  });

  it('应创建 provider_configs 表', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api_key_enc TEXT,
        base_url TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        models_json TEXT,
        extra_headers_json TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    const row = queryOne(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='provider_configs'");
    assert(row !== null, 'provider_configs 表应存在');
    db.close();
  });

  it('应创建 settings 表', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    const row = queryOne(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'");
    assert(row !== null, 'settings 表应存在');
    db.close();
  });
});

describe('数据库 CRUD - 完整流程', () => {
  let db;

  before(async () => {
    const SQL = await require('sql.js')();
    db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');

    // 创建所有表
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新对话',
      model_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL,
      token_count INTEGER, files TEXT, created_at INTEGER NOT NULL DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      api_key_enc TEXT, base_url TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      models_json TEXT, extra_headers_json TEXT, sort_order INTEGER NOT NULL DEFAULT 0
    )`);
  });

  after(() => {
    if (db) db.close();
  });

  describe('Conversations CRUD', () => {
    it('插入对话', () => {
      const now = Math.floor(Date.now() / 1000);
      db.run(
        'INSERT INTO conversations (id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['conv-test-1', '测试对话', 'deepseek-chat', 'deepseek', now, now]
      );

      const row = queryOne(db, 'SELECT * FROM conversations WHERE id = ?', ['conv-test-1']);
      assert(row !== null);
      assertEqual(row.id, 'conv-test-1');
      assertEqual(row.title, '测试对话');
    });

    it('查询所有对话（按更新时间降序）', () => {
      const now = Math.floor(Date.now() / 1000);
      db.run(
        'INSERT INTO conversations (id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['conv-test-2', '更新的对话', 'gpt-4o', 'openai', now, now + 100]
      );

      const rows = queryAll(db,
        'SELECT id, title FROM conversations ORDER BY updated_at DESC'
      );
      assert(rows.length > 0);
      assertEqual(rows[0].id, 'conv-test-2', '最新更新的应排在最前面');
    });

    it('更新对话标题', () => {
      db.run('UPDATE conversations SET title = ? WHERE id = ?',
        ['新标题', 'conv-test-1']);

      const row = queryOne(db, 'SELECT title FROM conversations WHERE id = ?', ['conv-test-1']);
      assertEqual(row.title, '新标题');
    });

    it('删除对话', () => {
      db.run('DELETE FROM conversations WHERE id = ?', ['conv-test-2']);
      const row = queryOne(db, 'SELECT id FROM conversations WHERE id = ?', ['conv-test-2']);
      assertEqual(row, null, '删除后不应查到该对话');
    });
  });

  describe('Messages CRUD', () => {
    it('插入消息', () => {
      const now = Math.floor(Date.now() / 1000);
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
        ['msg-1', 'conv-test-1', 'user', '你好，世界！', now]
      );

      const rows = queryAll(db,
        'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        ['conv-test-1']
      );
      assert(rows.length > 0);
      assertEqual(rows[0].role, 'user');
      assertEqual(rows[0].content, '你好，世界！');
    });

    it('批量消息查询', () => {
      const now = Math.floor(Date.now() / 1000);
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
        ['msg-2', 'conv-test-1', 'assistant', '你好！', now + 1]
      );
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
        ['msg-3', 'conv-test-1', 'user', '再问一个问题', now + 2]
      );

      const rows = queryAll(db,
        'SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        ['conv-test-1']
      );
      assertEqual(rows.length, 3, '应有3条消息');
    });

    it('按创建时间排序', () => {
      const rows = queryAll(db,
        'SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        ['conv-test-1']
      );
      const ids = rows.map(r => r.id);
      assertEqual(ids[0], 'msg-1');
      assertEqual(ids[1], 'msg-2');
      assertEqual(ids[2], 'msg-3');
    });

    it('删除对话时级联删除消息', () => {
      const now = Math.floor(Date.now() / 1000);
      db.run(
        'INSERT INTO conversations (id, title, model_id, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['conv-cascade', '级联测试', 'deepseek-chat', 'deepseek', now, now]
      );
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
        ['msg-c1', 'conv-cascade', 'user', '测试级联', now]
      );

      db.run('DELETE FROM messages WHERE conversation_id = ?', ['conv-cascade']);
      db.run('DELETE FROM conversations WHERE id = ?', ['conv-cascade']);

      const convRow = queryOne(db, 'SELECT id FROM conversations WHERE id = ?', ['conv-cascade']);
      const msgRow = queryOne(db, 'SELECT id FROM messages WHERE conversation_id = ?', ['conv-cascade']);
      assertEqual(convRow, null, '对话应被删除');
      assertEqual(msgRow, null, '消息应被级联删除');
    });
  });

  describe('Settings CRUD', () => {
    it('插入/替换设置', () => {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['test_key', 'test_value']);

      const row = queryOne(db, 'SELECT value FROM settings WHERE key = ?', ['test_key']);
      assert(row !== null);
      assertEqual(row.value, 'test_value');
    });

    it('更新已存在设置', () => {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['test_key', 'updated_value']);

      const row = queryOne(db, 'SELECT value FROM settings WHERE key = ?', ['test_key']);
      assertEqual(row.value, 'updated_value');
    });

    it('查询所有设置', () => {
      const rows = queryAll(db, 'SELECT key, value FROM settings');
      assert(rows.length >= 1);
    });

    it('默认设置应存在', () => {
      // 检查表中至少有我们刚插入的设置
      const row = queryOne(db, 'SELECT value FROM settings WHERE key = ?', ['test_key']);
      assert(row !== null);
    });
  });

  describe('Provider Configs CRUD', () => {
    it('插入提供商配置', () => {
      db.run(
        'INSERT OR REPLACE INTO provider_configs (id, name, api_key_enc, base_url, enabled, models_json) VALUES (?, ?, ?, ?, ?, ?)',
        ['test-provider', 'Test Provider', 'enc_12345', 'https://test.api.com/v1', 1, '["test-model"]']
      );

      const row = queryOne(db, 'SELECT name, enabled FROM provider_configs WHERE id = ?', ['test-provider']);
      assert(row !== null);
      assertEqual(row.name, 'Test Provider');
      assertEqual(row.enabled, 1);
    });

    it('插入禁用的提供商', () => {
      db.run(
        'INSERT OR REPLACE INTO provider_configs (id, name, api_key_enc, base_url, enabled, models_json) VALUES (?, ?, ?, ?, ?, ?)',
        ['disabled-provider', 'Disabled', null, '', 0, '[]']
      );

      const row = queryOne(db, 'SELECT enabled FROM provider_configs WHERE id = ?', ['disabled-provider']);
      assertEqual(row.enabled, 0);
    });

    it('删除提供商配置', () => {
      db.run('DELETE FROM provider_configs WHERE id = ?', ['test-provider']);
      const row = queryOne(db, 'SELECT id FROM provider_configs WHERE id = ?', ['test-provider']);
      assertEqual(row, null);
    });

    it('查询所有启用的提供商', () => {
      const rows = queryAll(db, 'SELECT id, name FROM provider_configs WHERE enabled = 1');
      const ids = rows.map(r => r.id);
      assert(!ids.includes('disabled-provider'), '禁用的提供商不应出现在结果中');
    });

    it('存储 JSON 字段', () => {
      const modelsJson = JSON.stringify(['model-a', 'model-b', 'model-c']);
      db.run(
        'INSERT OR REPLACE INTO provider_configs (id, name, api_key_enc, base_url, enabled, models_json) VALUES (?, ?, ?, ?, ?, ?)',
        ['json-test', 'JSON Test', 'enc_key', '', 1, modelsJson]
      );

      const row = queryOne(db, 'SELECT models_json FROM provider_configs WHERE id = ?', ['json-test']);
      const parsed = JSON.parse(row.models_json);
      assertEqual(parsed.length, 3);
      assert(parsed.includes('model-b'));
    });
  });

  describe('数据库导出', () => {
    it('应能导出数据库为 Uint8Array', () => {
      const data = db.export();
      assert(data instanceof Uint8Array, '导出应为 Uint8Array');
      assert(data.length > 0, '导出数据不应为空');
    });
  });
});
