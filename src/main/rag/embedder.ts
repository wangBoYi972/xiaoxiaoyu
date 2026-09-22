// 向量嵌入层 —— 纯 Node 实现，零额外依赖
//
// 三种后端，按可用性自动降级：
//   1. ollama  本地 Ollama（/api/embed，新接口；/api/embeddings 兜底）
//   2. openai  OpenAI 兼容端点（/embeddings）—— 中转站、企业网关、vLLM、LM Studio 都能用
//   3. local   离线哈希向量（signed hashing trick）—— 没模型也能检索，效果≈稀疏 TF-IDF
//
// 之所以保留 local：用户机器上未必装了 embedding 模型，
// 而 RAG 检索不能因为缺模型就整体不可用。

export type EmbedBackend = 'ollama' | 'openai' | 'local';

export interface EmbedConfig {
  /** auto = 依次尝试 ollama → openai → local */
  backend: 'auto' | EmbedBackend;
  /** Ollama 地址，默认 http://127.0.0.1:11434 */
  ollamaUrl?: string;
  /** Ollama embedding 模型，默认 nomic-embed-text */
  ollamaModel?: string;
  /** OpenAI 兼容端点 base url，如 https://api.openai.com/v1 */
  endpoint?: string;
  apiKey?: string;
  /** OpenAI 兼容端点的 embedding 模型 id */
  model?: string;
  /** local 后端向量维度，默认 384 */
  dim?: number;
}

export interface EmbedResult {
  vectors: Float32Array[];
  dim: number;
  backend: EmbedBackend;
  /** 后端具体标识，便于 UI 展示 */
  label: string;
}

const DEFAULT_DIM = 384;
const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text';

function httpJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 30_000): Promise<any> {
  const fetchFn: any = (globalThis as any).fetch;
  if (!fetchFn) throw new Error('当前 Node 版本不支持 fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res: any) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      }
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}

function toVec(raw: any): Float32Array | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return new Float32Array(raw);
  if (Array.isArray(raw?.embedding)) return new Float32Array(raw.embedding);
  return null;
}

// ---------------- Ollama ----------------

