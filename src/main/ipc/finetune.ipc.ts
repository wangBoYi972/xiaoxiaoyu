import { ipcMain } from 'electron';
import { getDatabase } from '../store/database';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { Database as SqlJsDatabase } from 'sql.js';

// 延迟获取数据库，避免在模块加载时调用
let db: any = null;
let dbInitialized = false;

function getDb() {
  if (!db) {
    db = getDatabase() as any;
  }
  // 首次获取时初始化表结构
  if (!dbInitialized) {
    initDatabaseTables();
    dbInitialized = true;
  }
  return db;
}

// 数据集存储目录
const DATASET_DIR = path.join(app.getPath('userData'), 'datasets');
if (!fs.existsSync(DATASET_DIR)) {
  fs.mkdirSync(DATASET_DIR, { recursive: true });
}

// 微调任务存储目录
const FINETUNE_DIR = path.join(app.getPath('userData'), 'finetune');
if (!fs.existsSync(FINETUNE_DIR)) {
  fs.mkdirSync(FINETUNE_DIR, { recursive: true });
}

export interface DatasetItem {
  id?: number;
  instruction: string;
  input: string;
  output: string;
}

export interface Dataset {
  id?: number;
  name: string;
  description: string;
  items: DatasetItem[];
  created_at?: number;
  updated_at?: number;
}

export interface FinetuneTask {
  id?: number;
  name: string;
  base_model: string;
  dataset_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  config: any;
  result?: string;
  error?: string;
  created_at?: number;
  updated_at?: number;
}

