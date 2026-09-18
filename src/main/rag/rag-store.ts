// RAG 存储层 —— 复用现有 sql.js 数据库，向量以 Float32 BLOB 存放
//
// 表：
//   rag_files   记录已索引文件的 mtime/size，用于增量重建
//   rag_chunks  文本块 + 向量
//
// 检索走内存余弦：工作区量级（几千~几万块）下比落盘 ANN 更简单也够快，
// 而且 sql.js 是 WASM 版 SQLite，没有向量扩展可用。
import { getDatabase, saveDatabase } from '../store/database';
import { cosine, embedLocal, l2normalize, tokenize, type EmbedConfig } from './embedder';

/** 索引写盘：失败不能让整个流程崩掉 */
export function saveDatabaseSafe(): void {
  try {
    saveDatabase();
  } catch (e) {
    /* 忽略 */
  }
}

const CONFIG_KEY = 'rag_config';

export interface RagConfig extends EmbedConfig {
  /** 每块字符数 */
  chunkSize: number;
  /** 块之间重叠字符数 */
  chunkOverlap: number;
  /** 单文件最大索引体积（字节） */
  maxFileBytes: number;
  /** 最多索引多少个文件 */
  maxFiles: number;
  /** Agent 模式下发送前自动检索注入 */
  autoInject: boolean;
  /** 自动注入时取回的块数 */
  topK: number;
}

export const DEFAULT_RAG_CONFIG: RagConfig = {
  backend: 'auto',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'nomic-embed-text',
  endpoint: '',
  apiKey: '',
  model: 'text-embedding-3-small',
  dim: 384,
  chunkSize: 1200,
  chunkOverlap: 200,
  maxFileBytes: 512 * 1024,
  maxFiles: 3000,
  autoInject: true,
  topK: 6,
};