/** 列出本机 Ollama 已装的模型名 */
export async function listOllamaModels(url = DEFAULT_OLLAMA): Promise<string[]> {
  const fetchFn: any = (globalThis as any).fetch;
  if (!fetchFn) return [];
  const base = url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchFn(`${base}/api/tags`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.models || []).map((m: any) => String(m.name || '')).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析实际可用的 embedding 模型：
 * 优先用户指定的；没装就退回本机任意 embed 类模型；都没有才抛错。
 */
async function resolveOllamaModel(base: string, preferred: string): Promise<string> {
  const names = await listOllamaModels(base);
  if (names.length === 0) return preferred;
  if (names.some(n => n === preferred || n.startsWith(preferred.split(':')[0] + ':'))) return preferred;
  const embedish = names.find(n => /embed|bge-|gte-|e5|minilm|qwen3-embedding/i.test(n));
  return embedish || preferred;
}

async function embedOllama(texts: string[], cfg: EmbedConfig): Promise<EmbedResult> {
  const base = (cfg.ollamaUrl || DEFAULT_OLLAMA).replace(/\/+$/, '');
  const model = await resolveOllamaModel(base, cfg.ollamaModel || DEFAULT_OLLAMA_MODEL);

  // 新版 /api/embed 支持批量
  try {
    const data = await httpJson(`${base}/api/embed`, { model, input: texts }, {}, 60_000);
    const list = Array.isArray(data?.embeddings) ? data.embeddings : [];
    if (list.length === texts.length) {
      const vectors = list.map(toVec);
      if (vectors.every(Boolean)) {
        return {
          vectors: vectors as Float32Array[],
          dim: (vectors[0] as Float32Array).length,
          backend: 'ollama',
          label: `Ollama · ${model}`,
        };
      }
    }
  } catch {
    /* 落到旧接口 */
  }

  // 旧版 /api/embeddings 只支持单条
  const vectors: Float32Array[] = [];
  for (const t of texts) {
    const data = await httpJson(`${base}/api/embeddings`, { model, prompt: t }, {}, 60_000);
    const v = toVec(data?.embedding);
    if (!v) throw new Error('Ollama 未返回 embedding');
    vectors.push(v);
  }
  return { vectors, dim: vectors[0].length, backend: 'ollama', label: `Ollama · ${model}` };
}

// ---------------- OpenAI 兼容 ----------------

async function embedOpenAI(texts: string[], cfg: EmbedConfig): Promise<EmbedResult> {
  const base = (cfg.endpoint || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置 embedding 端点');
  const model = cfg.model || 'text-embedding-3-small';
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const data = await httpJson(`${base}/embeddings`, { model, input: texts }, headers, 60_000);
  const list = Array.isArray(data?.data) ? data.data : [];
  if (list.length !== texts.length) throw new Error('端点返回的向量数量不匹配');
  const vectors = list.map(toVec);
  if (!vectors.every(Boolean)) throw new Error('端点未返回 embedding');
  return {
    vectors: vectors as Float32Array[],
    dim: (vectors[0] as Float32Array).length,
    backend: 'openai',
    label: `${model} @ ${base}`,
  };
}

// ---------------- 离线哈希向量 ----------------

/** 32 位字符串哈希（FNV-1a 变体） */
function hash(s: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 分词：英文/数字按词，中文按单字 + 二元组。
 * 单字保证「向量」能被命中，二元组补上「向量检索」这类词序信息。
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const re = /[a-z0-9_]+|[\u4e00-\u9fa5]/g;
  let m: RegExpExecArray | null;
  const cjk: string[] = [];
  let lastCjkIndex = -2;
  const raw = lower;
  while ((m = re.exec(raw))) {
    if (/[a-z0-9_]/.test(m[0][0])) {
      tokens.push(m[0]);
    } else {
      const idx = m.index;
      cjk.push(m[0]);
      if (lastCjkIndex === idx - 1 && cjk.length >= 2) {
        tokens.push(cjk[cjk.length - 2] + cjk[cjk.length - 1]);
      }
      lastCjkIndex = idx;
    }
  }
  tokens.push(...cjk);
  return tokens;
}

/** signed hashing：同一 token 的权重符号由第二个哈希决定，降低碰撞偏置 */
export function embedLocal(texts: string[], dim = DEFAULT_DIM): Float32Array[] {
  return texts.map((t) => {
    const v = new Float32Array(dim);
    const tokens = tokenize(t);
    for (const tok of tokens) {
      const i = hash(tok) % dim;
      const sign = (hash(tok, 486187739) & 1) ? 1 : -1;
      v[i] += sign;
    }
    // 子线性缩放，抑制长文件权重过大
    const tf = 1 + Math.log(1 + tokens.length);
    for (let i = 0; i < dim; i++) v[i] /= tf;
    return l2normalize(v);
  });
}

export function l2normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s);
  if (s > 0) for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// ---------------- 统一入口 ----------------

/** 按配置取一个可用的 embedder（auto 会依次降级） */
export async function embed(texts: string[], cfg: EmbedConfig): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { vectors: [], dim: cfg.dim || DEFAULT_DIM, backend: 'local', label: 'local' };
  }
  const order: EmbedBackend[] =
    cfg.backend === 'auto' || !cfg.backend ? ['ollama', 'openai'] : [cfg.backend];

  const errors: string[] = [];
  for (const backend of order) {
    try {
      if (backend === 'ollama') return await embedOllama(texts, cfg);
      if (backend === 'openai') return await embedOpenAI(texts, cfg);
      return { vectors: embedLocal(texts, cfg.dim || DEFAULT_DIM), dim: cfg.dim || DEFAULT_DIM, backend: 'local', label: '本地哈希向量（离线）' };
    } catch (e: any) {
      errors.push(`${backend}: ${e?.message || e}`);
    }
  }
  throw new Error(`所有 embedding 后端都失败 → ${errors.join(' | ')}`);
}

/** 探测：返回当前实际可用的后端（用于 UI 状态灯） */
export async function probeBackend(cfg: EmbedConfig): Promise<{ backend: EmbedBackend; label: string; dim: number }> {
  const r = await embed(['probe'], cfg);
  return { backend: r.backend, label: r.label, dim: r.dim };
}