// 初始化数据库表结构
function initDatabaseTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS dataset_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      instruction TEXT NOT NULL,
      input TEXT,
      output TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS finetune_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_model TEXT NOT NULL,
      dataset_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      config TEXT,
      result TEXT,
      error TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    );
  `);
}

// ==================== 数据集管理 ====================

// 创建数据集
ipcMain.handle('finetune:create-dataset', async (_, dataset: Dataset) => {
  const result = getDb().prepare(
    'INSERT INTO datasets (name, description) VALUES (?, ?)'
  ).run(dataset.name, dataset.description || '');

  const datasetId = result.lastInsertRowid as number;

  // 插入数据项
  if (dataset.items && dataset.items.length > 0) {
    const stmt = getDb().prepare(
      'INSERT INTO dataset_items (dataset_id, instruction, input, output) VALUES (?, ?, ?, ?)'
    );
    for (const item of dataset.items) {
      stmt.run(datasetId, item.instruction, item.input || '', item.output);
    }
  }

  return { id: datasetId };
});

// 获取所有数据集
ipcMain.handle('finetune:get-datasets', async () => {
  const datasets = getDb().prepare(`
    SELECT
      d.*,
      COUNT(di.id) as item_count
    FROM datasets d
    LEFT JOIN dataset_items di ON d.id = di.dataset_id
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `).all();

  return datasets;
});

// 获取数据集详情（包含所有数据项）
ipcMain.handle('finetune:get-dataset', async (_, id: number) => {
  const dataset = getDb().prepare('SELECT * FROM datasets WHERE id = ?').get(id);
  if (!dataset) return null;

  const items = getDb().prepare('SELECT * FROM dataset_items WHERE dataset_id = ? ORDER BY id').all(id);

  return { ...dataset, items };
});

// 更新数据集
ipcMain.handle('finetune:update-dataset', async (_, id: number, dataset: Dataset) => {
  getDb().prepare(
    'UPDATE datasets SET name = ?, description = ?, updated_at = strftime("%s", "now") WHERE id = ?'
  ).run(dataset.name, dataset.description || '', id);

  // 删除旧数据项
  getDb().prepare('DELETE FROM dataset_items WHERE dataset_id = ?').run(id);

  // 插入新数据项
  if (dataset.items && dataset.items.length > 0) {
    const stmt = getDb().prepare(
      'INSERT INTO dataset_items (dataset_id, instruction, input, output) VALUES (?, ?, ?, ?)'
    );
    for (const item of dataset.items) {
      stmt.run(id, item.instruction, item.input || '', item.output);
    }
  }

  return { success: true };
});

// 删除数据集
ipcMain.handle('finetune:delete-dataset', async (_, id: number) => {
  getDb().prepare('DELETE FROM datasets WHERE id = ?').run(id);
  return { success: true };
});

// 导出数据集为 JSON
ipcMain.handle('finetune:export-dataset', async (_, id: number, format: 'json' | 'jsonl') => {
  const dataset: any = getDb().prepare('SELECT * FROM datasets WHERE id = ?').get(id);
  if (!dataset) throw new Error('数据集不存在');

  const items = getDb().prepare('SELECT instruction, input, output FROM dataset_items WHERE dataset_id = ?').all(id);

  const filename = `${dataset.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${format}`;
  const filepath = path.join(DATASET_DIR, filename);

  if (format === 'json') {
    fs.writeFileSync(filepath, JSON.stringify(items, null, 2), 'utf-8');
  } else {
    const lines = items.map((item: any) => JSON.stringify(item)).join('\n');
    fs.writeFileSync(filepath, lines, 'utf-8');
  }

  return { filepath, filename };
});

// 导入数据集
ipcMain.handle('finetune:import-dataset', async (_, filepath: string, name: string) => {
  const content = fs.readFileSync(filepath, 'utf-8');

  let items: DatasetItem[];
  if (filepath.endsWith('.jsonl')) {
    items = content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  } else {
    items = JSON.parse(content);
  }

  const result = getDb().prepare(
    'INSERT INTO datasets (name, description) VALUES (?, ?)'
  ).run(name, `从 ${path.basename(filepath)} 导入`);

  const datasetId = result.lastInsertRowid as number;

  const stmt = getDb().prepare(
    'INSERT INTO dataset_items (dataset_id, instruction, input, output) VALUES (?, ?, ?, ?)'
  );
  for (const item of items) {
    stmt.run(datasetId, item.instruction, item.input || '', item.output);
  }

  return { id: datasetId, count: items.length };
});

// ==================== 微调任务管理 ====================

// 创建微调任务
ipcMain.handle('finetune:create-task', async (_, task: FinetuneTask) => {
  const result = getDb().prepare(`
    INSERT INTO finetune_tasks (name, base_model, dataset_id, config)
    VALUES (?, ?, ?, ?)
  `).run(
    task.name,
    task.base_model,
    task.dataset_id,
    JSON.stringify(task.config || {})
  );

  return { id: result.lastInsertRowid };
});

// 获取所有微调任务
ipcMain.handle('finetune:get-tasks', async () => {
  const tasks = getDb().prepare(`
    SELECT
      ft.*,
      d.name as dataset_name
    FROM finetune_tasks ft
    LEFT JOIN datasets d ON ft.dataset_id = d.id
    ORDER BY ft.created_at DESC
  `).all();

  return tasks.map((task: any) => ({
    ...task,
    config: task.config ? JSON.parse(task.config) : {},
  }));
});

// 更新任务状态
ipcMain.handle('finetune:update-task-status', async (_, id: number, status: string, progress: number, error?: string) => {
  getDb().prepare(`
    UPDATE finetune_tasks
    SET status = ?, progress = ?, error = ?, updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).run(status, progress, error || null, id);

  return { success: true };
});

// 删除任务
ipcMain.handle('finetune:delete-task', async (_, id: number) => {
  getDb().prepare('DELETE FROM finetune_tasks WHERE id = ?').run(id);
  return { success: true };
});

// ==================== Python 环境检查 ====================

ipcMain.handle('finetune:check-python', async () => {
  const { execSync } = require('child_process');

  try {
    // 检查 Python
    const pythonVersion = execSync('python --version', { encoding: 'utf-8' }).trim();

    // 检查必要的包
    const packages = ['torch', 'transformers', 'peft', 'datasets'];
    const installed: string[] = [];
    const missing: string[] = [];

    for (const pkg of packages) {
      try {
        execSync(`python -c "import ${pkg}"`, { encoding: 'utf-8' });
        installed.push(pkg);
      } catch {
        missing.push(pkg);
      }
    }

    return {
      available: true,
      version: pythonVersion,
      installed,
      missing,
    };
  } catch (error: any) {
    return {
      available: false,
      error: error.message,
    };
  }
});

// 安装 Python 依赖
ipcMain.handle('finetune:install-dependencies', async (_, onProgress: (msg: string) => void) => {
  const { spawn } = require('child_process');
  const pythonDir = path.join(__dirname, '../../python');
  const setupScript = path.join(pythonDir, 'setup.py');

  return new Promise((resolve, reject) => {
    const process = spawn('python', [setupScript], {
      cwd: pythonDir,
    });

    let output = '';

    process.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      if (onProgress) onProgress(text);
    });

    process.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      if (onProgress) onProgress(text);
    });

    process.on('close', (code: number) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        reject(new Error(`安装失败，退出码: ${code}\n${output}`));
      }
    });
  });
});

