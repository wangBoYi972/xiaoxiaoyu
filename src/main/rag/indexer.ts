// 工作区索引器 —— 遍历文件 → 切块 → 批量嵌入 → 落库
// 支持增量（按 mtime+size 跳过未变动文件）、进度回调、随时取消。
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { embed, type EmbedConfig, type EmbedResult } from './embedder';
import {
  ensureSchema, getConfig, getIndexedFiles, insertChunks, stats,
  markFileIndexed, dropFile, clearWorkspace, saveDatabaseSafe, type RagConfig,
} from './rag-store';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
  '.cache', 'tmp', 'out', 'release', '.venv', '__pycache__', '.idea',
  '.vscode', '.gradle', 'target', 'bin', 'obj', '.svn', '.hg',
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  'pipfile.lock', '.ds_store', 'thumbs.db',
]);

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx',
  '.css', '.scss', '.less', '.html', '.vue', '.svelte', '.py', '.java',
  '.kt', '.kts', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.sh', '.bash', '.ps1', '.yml', '.yaml',
  '.toml', '.ini', '.cfg', '.conf', '.xml', '.sql', '.gradle', '.properties',
  '.txt', '.env.example', '.gitignore', '.dockerfile',
]);

const NAMED_TEXT_FILES = new Set([
  'dockerfile', 'makefile', 'readme', 'license', 'changelog', '.gitignore',
  '.env.example', '.editorconfig', '.babelrc', '.eslintrc',
]);

function isTextFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (IGNORED_FILES.has(base)) return false;
  if (NAMED_TEXT_FILES.has(base)) return true;
  const ext = path.extname(base);
  if (!ext) return false;
  return TEXT_EXT.has(ext);
}

/** 按字符切块，同时算出块首/块尾行号 */
export function chunkText(text: string, size: number, overlap: number) {
  const chunks: Array<{ startLine: number; endLine: number; content: string }> = [];
  const n = text.length;
  if (n === 0) return chunks;
  const step = Math.max(1, size - overlap);
  for (let start = 0; start < n; start += step) {
    const end = Math.min(n, start + size);
    // 尽量在换行处收尾，避免把一行切成两半
    let cut = end;
    if (end < n) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > start + size * 0.5) cut = nl;
    }
    const slice = text.slice(start, cut);
    if (!slice.trim()) continue;
    const startLine = text.slice(0, start).split('\n').length;
    const endLine = startLine + slice.split('\n').length - 1;
    chunks.push({ startLine, endLine, content: slice });
    if (cut >= n) break;
  }
  return chunks;
}

async function walk(dir: string, root: string, out: string[], cfg: RagConfig, onCancel: () => boolean): Promise<void> {
  let entries: any[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (onCancel()) return;
    if (out.length >= cfg.maxFiles) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      await walk(full, root, out, cfg, onCancel);
    } else if (e.isFile()) {
      if (!isTextFile(full)) continue;
      out.push(full);
    }
  }
}

export interface IndexProgress {
  phase: 'scan' | 'embed' | 'pull' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  current?: string;
  message?: string;
}

export interface IndexResult {
  ok: boolean;
  files: number;
  chunks: number;
  backend?: string;
  message?: string;
}

let cancelFlag = false;

export function cancelIndex(): void {
  cancelFlag = true;
}

