// Agent 执行循环 — 类 Claude Code 的工具调用循环
// 使用标准 tool 协议（assistant.toolCalls + role:'tool' 结果），
// OpenAI 兼容系适配器（openai/deepseek/qwen/glm/moonshot 及自定义 baseUrl）完整支持；
// 其余适配器不支持工具时自然退化为纯对话。
import { ModelRouter } from '../../adapters/index';
import { mcpManager } from '../ipc/mcp.ipc';
import type { ToolDefinition, UnifiedMessage, UnifiedStreamChunk } from '../../adapters/types';
import { logger } from '../utils/logger';
import {
  getBuiltinToolDefinitions, isBuiltinTool, executeBuiltinTool,
} from './builtin-tools';

interface AgentRunOptions {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
  messages: UnifiedMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Agent 模式：注入内置工具与系统提示词 */
  agentMode?: boolean;
  /** Agent 工作区根目录（沙箱） */
  cwd?: string;
  /** 命令执行确认（转发到渲染进程弹窗） */
  requestConfirm?: (title: string, detail: string) => Promise<boolean>;
  onChunk: (chunk: UnifiedStreamChunk) => void;
}

const MAX_ITERATIONS = 20;
const MAX_TOOL_OUTPUT = 16 * 1024;

function buildAgentSystemPrompt(cwd: string): string {
  const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
  return [
    '你是小小榆 Agent，一个运行在用户桌面上的编程智能体。你可以操作用户打开的项目目录来完成任务。',
    '',
    `# 环境`,
    `- 操作系统: ${platform}`,
    `- 当前工作区: ${cwd}（你的所有文件操作和命令都以它为根目录）`,
    `- 当前时间: ${new Date().toLocaleString('zh-CN')}`,
    '',
    '# 可用工具',
    '- list_dir: 浏览目录结构',
    '- read_file: 读文件（带行号，可分段）',
    '- edit_file: 精确字符串替换修改文件（优先使用，不要整文件重写）',
    '- write_file: 新建文件或整体重写',
    '- search_files: 按文件名或内容搜索',
    '- search_codebase: 语义/向量检索代码库（不知道代码在哪时优先用它）',
    '- build_codebase_index: 建立或更新语义索引（search_codebase 为空时先跑它）',
    '- edit_file / write_file: 提出文件改动后，先向用户展示逐文件 diff；只有用户批准后才会原子写入。',
    '- run_command: 在工作区执行 shell 命令（构建/测试/git 等，执行前用户会收到确认）',
    '',
    '# 工作准则',
    '1. 先观察再动手：修改前先 read_file / search_files 了解现状，不要凭空猜测文件内容。',
    '2. 改代码优先用 edit_file 做最小修改；edit_file 的 old_string 必须与文件内容逐字符一致（含缩进）。文件改动会逐项等待用户批准，不要把批准视为自动获得。',
    '3. run_command 用非交互命令；Windows 环境注意路径用反斜杠或引号包裹。',
    '4. 完成任务后给出简洁的中文总结：做了什么、改了哪些文件、如何验证。',
    '5. 遵循项目已有代码风格；不擅自删除无关内容；不做超出用户请求范围的改动。',
    '6. 一次回复中可以调用多个相互独立的工具；有依赖关系的工具请分步调用。',
  ].join('\n');
}

/**
 * RAG 注入：用最后一条用户消息做语义检索，把命中的代码片段拼到系统提示词尾部。
 * 任何异常都吞掉——检索是增强项，绝不能因为它失败而阻断对话。
 */
async function withRagContext(systemPrompt: string | undefined, cwd: string, messages: UnifiedMessage[]): Promise<string | undefined> {
  try {
    const { getConfig, search, stats } = await import('../rag/rag-store');
    const cfg = getConfig();
    if (!cfg.autoInject) return systemPrompt;

    const s = stats(cwd);
    if (s.chunks === 0) return systemPrompt;

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const text = typeof lastUser?.content === 'string'
      ? lastUser.content
      : Array.isArray((lastUser as any)?.content)
        ? ((lastUser as any).content as any[]).map((p: any) => p?.text || '').join(' ')
        : '';
    const query = text.trim();
    if (query.length < 4) return systemPrompt;

    const { embed } = await import('../rag/embedder');
    const hits = await search(cwd, query, Math.max(1, cfg.topK || 6), async (texts) => {
      try {
        const r = await embed(texts, cfg);
        return r.vectors;
      } catch {
        return [];
      }
    });
    if (hits.length === 0) return systemPrompt;

    const blocks = hits.map(h => {
      const body = h.content.length > 1600 ? h.content.slice(0, 1600) + '\n…(截断)' : h.content;
      return `── ${h.path}:${h.startLine}-${h.endLine}（相关度 ${h.score.toFixed(2)}）\n${body}`;
    });
    const ragBlock = [
      '',
      '# 检索到的相关代码（来自工作区语义索引，仅供参考，修改前仍需 read_file 确认原文）',
      blocks.join('\n\n'),
    ].join('\n');
    logger.info(`RAG 注入 ${hits.length} 个片段`);
    return [systemPrompt, ragBlock].filter(Boolean).join('\n');
  } catch (e: any) {
    logger.warn(`RAG 注入失败（忽略）: ${e?.message}`);
    return systemPrompt;
  }
}

