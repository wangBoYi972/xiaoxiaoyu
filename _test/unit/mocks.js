/**
 * 测试 Mock 辅助模块
 * 为无法在 Node.js 中直接运行的 Electron/sql.js 模块提供 mock
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ===== Mock Electron =====
const mockApp = {
  _path: path.join(os.tmpdir(), 'xiaoxiaoyu-test-' + Date.now()),
  getPath(name) {
    if (!fs.existsSync(this._path)) {
      fs.mkdirSync(this._path, { recursive: true });
    }
    return this._path;
  },
  whenReady() { return Promise.resolve(); },
  on() {},
  requestSingleInstanceLock() { return true; },
  quit() {},
};

const mockElectron = {
  app: mockApp,
  BrowserWindow: class {
    constructor() { this.webContents = { send() {} }; }
    static getAllWindows() { return []; }
    static fromWebContents() { return null; }
    loadURL() {}
    loadFile() {}
    on() {}
    show() {}
    focus() {}
    hide() {}
    isMinimized() { return false; }
    isVisible() { return true; }
    isFocused() { return false; }
  },
  ipcMain: {
    handle() {},
    on() {},
  },
  globalShortcut: {
    register() {},
    unregisterAll() {},
  },
};

// ===== Mock sql.js =====
// 简单的内存 SQLite mock
let mockDb = null;

function createMockDatabase() {
  const tables = new Map();
  const data = new Map();
  let saveCallback = null;

  const db = {
    run(sql, params = []) {
      const sqlUpper = sql.trim().toUpperCase();
      if (sqlUpper.startsWith('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
        if (match) tables.set(match[1], []);
        return { changes: 0 };
      }
      if (sqlUpper.startsWith('CREATE INDEX')) return { changes: 0 };
      if (sqlUpper.startsWith('INSERT') || sqlUpper.startsWith('REPLACE')) {
        const match = sql.match(/(?:INSERT|REPLACE) INTO (\w+)/i);
        if (match) {
          if (!data.has(match[1])) data.set(match[1], []);
          data.get(match[1]).push({ sql, params });
        }
        return { changes: 1 };
      }
      if (sqlUpper.startsWith('UPDATE')) {
        return { changes: 1 };
      }
      if (sqlUpper.startsWith('DELETE')) {
        return { changes: 1 };
      }
      return { changes: 0 };
    },
    prepare(sql) {
      const tableData = [];
      for (const [table, rows] of data) {
        if (sql.includes(table)) {
          for (const row of rows) {
            tableData.push({ sql: row.sql, params: row.params });
          }
        }
      }
      let rowIndex = -1;
      return {
        bind(params) {
          this._params = params;
        },
        _params: [],
        step() {
          rowIndex++;
          return rowIndex < tableData.length;
        },
        getAsObject() {
          const entry = tableData[rowIndex];
          const result = {};
          // 解析 INSERT 语句，提取列和值
          const sqlUp = (entry.sql || '').toUpperCase();
          const colMatch = entry.sql.match(/\(([^)]+)\)/g);
          if (colMatch && colMatch.length >= 2) {
            const cols = colMatch[0].replace(/[()]/g, '').split(',').map(c => c.trim());
            const params = entry.params || [];
            cols.forEach((col, i) => { result[col] = params[i] || ''; });
          }
          return result;
        },
        free() {},
      };
    },
    export() { return Buffer.from('mock-db'); },
    close() {},
  };

  // 预置数据
  data.set('conversations', [
    { sql: 'INSERT INTO conversations', params: ['conv-1', '测试对话1', 'deepseek-chat', 'deepseek', 1000, 1000, 0, 0] },
    { sql: 'INSERT INTO conversations', params: ['conv-2', '测试对话2', 'gpt-4o', 'openai', 2000, 2000, 5, 1] },
  ]);

  data.set('messages', [
    { sql: 'INSERT INTO messages', params: ['msg-1', 'conv-1', 'user', '你好', 10, null, 1000] },
    { sql: 'INSERT INTO messages', params: ['msg-2', 'conv-1', 'assistant', '你好！有什么可以帮助你的？', 20, null, 1001] },
  ]);

  data.set('settings', [
    { sql: 'INSERT INTO settings', params: ['language', 'zh-CN'] },
    { sql: 'INSERT INTO settings', params: ['theme', 'auto'] },
    { sql: 'INSERT INTO settings', params: ['fontSize', '14'] },
  ]);

  data.set('provider_configs', [
    { sql: 'INSERT INTO provider_configs', params: ['deepseek', 'DeepSeek', 'encrypted_key_123', 'https://api.deepseek.com/v1', 1, '["deepseek-chat"]', null] },
    { sql: 'INSERT INTO provider_configs', params: ['openai', 'OpenAI', null, '', 0, '["gpt-4o"]', null] },
  ]);

  return db;
}

const mockInitSqlJs = () => Promise.resolve({
  Database: class {
    constructor(buffer) {
      mockDb = createMockDatabase();
      return mockDb;
    }
  },
});

// ===== 设置全局 Mock =====
// 只拦截 electron 模块（编译后的代码依赖 electron，但测试环境不需要真正的 Electron）
const Module = require('module');
const originalRequire = Module.prototype.require;

const _electronMime = 'node_modules/electron/index.js';

Module.prototype.require = function(id) {
  // 只拦截 electron，其他模块正常加载
  if (id === 'electron' || id.endsWith('/electron') || id.endsWith('\\electron')) {
    return mockElectron;
  }
  return originalRequire.apply(this, arguments);
};

// 暴露 mock 实例
module.exports = {
  mockElectron,
  mockApp,
  mockInitSqlJs,
  getMockDb: () => mockDb,
  resetMockDb: () => { mockDb = createMockDatabase(); },
};
