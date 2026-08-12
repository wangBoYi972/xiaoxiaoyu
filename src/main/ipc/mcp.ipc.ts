import { ipcMain } from 'electron';
import { MCPManager, MCPServerConfig } from '../mcp/mcp-client';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const mcpManager = new MCPManager();

// 允许的 MCP 命令白名单
const ALLOWED_MCP_COMMANDS = new Set([
  'node', 'python', 'python3', 'npx', 'uvx',
  'docker', 'kubectl', 'git',
]);

// 禁止的命令字符串模式
const FORBIDDEN_CMD_PATTERNS = [
  /rm\s+-rf/i, /del\s+\/f/i, /format\s/i,
  /shutdown/i, /reboot/i, /chmod\s+777/i,
  />\s*\/dev\//, /mkfs/i, /dd\s+if=/i,
];

function validateMcpCommand(command: string): string | null {
  const baseName = command.split(/[/\\]/).pop() || command;
  if (!ALLOWED_MCP_COMMANDS.has(baseName)) {
    return `MCP 命令 "${baseName}" 不在允许列表中`;
  }
  return null;
}

function validateMcpArgs(args?: string[]): string | null {
  if (!args || args.length === 0) return null;
  const joined = args.join(' ');
  for (const pattern of FORBIDDEN_CMD_PATTERNS) {
    if (pattern.test(joined)) {
      return `MCP 参数包含危险操作: ${pattern}`;
    }
  }
  return null;
}

export function registerMcpHandlers(): void {
  // 列出所有 MCP 服务器
  ipcMain.handle('mcp:list-servers', async () => {
    const config = loadMcpConfig();
    const servers = Object.entries(config.mcpServers || {}).map(([name, def]) => ({
      id: name,
      name,
      command: def.command,
      args: def.args || [],
      env: def.env,
      disabled: def.disabled || false,
      status: mcpManager.getServerStatus(name),
    }));
    return servers;
  });

  // 添加 MCP 服务器
  ipcMain.handle('mcp:add-server', async (_event, server: MCPServerConfig) => {
    // 安全检查
    const cmdErr = validateMcpCommand(server.command);
    if (cmdErr) { logger.warn(`MCP 命令被拒绝: ${cmdErr}`); return; }
    const argErr = validateMcpArgs(server.args);
    if (argErr) { logger.warn(`MCP 参数被拒绝: ${argErr}`); return; }

    // 保存到配置文件
    const config = loadMcpConfig();
    config.mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env,
      disabled: server.disabled || false,
    };
    saveMcpConfig(config);

    // 启动服务器
    await mcpManager.addServer(server);
    logger.info(`MCP 服务器已添加: ${server.name}`);
  });

  // 移除 MCP 服务器
  ipcMain.handle('mcp:remove-server', async (_event, id: string) => {
    const config = loadMcpConfig();
    delete config.mcpServers[id];
    saveMcpConfig(config);

    await mcpManager.removeServer(id);
    logger.info(`MCP 服务器已移除: ${id}`);
  });

  // 开关 MCP 服务器
  ipcMain.handle('mcp:toggle-server', async (_event, id: string, enabled: boolean) => {
    const config = loadMcpConfig();
    if (config.mcpServers[id]) {
      config.mcpServers[id].disabled = !enabled;
      saveMcpConfig(config);
    }

    if (enabled) {
      const def = config.mcpServers[id];
      await mcpManager.addServer({
        id,
        name: id,
        command: def.command,
        args: def.args || [],
        env: def.env,
        disabled: false,
      });
    } else {
      await mcpManager.removeServer(id);
    }
  });

  // 列出所有工具
  ipcMain.handle('mcp:list-tools', async () => {
    return mcpManager.getAllTools();
  });

  // 调用工具
  ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
    return mcpManager.callTool(serverId, toolName, args);
  });
}

// 配置文件路径
function getMcpConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'mcp-config.json');
}

interface MCPConfigFile {
  mcpServers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
  }>;
}

function loadMcpConfig(): MCPConfigFile {
  try {
    const configPath = getMcpConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    logger.error('读取 MCP 配置文件失败', e as Error);
  }
  return { mcpServers: {} };
}

function saveMcpConfig(config: MCPConfigFile): void {
  try {
    const configPath = getMcpConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    logger.error('保存 MCP 配置文件失败', e as Error);
  }
}