export interface ChunkRow {
  id: number;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface SearchHit extends ChunkRow {
  score: number;
}

// ---------------- 建表 ----------------

let initialized = false;

export function ensureSchema(): void {
  if (initialized) return;
  const db = getDatabase();
  db.run(`
    CREATE TABLE IF NOT EXISTS rag_files (
      workspace TEXT NOT NULL,
      path TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      PRIMARY KEY (workspace, path)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace TEXT NOT NULL,
      path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL,
      vec BLOB,
      model TEXT NOT NULL DEFAULT ''
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_rag_chunks_ws ON rag_chunks(workspace)');
  initialized = true;
}

// ---------------- 配置 ----------------

export function getConfig(): RagConfig {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([CONFIG_KEY]);
    let raw: string | null = null;
    if (stmt.step()) raw = (stmt.getAsObject() as any).value || null;
    stmt.free();
    if (!raw) return { ...DEFAULT_RAG_CONFIG };
    return { ...DEFAULT_RAG_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_RAG_CONFIG };
  }
}

export function setConfig(patch: Partial<RagConfig>): RagConfig {
  const next = { ...getConfig(), ...patch };
  const db = getDatabase();
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [CONFIG_KEY, JSON.stringify(next)]);
  saveDatabase();
  return next;
}

// ---------------- 文件指纹 ----------------

export function getIndexedFiles(workspace: string): Map<string, { mtime: number; size: number }> {
  ensureSchema();
  const db = getDatabase();
  const stmt = db.prepare('SELECT path, mtime, size FROM rag_files WHERE workspace = ?');
  stmt.bind([workspace]);
  const map = new Map<string, { mtime: number; size: number }>();
  while (stmt.step()) {
    const r = stmt.getAsObject() as any;
    map.set(r.path, { mtime: Number(r.mtime) || 0, size: Number(r.size) || 0 });
  }
  stmt.free();
  return map;
}

export function markFileIndexed(workspace: string, path: string, mtime: number, size: number): void {
  const db = getDatabase();
  db.run('INSERT OR REPLACE INTO rag_files (workspace, path, mtime, size) VALUES (?, ?, ?, ?)',
    [workspace, path, mtime, size]);
}

export function dropFile(workspace: string, path: string): void {
  const db = getDatabase();
  db.run('DELETE FROM rag_chunks WHERE workspace = ? AND path = ?', [workspace, path]);
  db.run('DELETE FROM rag_files WHERE workspace = ? AND path = ?', [workspace, path]);
}

export function clearWorkspace(workspace: string): void {
  ensureSchema();
  const db = getDatabase();
  db.run('DELETE FROM rag_chunks WHERE workspace = ?', [workspace]);
  db.run('DELETE FROM rag_files WHERE workspace = ?', [workspace]);
  saveDatabase();
  memCache.delete(workspace);
}

// ---------------- 写入块 ----------------

export function insertChunks(
  workspace: string,
  chunks: Array<{ path: string; startLine: number; endLine: number; content: string; vector: Float32Array; model: string }>
): void {
  ensureSchema();
  const db = getDatabase();
  db.run('BEGIN');
  try {
    const stmt = db.prepare(
      'INSERT INTO rag_chunks (workspace, path, start_line, end_line, content, vec, model) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const c of chunks) {
      const buf = new Uint8Array(c.vector.buffer.slice(0) as ArrayBuffer);
      stmt.bind([workspace, c.path, c.startLine, c.endLine, c.content, buf, c.model]);
      stmt.step();
      stmt.reset();
    }
    stmt.free();
    db.run('COMMIT');
  } catch (e) {
    try { db.run('ROLLBACK'); } catch {}
    throw e;
  }
  memCache.delete(workspace);
}

// ---------------- 检索 ----------------

interface MemIndex {
  ids: number[];
  paths: string[];
  startLines: number[];
  endLines: number[];
  contents: string[];
  vecs: Float32Array[];
  /** 本地后端用的词元集合，用于兜底关键词打分 */
  tokens: string[][];
  model: string;
}

const memCache = new Map<string, MemIndex>();

function blobToVec(v: any): Float32Array | null {
  if (!v) return null;
  if (v instanceof Float32Array) return v;
  if (v instanceof Uint8Array) {
    // 必须是 4 字节对齐的拷贝，直接 view 可能因 byteOffset 非 4 倍数而抛错
    const copy = new Uint8Array(v.byteLength);
    copy.set(v);
    return new Float32Array(copy.buffer);
  }
  if (Array.isArray(v)) return new Float32Array(v);
  return null;
}

export function loadIndex(workspace: string): MemIndex | null {
  ensureSchema();
  const cached = memCache.get(workspace);
  if (cached) return cached;

  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT id, path, start_line, end_line, content, vec, model FROM rag_chunks WHERE workspace = ?'
  );
  stmt.bind([workspace]);
  const idx: MemIndex = { ids: [], paths: [], startLines: [], endLines: [], contents: [], vecs: [], tokens: [], model: '' };
  while (stmt.step()) {
    const r = stmt.getAsObject() as any;
    const vec = blobToVec(r.vec);
    if (!vec) continue;
    idx.ids.push(Number(r.id));
    idx.paths.push(String(r.path));
    idx.startLines.push(Number(r.start_line) || 0);
    idx.endLines.push(Number(r.end_line) || 0);
    idx.contents.push(String(r.content || ''));
    idx.vecs.push(vec);
    idx.tokens.push(tokenize(String(r.content || '')));
    idx.model = String(r.model || '');
  }
  stmt.free();
  if (idx.ids.length === 0) return null;
  memCache.set(workspace, idx);
  return idx;
}

export function stats(workspace: string): { chunks: number; files: number; model: string } {
  ensureSchema();
  const db = getDatabase();
  let chunks = 0;
  let files = 0;
  let model = '';
  const s1 = db.prepare('SELECT COUNT(*) AS c FROM rag_chunks WHERE workspace = ?');
  s1.bind([workspace]);
  if (s1.step()) chunks = Number((s1.getAsObject() as any).c) || 0;
  s1.free();
  const s2 = db.prepare('SELECT COUNT(*) AS c FROM rag_files WHERE workspace = ?');
  s2.bind([workspace]);
  if (s2.step()) files = Number((s2.getAsObject() as any).c) || 0;
  s2.free();
  const s3 = db.prepare('SELECT model FROM rag_chunks WHERE workspace = ? LIMIT 1');
  s3.bind([workspace]);
  if (s3.step()) model = String((s3.getAsObject() as any).model || '');
  s3.free();
  return { chunks, files, model };
}

/**
 * 混合检索：向量余弦 + 关键词命中加成。
 * 纯哈希向量召回偏弱，加一层字面命中能明显改善「找一个具体函数名」这类查询。
 */
export async function search(
  workspace: string,
  query: string,
  topK: number,
  embedQuery: (texts: string[]) => Promise<Float32Array[]>
): Promise<SearchHit[]> {
  const idx = loadIndex(workspace);
  if (!idx) return [];

  let qv: Float32Array | null = null;
  try {
    const vs = await embedQuery([query]);
    qv = vs[0] ? l2normalize(vs[0]) : null;
  } catch {
    qv = null;
  }
  // 向量不可用时用同维度的本地哈希兜底
  if (!qv) qv = embedLocal([query], idx.vecs[0]?.length || 384)[0];

  const qTokens = new Set(tokenize(query));
  const scored: Array<{ i: number; score: number }> = [];
  for (let i = 0; i < idx.vecs.length; i++) {
    let score = qv.length === idx.vecs[i].length ? cosine(qv, idx.vecs[i]) : 0;
    if (qTokens.size > 0) {
      let hits = 0;
      for (const t of idx.tokens[i]) {
        if (qTokens.has(t)) hits++;
      }
      if (hits > 0) score += 0.12 * Math.min(1, Math.log(1 + hits) / Math.log(1 + qTokens.size));
    }
    if (score > 0.01) scored.push({ i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ i, score }) => ({
    id: idx.ids[i],
    path: idx.paths[i],
    startLine: idx.startLines[i],
    endLine: idx.endLines[i],
    content: idx.contents[i],
    score,
  }));
}

/** 取某段代码块的上下文（用于把检索结果交给模型时补足行号信息） */
export function formatHit(h: SearchHit): string {
  return `// ${h.path}:${h.startLine}-${h.endLine}  (score ${h.score.toFixed(3)})\n${h.content}`;
}