export class AgentRunner {
  private modelRouter: ModelRouter;

  constructor(modelRouter: ModelRouter) {
    this.modelRouter = modelRouter;
  }

  async *run(options: AgentRunOptions): AsyncGenerator<UnifiedStreamChunk> {
    const agentMode = !!options.agentMode && !!options.cwd;
    let messages = [...options.messages];
    let iteration = 0;

    // 工具列表：Agent 模式 = 内置工具 + MCP；普通聊天 = 仅 MCP
    const mcpTools = mcpManager.getAllTools();
    const mcpDefs: ToolDefinition[] = mcpTools.map(t => ({
      name: t.name,
      description: `[MCP:${t.serverName}] ${t.description}`,
      parameters: t.inputSchema,
    }));
    const builtinDefs = agentMode ? getBuiltinToolDefinitions() : [];
    const tools = [...builtinDefs, ...mcpDefs];

    let systemPrompt = agentMode && options.cwd
      ? [options.systemPrompt, buildAgentSystemPrompt(options.cwd)].filter(Boolean).join('\n\n')
      : options.systemPrompt;

    // RAG：发送前用最后一条用户消息做语义检索，把相关代码片段注入上下文
    if (agentMode && options.cwd) {
      systemPrompt = await withRagContext(systemPrompt, options.cwd, messages);
    }

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      logger.info(`Agent iteration ${iteration}: 发送 ${messages.length} 条消息, ${tools.length} 个工具`);

      const assistantText: string[] = [];
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      let doneChunk: UnifiedStreamChunk | null = null;

      const stream = this.modelRouter.chat({
        providerId: options.providerId,
        modelId: options.modelId,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        extraHeaders: options.extraHeaders,
        messages,
        systemPrompt,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        signal: options.signal,
        tools: tools.length > 0 ? tools : undefined,
      });

      for await (const chunk of stream) {
        if (options.signal?.aborted) return;

        // ⚠️ 适配器每轮模型回复结束都会发 done。
        //    绝不能把它透传给外层——chat.ipc / 渲染层收到 done 就会收尾，
        //    后面的工具执行与后续迭代全部被截断（2026-09-19 线上踩过）。
        if (chunk.type === 'done') {
          doneChunk = chunk;
          break;
        }

        if (chunk.type === 'error') {
          yield chunk;
          return;
        }

        if (chunk.type === 'text-delta' && chunk.textDelta) {
          assistantText.push(chunk.textDelta);
        } else if (chunk.type === 'tool-call' && chunk.toolCall) {
          toolCalls.push(chunk.toolCall);
        }

        // 透传给前端（tool-call 也会流式到达 UI）
        yield chunk;
      }

      // 无工具调用 → Agent 循环结束，此时才把最后一轮的 done 交给外层收尾
      if (toolCalls.length === 0) {
        logger.info(`Agent iteration ${iteration}: 无工具调用，循环结束`);
        if (doneChunk) yield doneChunk;
        return;
      }

      // 追加 assistant 消息（携带工具调用），再逐个执行并追加 tool 结果
      const assistantMsg: UnifiedMessage = {
        role: 'assistant',
        content: assistantText.join(''),
        toolCalls,
      };
      messages = [...messages, assistantMsg];

      for (const tc of toolCalls) {
        if (options.signal?.aborted) return;

        let success = false;
        let output = '';

        if (agentMode && isBuiltinTool(tc.name)) {
          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.arguments || '{}'); } catch { /* 参数不合法时保持空对象 */ }
          logger.info(`Agent iteration ${iteration}: 执行内置工具 ${tc.name}`);
          const result = await executeBuiltinTool(tc.name, args, {
            cwd: options.cwd!,
            requestConfirm: options.requestConfirm,
          });
          success = result.success;
          output = result.output;
        } else {
          const tool = mcpTools.find(t => t.name === tc.name);
          if (!tool) {
            output = `工具 "${tc.name}" 不存在`;
          } else {
            try {
              const args = JSON.parse(tc.arguments || '{}');
              logger.info(`Agent iteration ${iteration}: 执行 MCP 工具 ${tc.name}`);
              const result = await mcpManager.callTool(tool.serverId, tc.name, args);
              success = true;
              output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            } catch (error) {
              logger.error(`MCP 工具执行失败: ${tc.name}`, error as Error);
              output = `工具 "${tc.name}" 执行失败: ${(error as Error).message}`;
            }
          }
        }

        output = output.length > MAX_TOOL_OUTPUT
          ? output.slice(0, MAX_TOOL_OUTPUT) + `\n... (输出已截断，总长 ${output.length} 字符)`
          : output;

        // 结构化结果推给前端渲染工具卡片
        yield { type: 'tool-result', toolResult: { id: tc.id, name: tc.name, success, output } };

        // 标准工具消息回传给模型
        messages = [...messages, {
          role: 'tool' as const,
          toolCallId: tc.id,
          content: success
            ? output
            : `[执行失败] ${output}`,
        }];
      }
    }

    logger.warn(`Agent 达到最大迭代次数 ${MAX_ITERATIONS}，强制终止`);
    yield { type: 'error', error: { message: 'Agent 循环超过最大迭代次数', code: 'MAX_ITERATIONS' } };
  }
}