export async function buildIndex(
  workspace: string,
  onProgress: (p: IndexProgress) => void,
  override?: Partial<RagConfig>
): Promise<IndexResult> {
  cancelFlag = false;
  ensureSchema();
  const cfg: RagConfig = { ...getConfig(), ...(override || {}) };

  onProgress({ phase: 'scan', done: 0, total: 0, message: '扫描文件…' });
  const files: string[] = [];
  await walk(workspace, workspace, files, cfg, () => cancelFlag);
  if (cancelFlag) {
    onProgress({ phase: 'cancelled', done: 0, total: 0, message: '已取消' });
    return { ok: false, files: 0, chunks: 0, message: '已取消' };
  }

  // 先探一次 embedding：既能提前暴露「模型没装」这类错误，也能拿到后端标签
  // 用于判断是否需要整体重建（换模型 = 换向量维度，混在一起余弦就废了）
  onProgress({ phase: 'scan', done: 0, total: 0, message: '检测 embedding 后端…' });
  let expectModel = '';
  try {
    const probe = await embed(['__rag_probe__'], cfg as EmbedConfig);
    expectModel = probe.label;
  } catch (e: any) {
    const msg = e?.message || 'embedding 后端不可用';
    onProgress({ phase: 'error', done: 0, total: 0, message: msg });
    return { ok: false, files: 0, chunks: 0, message: msg };
  }

  const prevModel = stats(workspace).model;
  if (prevModel && expectModel && prevModel !== expectModel) {
    logger.info(`RAG embedding 后端变更（${prevModel} → ${expectModel}），重建索引`);
    clearWorkspace(workspace);
  }

  let indexed = getIndexedFiles(workspace);
  const seen = new Set<string>();
  const pending: Array<{ rel: string; abs: string; mtime: number; size: number }> = [];

  for (const abs of files) {
    if (cancelFlag) break;
    const rel = path.relative(workspace, abs).split(path.sep).join('/');
    seen.add(rel);
    let st: any;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    if (st.size > cfg.maxFileBytes) continue;
    const prev = indexed.get(rel);
    if (prev && prev.mtime === Math.floor(st.mtimeMs) && prev.size === st.size) continue;
    pending.push({ rel, abs, mtime: Math.floor(st.mtimeMs), size: st.size });
  }

  // 清理已删除的文件
  for (const rel of indexed.keys()) {
    if (!seen.has(rel)) dropFile(workspace, rel);
  }

  if (pending.length === 0) {
    onProgress({ phase: 'done', done: 0, total: 0, message: '索引已是最新' });
    return { ok: true, files: seen.size, chunks: 0, message: '索引已是最新' };
  }

  onProgress({ phase: 'embed', done: 0, total: pending.length, message: `嵌入 ${pending.length} 个文件…` });

  let embedInfo: EmbedResult | null = null;
  let totalChunks = 0;
  const BATCH = 24;

  for (let i = 0; i < pending.length; i += BATCH) {
    if (cancelFlag) {
      onProgress({ phase: 'cancelled', done: i, total: pending.length, message: '已取消' });
      saveDatabaseSafe();
      return { ok: false, files: i, chunks: totalChunks, message: '已取消' };
    }
    const slice = pending.slice(i, i + BATCH);

    // 读取并切块
    const jobs: Array<{ rel: string; mtime: number; size: number; chunks: ReturnType<typeof chunkText> }> = [];
    for (const f of slice) {
      try {
        const raw = await fs.readFile(f.abs, 'utf8');
        if (raw.includes('\u0000')) continue; // 二进制
        jobs.push({ rel: f.rel, mtime: f.mtime, size: f.size, chunks: chunkText(raw, cfg.chunkSize, cfg.chunkOverlap) });
      } catch {
        /* 读不了就跳过 */
      }
    }

    const flat: string[] = [];
    for (const j of jobs) for (const c of j.chunks) flat.push(c.content);
    if (flat.length === 0) {
      for (const j of jobs) markFileIndexed(workspace, j.rel, j.mtime, j.size);
      continue;
    }

    try {
      const res = await embed(flat, cfg as EmbedConfig);
      embedInfo = res;
      let k = 0;
      const rows: Array<{ path: string; startLine: number; endLine: number; content: string; vector: Float32Array; model: string }> = [];
      for (const j of jobs) {
        dropFile(workspace, j.rel);
        for (const c of j.chunks) {
          const vector = res.vectors[k++];
          if (!vector) continue;
          rows.push({ path: j.rel, startLine: c.startLine, endLine: c.endLine, content: c.content, vector, model: res.label });
        }
        markFileIndexed(workspace, j.rel, j.mtime, j.size);
      }
      insertChunks(workspace, rows);
      totalChunks += rows.length;
    } catch (e: any) {
      logger.error('RAG 嵌入批次失败', e as Error);
      onProgress({ phase: 'error', done: i, total: pending.length, message: e?.message || '嵌入失败' });
      saveDatabaseSafe();
      return { ok: false, files: i, chunks: totalChunks, message: e?.message || '嵌入失败' };
    }

    onProgress({
      phase: 'embed',
      done: Math.min(i + BATCH, pending.length),
      total: pending.length,
      current: slice[slice.length - 1]?.rel,
      message: `已索引 ${totalChunks} 块`,
    });
  }

  saveDatabaseSafe();
  onProgress({ phase: 'done', done: pending.length, total: pending.length, message: `完成，共 ${totalChunks} 块` });
  return { ok: true, files: pending.length, chunks: totalChunks, backend: embedInfo?.label };
}
