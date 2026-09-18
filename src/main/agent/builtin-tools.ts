// Agent 内置工具集 — 类 Claude Code 的核心能力
// 所有文件操作被限制在工作区(cwd)内；命令执行需要用户确认
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import type { ToolDefinition } from '../../adapters/types';
import { logger } from '../utils/logger';

export interface ToolContext {
  /** 工作区根目录（沙箱边界） */
  cwd: string;
  /** 命令执行前请求用户确认（由 chat.ipc 提供渲染进程弹窗实现） */
  requestConfirm?: (title: string, detail: string) => Promise<boolean>;
}

const MAX_OUTPUT_CHARS = 8 * 1024;
const MAX_FILE_CHARS = 48 * 1024;
const MAX_READ_LINES = 1500;
const CMD_TIMEOUT_MS = 120_000;

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', 'tmp', 'out', 'release', '.venv', '__pycache__',
]);

/** 解析路径并确保在工作区内（防路径穿越） */
function resolveSafe(cwd: string, p: string): string {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, p || '.');
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`路径越界: 只能访问工作区 ${root} 内的文件`);
  }
  return resolved;
}

/** Windows 下命令输出常见 GBK 编码，utf8 出现替换符时尝试回退解码 */
function decodeOutput(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  try { return new TextDecoder('gbk').decode(buf); } catch { return utf8; }
}