// 开始训练
ipcMain.handle('finetune:start-training', async (_, taskId: number) => {
  const { spawn } = require('child_process');

  // 获取任务信息
  const task: any = getDb().prepare('SELECT * FROM finetune_tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('任务不存在');

  // 获取数据集
  const dataset: any = getDb().prepare('SELECT * FROM datasets WHERE id = ?').get(task.dataset_id);
  if (!dataset) throw new Error('数据集不存在');

  // 导出数据集
  const items = getDb().prepare('SELECT instruction, input, output FROM dataset_items WHERE dataset_id = ?').all(task.dataset_id);
  const datasetFile = path.join(DATASET_DIR, `dataset_${task.dataset_id}.json`);
  fs.writeFileSync(datasetFile, JSON.stringify(items, null, 2), 'utf-8');

  // 准备输出目录
  const outputDir = path.join(FINETUNE_DIR, `task_${taskId}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 解析配置
  const config = JSON.parse(task.config);

  // 启动训练
  const pythonDir = path.join(__dirname, '../../python');
  const trainScript = path.join(pythonDir, 'train.py');

  const args = [
    trainScript,
    '--base_model', task.base_model,
    '--dataset', datasetFile,
    '--output_dir', outputDir,
    '--model_name', task.name,
    '--lora_r', config.lora_r || 8,
    '--lora_alpha', config.lora_alpha || 16,
    '--epochs', config.epochs || 3,
    '--learning_rate', config.learning_rate || 2e-4,
  ];

  // 更新任务状态
  getDb().prepare('UPDATE finetune_tasks SET status = ?, updated_at = strftime("%s", "now") WHERE id = ?')
    .run('running', taskId);

  return new Promise((resolve, reject) => {
    const process = spawn('python', args, {
      cwd: pythonDir,
    });

    let output = '';

    process.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      console.log(text);

      // 解析进度（如果有的话）
      // TODO: 实现进度解析和更新
    });

    process.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      console.error(text);
    });

    process.on('close', (code: number) => {
      if (code === 0) {
        // 训练成功
        getDb().prepare(`
          UPDATE finetune_tasks
          SET status = ?, progress = 100, result = ?, updated_at = strftime('%s', 'now')
          WHERE id = ?
        `).run('completed', outputDir, taskId);

        resolve({ success: true, output, outputDir });
      } else {
        // 训练失败
        getDb().prepare(`
          UPDATE finetune_tasks
          SET status = ?, error = ?, updated_at = strftime('%s', 'now')
          WHERE id = ?
        `).run('failed', output, taskId);

        reject(new Error(`训练失败，退出码: ${code}\n${output}`));
      }
    });
  });
});

// 导出模型到 Ollama
ipcMain.handle('finetune:export-to-ollama', async (_, taskId: number) => {
  const { spawn } = require('child_process');

  // 获取任务信息
  const task: any = getDb().prepare('SELECT * FROM finetune_tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('任务不存在');
  if (task.status !== 'completed') throw new Error('任务未完成');

  const outputDir = task.result;
  if (!outputDir || !fs.existsSync(outputDir)) {
    throw new Error('模型文件不存在');
  }

  // 执行导出脚本
  const pythonDir = path.join(__dirname, '../../python');
  const exportScript = path.join(pythonDir, 'export.py');

  const args = [
    exportScript,
    '--model_path', outputDir,
    '--model_name', task.name,
    '--base_model', task.base_model,
    '--format', 'ollama',
  ];

  return new Promise((resolve, reject) => {
    const process = spawn('python', args, {
      cwd: pythonDir,
    });

    let output = '';

    process.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      console.log(data.toString());
    });

    process.stderr.on('data', (data: Buffer) => {
      output += data.toString();
      console.error(data.toString());
    });

    process.on('close', (code: number) => {
      if (code === 0) {
        resolve({ success: true, output, modelName: task.name });
      } else {
        reject(new Error(`导出失败，退出码: ${code}\n${output}`));
      }
    });
  });
});

console.log('✅ 微调 IPC 已注册');
