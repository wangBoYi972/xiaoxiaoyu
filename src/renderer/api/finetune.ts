import api from '../../api';

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
  item_count?: number;
}

export interface FinetuneTask {
  id?: number;
  name: string;
  base_model: string;
  dataset_id: number;
  dataset_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  config: any;
  result?: string;
  error?: string;
  created_at?: number;
  updated_at?: number;
}

export interface PythonEnv {
  available: boolean;
  version?: string;
  installed?: string[];
  missing?: string[];
  error?: string;
}

// 数据集管理
export const finetuneApi = {
  // 创建数据集
  createDataset: (dataset: Dataset) =>
    api.invoke('finetune:create-dataset', dataset) as Promise<{ id: number }>,

  // 获取所有数据集
  getDatasets: () =>
    api.invoke('finetune:get-datasets') as Promise<Dataset[]>,

  // 获取数据集详情
  getDataset: (id: number) =>
    api.invoke('finetune:get-dataset', id) as Promise<Dataset>,

  // 更新数据集
  updateDataset: (id: number, dataset: Dataset) =>
    api.invoke('finetune:update-dataset', id, dataset) as Promise<{ success: boolean }>,

  // 删除数据集
  deleteDataset: (id: number) =>
    api.invoke('finetune:delete-dataset', id) as Promise<{ success: boolean }>,

  // 导出数据集
  exportDataset: (id: number, format: 'json' | 'jsonl') =>
    api.invoke('finetune:export-dataset', id, format) as Promise<{ filepath: string; filename: string }>,

  // 导入数据集
  importDataset: (filepath: string, name: string) =>
    api.invoke('finetune:import-dataset', filepath, name) as Promise<{ id: number; count: number }>,

  // 微调任务管理
  createTask: (task: FinetuneTask) =>
    api.invoke('finetune:create-task', task) as Promise<{ id: number }>,

  getTasks: () =>
    api.invoke('finetune:get-tasks') as Promise<FinetuneTask[]>,

  updateTaskStatus: (id: number, status: string, progress: number, error?: string) =>
    api.invoke('finetune:update-task-status', id, status, progress, error) as Promise<{ success: boolean }>,

  deleteTask: (id: number) =>
    api.invoke('finetune:delete-task', id) as Promise<{ success: boolean }>,

  // Python 环境检查
  checkPython: () =>
    api.invoke('finetune:check-python') as Promise<PythonEnv>,

  // 安装 Python 依赖
  installDependencies: (onProgress?: (msg: string) => void) =>
    api.invoke('finetune:install-dependencies', onProgress) as Promise<{ success: boolean; output: string }>,

  // 开始训练
  startTraining: (taskId: number) =>
    api.invoke('finetune:start-training', taskId) as Promise<{ success: boolean; output: string; outputDir: string }>,

  // 导出到 Ollama
  exportToOllama: (taskId: number) =>
    api.invoke('finetune:export-to-ollama', taskId) as Promise<{ success: boolean; output: string; modelName: string }>,
};