function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (已截断，总长 ${text.length} 字符)`;
}

// ============ 工具定义 ============

export function getBuiltinToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'list_dir',
      description: '列出工作区内某个目录的内容（文件与子目录）。path 为相对工作区的路径，默认根目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径（相对或绝对，必须在工作区内）' },
        },
      },
    },
    {
      name: 'read_file',
      description: '读取工作区内一个文本文件的内容，带行号。大文件自动截断，可用 offset 指定起始行。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          offset: { type: 'number', description: '起始行号（从 1 开始），可选' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: '创建或覆盖工作区内的一个文件。用于新建文件或整体重写，修改已有文件优先用 edit_file。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '完整文件内容' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'edit_file',
      description: '对工作区内文件做精确字符串替换。old_string 必须与文件内容完全一致且唯一，否则报错；有多处匹配时提供更大的上下文或设置 replace_all。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_string: { type: 'string', description: '要被替换的原文（精确匹配）' },
          new_string: { type: 'string', description: '替换后的新文本' },
          replace_all: { type: 'boolean', description: '替换所有匹配项，默认 false' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'run_command',
      description: `在项目根目录执行 shell 命令（Windows 使用 cmd /c）。用于构建、测试、git、安装依赖等。执行前会请求用户确认。禁止交互式命令。`,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          timeout_ms: { type: 'number', description: '超时毫秒数，默认 120000，上限 300000' },
        },
        required: ['command'],
      },
    },
    {
      name: 'search_files',
      description: '在工作区内搜索：query 匹配文件名；content 匹配文件内容（返回命中的文件与行）。二选一。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '文件名关键字（模糊匹配）' },
          content: { type: 'string', description: '内容关键字（大小写不敏感）' },
          path: { type: 'string', description: '搜索起点目录，默认工作区根目录' },
        },
      },
    },
    {
      name: 'search_codebase',
      description:
        '语义检索工作区代码库（向量检索）：用自然语言或关键词描述要找的实现、函数、配置，返回最相关的代码片段（含文件路径与行号）。不知道代码在哪个文件时优先用它；若返回为空说明索引尚未建立。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索意图，例如「登录态校验在哪里」「ollama 适配器怎么处理工具调用」' },
          top_k: { type: 'number', description: '返回片段数量，默认 6' },
        },
        required: ['query'],
      },
    },
    {
      name: 'build_codebase_index',
      description:
        '为当前工作区建立/更新语义索引（向量化所有源码文件）。search_codebase 返回空或代码刚大改过时调用它，之后再用 search_codebase 检索。耗时可能较长。',
      parameters: {
        type: 'object',
        properties: {
          rebuild: { type: 'boolean', description: 'true = 全量重建（忽略增量缓存），默认 false' },
        },
      },
    },
  ];
}

export function isBuiltinTool(name: string): boolean {
  return [
    'list_dir', 'read_file', 'write_file', 'edit_file',
    'run_command', 'search_files', 'search_codebase', 'build_codebase_index',
  ].includes(name);
}

// ============ 工具执行 ============

export async function executeBuiltinTool(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<{ success: boolean; output: string }> {
  try {
    switch (name) {
      case 'list_dir': return await toolListDir(ctx, args);
      case 'read_file': return await toolReadFile(ctx, args);
      case 'write_file': return await toolWriteFile(ctx, args);
      case 'edit_file': return await toolEditFile(ctx, args);
      case 'run_command': return await toolRunCommand(ctx, args);
      case 'search_files': return await toolSearchFiles(ctx, args);
      case 'search_codebase': return await toolSearchCodebase(ctx, args);
      case 'build_codebase_index': return await toolBuildIndex(ctx, args);
      default: return { success: false, output: `未知工具: ${name}` };
    }
  } catch (e: any) {
    logger.error(`内置工具 ${name} 执行失败: ${e.message}`);
    return { success: false, output: `执行失败: ${e.message}` };
  }
}

async function toolListDir(ctx: ToolContext, args: any) {
  const dir = resolveSafe(ctx.cwd, args.path || '.');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      lines.push(`[目录] ${entry.name}/`);
    } else {
      let size = 0;
      try { size = (await fs.stat(path.join(dir, entry.name))).size; } catch {}
      lines.push(`[文件] ${entry.name} (${formatSize(size)})`);
    }
  }
  if (lines.length === 0) return { success: true, output: '(空目录)' };
  return { success: true, output: truncate(lines.join('\n')) };
}

async function toolReadFile(ctx: ToolContext, args: any) {
  if (!args.path) throw new Error('缺少 path 参数');
  const filePath = resolveSafe(ctx.cwd, args.path);
  const stat = await fs.stat(filePath);
  if (stat.size > 2 * 1024 * 1024) throw new Error('文件过大（>2MB），不支持读取');
  const raw = await fs.readFile(filePath, 'utf8');
  const allLines = raw.split('\n');
  const offset = Math.max(1, parseInt(args.offset, 10) || 1);
  const slice = allLines.slice(offset - 1, offset - 1 + MAX_READ_LINES);
  const numbered = slice.map((line, i) => {
    const clipped = line.length > 500 ? line.slice(0, 500) + '…' : line;
    return `${String(offset + i).padStart(5)} | ${clipped}`;
  });
  let output = numbered.join('\n');
  if (offset - 1 + MAX_READ_LINES < allLines.length) {
    output += `\n... (共 ${allLines.length} 行，已截断。可用 offset 参数继续读取)`;
  }
  return { success: true, output: truncate(output, MAX_FILE_CHARS) };
}

async function toolWriteFile(ctx: ToolContext, args: any) {
  if (!args.path || typeof args.content !== 'string') throw new Error('缺少 path 或 content 参数');
  const filePath = resolveSafe(ctx.cwd, args.path);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, args.content, 'utf8');
  logger.info(`Agent 写入文件: ${filePath}`);
  return { success: true, output: `已写入 ${args.path}（${args.content.length} 字符）` };
}

async function toolEditFile(ctx: ToolContext, args: any) {
  const { path: p, old_string: oldStr, new_string: newStr } = args;
  if (!p || typeof oldStr !== 'string' || typeof newStr !== 'string') {
    throw new Error('缺少 path / old_string / new_string 参数');
  }
  if (oldStr === newStr) throw new Error('old_string 与 new_string 相同');
  const filePath = resolveSafe(ctx.cwd, p);
  const content = await fs.readFile(filePath, 'utf8');

  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    throw new Error('old_string 在文件中未找到（需与文件内容精确匹配，注意空白字符）');
  }
  if (count > 1 && !args.replace_all) {
    throw new Error(`old_string 出现 ${count} 次，不唯一。请提供更长的上下文片段，或设置 replace_all=true`);
  }

  const updated = args.replace_all
    ? content.split(oldStr).join(newStr)
    : content.replace(oldStr, newStr);
  await fs.writeFile(filePath, updated, 'utf8');
  logger.info(`Agent 编辑文件: ${filePath}`);
  return { success: true, output: `已编辑 ${p}（替换 ${args.replace_all ? count : 1} 处）` };
}

async function toolRunCommand(ctx: ToolContext, args: any) {
  const command = String(args.command || '').trim();
  if (!command) throw new Error('缺少 command 参数');

  // 交互式/危险命令拦截
  const blocked = /^\s*(ssh|telnet|sudo|su\s|shutdown|restart|format|diskpart)\b/i.test(command)
    || /\b(pause|choice)\b/i.test(command);
  if (blocked) {
    return { success: false, output: '该命令被安全策略拦截（交互式或高危命令）' };
  }

  // 用户确认
  if (ctx.requestConfirm) {
    const allowed = await ctx.requestConfirm('执行终端命令', command);
    if (!allowed) {
      return { success: false, output: '用户拒绝了该命令的执行' };
    }
  }

  const timeout = Math.min(300_000, Math.max(5_000, parseInt(args.timeout_ms, 10) || CMD_TIMEOUT_MS));

  return await new Promise<{ success: boolean; output: string }>((resolve) => {
    exec(command, {
      cwd: path.resolve(ctx.cwd),
      timeout,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      encoding: 'buffer',
    } as any, (error, stdout, stderr) => {
      const out = decodeOutput(Buffer.from(stdout as any || ''));
      const err = decodeOutput(Buffer.from(stderr as any || ''));
      let output = '';
      if (out.trim()) output += out;
      if (err.trim()) output += (output ? '\n--- stderr ---\n' : '') + err;
      if (error && (error as any).killed) {
        output += `\n[命令超时（${timeout}ms）被终止]`;
      } else if (error) {
        output += `\n[退出码: ${error.code ?? '非零'}]`;
      }
      if (!output.trim()) {
        output = error ? `[退出码: ${(error as any).code ?? 1}，无输出]` : '(命令执行完成，无输出)';
      }
      resolve({
        success: !error,
        output: truncate(output.trim()),
      });
    });
  });
}

interface SearchHit { file: string; line?: number; text: string }

async function toolSearchFiles(ctx: ToolContext, args: any) {
  const query = String(args.query || args.content || '').trim();
  if (!query) throw new Error('缺少 query 或 content 参数');
  const searchContent = !!args.content && !args.query;
  const root = resolveSafe(ctx.cwd, args.path || '.');
  const lower = query.toLowerCase();
  const hits: SearchHit[] = [];
  const MAX_HITS = 60;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 8 || hits.length >= MAX_HITS) return;
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      if (hits.length >= MAX_HITS) return;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full) || entry.name;
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        if (!searchContent && entry.name.toLowerCase().includes(lower)) {
          hits.push({ file: rel, text: '' });
          continue;
        }
        // 内容搜索只查文本类小文件
        if (searchContent && entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const textExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.less', '.scss', '.html', '.vue', '.py', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.yml', '.yaml', '.toml', '.sh', '.bat', '.sql', '.xml']);
          if (!textExts.has(ext)) continue;
          try {
            const stat = await fs.stat(full);
            if (stat.size > 512 * 1024) continue;
            const content = await fs.readFile(full, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lower)) {
                hits.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) });
                if (hits.length >= MAX_HITS) break;
              }
            }
          } catch { /* 二进制或读取失败，跳过 */ }
        }
      }
    }
  }

  await walk(root, 0);

  if (hits.length === 0) return { success: true, output: '(未找到匹配项)' };
  const lines = hits.map(h =>
    h.line ? `${h.file}:${h.line}: ${h.text}` : h.file
  );
  return { success: true, output: truncate(lines.join('\n')) };
}

// ============ 语义检索（RAG）============

async function toolSearchCodebase(ctx: ToolContext, args: any) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('缺少 query 参数');
  const topK = Math.max(1, Math.min(20, parseInt(args.top_k, 10) || 6));

  const { search, stats, getConfig } = await import('../rag/rag-store');
  const { embed } = await import('../rag/embedder');

  const s = stats(ctx.cwd);
  if (s.chunks === 0) {
    return {
      success: true,
      output: '(代码库索引为空。请先调用 build_codebase_index 建立索引，或改用 search_files 做关键字搜索。)',
    };
  }

  const cfg = getConfig();
  const hits = await search(ctx.cwd, query, topK, async (texts) => {
    try {
      const r = await embed(texts, cfg);
      return r.vectors;
    } catch {
      return []; // search() 内部会自动回退到本地哈希向量
    }
  });

  if (hits.length === 0) {
    return { success: true, output: `(未检索到与「${query}」相关的代码片段，可试试更具体的关键词或先重建索引)` };
  }

  const blocks = hits.map((h) => {
    const head = `── ${h.path}:${h.startLine}-${h.endLine}  (相关度 ${h.score.toFixed(3)})`;
    const body = h.content.length > 1800 ? h.content.slice(0, 1800) + '\n…(片段截断)' : h.content;
    return `${head}\n${body}`;
  });
  return { success: true, output: truncate(blocks.join('\n\n'), MAX_FILE_CHARS) };
}

async function toolBuildIndex(ctx: ToolContext, args: any) {
  const rebuild = args?.rebuild === true || args?.rebuild === 'true';
  const { buildIndex } = await import('../rag/indexer');
  const { clearWorkspace } = await import('../rag/rag-store');

  if (rebuild) clearWorkspace(ctx.cwd);

  const result = await buildIndex(ctx.cwd, () => {});
  if (!result.ok) {
    return { success: false, output: `索引失败: ${result.message || '未知错误'}` };
  }
  const backend = result.backend ? `（后端：${result.backend}）` : '';
  return {
    success: true,
    output: `索引完成：处理 ${result.files} 个文件，新增 ${result.chunks} 个向量块${backend}。现在可以用 search_codebase 检索了。`,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
