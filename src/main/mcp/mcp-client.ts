import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  timeout?: number;
}

export interface MCPTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * MCP 客户端管理器
 * 管理与 MCP 服务器的 stdio 连接
 */
export class MCPClient {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private tools: MCPTool[] = [];
  private initialized = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /** 启动 MCP 服务器进程 */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.config.command, this.config.args, {
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString());
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          logger.warn(`[MCP ${this.config.name}] stderr: ${data.toString()}`);
        });

        this.process.on('error', (err) => {
          logger.error(`[MCP ${this.config.name}] 进程错误`, err);
          reject(err);
        });

        this.process.on('exit', (code) => {
          logger.info(`[MCP ${this.config.name}] 进程退出, code=${code}`);
          this.initialized = false;
        });

        // 发送 initialize 请求
        setTimeout(async () => {
          try {
            await this.initialize();
            this.initialized = true;
            resolve();
          } catch (e) {
            reject(e);
          }
        }, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  /** 停止 MCP 服务器 */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.tools = [];
    this.pendingRequests.clear();
  }

  /** 发送 JSON-RPC 请求 */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCP 服务器未启动');
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout || 30000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.process!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  /** 处理 stdout 数据 */
  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response: JSONRPCResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // 跳过非 JSON 输出
      }
    }
  }

  /** 初始化 MCP 连接 */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'ai-chat-desktop',
        version: '1.0.0',
      },
    });
    logger.info(`[MCP ${this.config.name}] 初始化成功: ${JSON.stringify(result)}`);
  }

  /** 获取工具列表 */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list') as { tools?: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> };

    this.tools = (result?.tools || []).map((tool) => ({
      serverId: this.config.id,
      serverName: this.config.name,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return this.tools;
  }

  /** 调用工具 */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return result;
  }

  /** 获取所有工具 */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * MCP 管理器
 * 管理多个 MCP 客户端实例
 */
export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();

  /** 添加并启动 MCP 服务器 */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      await this.removeServer(config.id);
    }
    const client = new MCPClient(config);
    this.clients.set(config.id, client);

    if (!config.disabled) {
      await client.start();
      await client.listTools();
    }
  }

  /** 移除 MCP 服务器 */
  async removeServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      await client.stop();
      this.clients.delete(id);
    }
  }

  /** 获取所有工具 */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const client of this.clients.values()) {
      tools.push(...client.getTools());
    }
    return tools;
  }

  /** 调用指定服务器的工具 */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP 服务器 ${serverId} 未找到`);
    return client.callTool(toolName, args);
  }

  /** 获取客户端状态 */
  getServerStatus(id: string): 'running' | 'stopped' | 'error' {
    const client = this.clients.get(id);
    if (!client) return 'stopped';
    return client.isInitialized() ? 'running' : 'error';
  }

  /** 关闭所有连接 */
  async shutdownAll(): Promise<void> {
    for (const [id] of this.clients) {
      await this.removeServer(id);
    }
  }
}
