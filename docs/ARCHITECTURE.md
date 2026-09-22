# 小小榆 · 架构说明

> 面向维护者。读完这页你应该知道每类改动该落在哪个目录、走哪条链路。

## 总览

```
Electron 33 + React 18 + TypeScript + Ant Design 5 + Zustand + Vite 6
├── src/main/       Electron 主进程（窗口/托盘/IPC/Agent 引擎/本地库）
├── src/preload/    contextBridge 暴露的 API（renderer 与 main 的唯一通道）
├── src/renderer/   React 前端（玻璃设计系统 glass.css 是唯一样式真源）
├── src/adapters/   多模型适配层（统一 chunk 协议 / 超时 / 错误标准化）
├── src/shared/     桌面端共用的纯逻辑（验证码/日志内核/校验/邮件模板）
└── _test/          桌面端回归与冒烟测试
```

桌面主进程共用：`src/shared/*` 与 `src/adapters/*`（均由 `tsconfig.main.json` 编译）。

## 关键链路

### 聊天（普通 / Agent）

```
InputArea ──sendChatMessage({agentMode, workspacePath})──► chat.ipc
    ├─ 普通聊天：ModelRouter.chat ──► 适配器 ──► SSE
    └─ Agent：AgentRunner.run（最多 20 轮）
         每轮：模型流(text/thinking/tool-call/done) → 执行工具(builtin + MCP)
              → yield tool-result → 把工具结果回填消息 → 下一轮
```

- 渲染层 `src/renderer/agent-bridge.ts` 消费 chunk：
  text/thinking → 有序 segments；tool-call/result → `ToolCallBlock` 卡片；
  `agent:confirm-request` → `PermissionCard`（文件改动和 `run_command` 均须在执行前逐项确认）。
- ⚠️ AgentRunner 内层循环**不能透传适配器的 done**（每轮都有），
  只能在整条循环结束时 yield 一次，否则工具执行被截断（3.0.7 修复的 P0）。
- ⚠️ 适配器对 `tools` 的支持：openai-compat 完整；Ollama 已支持；
  Anthropic/Gemini/ERNIE 忽略 tools 自然退化为纯对话。本地 0.5B~1.8B 模型不会真调工具。

### 工作区（Codex 式）

```
任意入口（顶部/HomeView/ChatView/会话面板）──setWorkspace()──► workspace-store
    ├─ 常驻「对话」pinned 标签（换目录则开新对话标签）
    ├─ approveWorkspace() 授权后，file:*/agent 工具才能访问该目录
    └─ fs.watch 递归监听 → 'workspace:file-changed' → 前端刷新文件树
```

- 项目名的唯一真源是 workspace-store；`codex_active_project` 仅用于启动恢复。
- 文件编辑：Monaco（懒加载 5MB），model 按路径复用（保留撤销历史），关标签才 dispose。
- 生产渲染层走 `app://` 自定义协议（file:// 是 opaque origin，Worker 被禁 →
  Monaco 语言服务失效；app:// 下 Worker 可用且解锁 TS 补全）。

### 认证（QQ 邮箱）

```
LoginPage ──api.*──► auth.ipc
    ├─ 登录：QQ 邮箱（或历史用户名 admin）+ PBKDF2 密码；失败 5 次指数退避封禁
    ├─ 注册：邮箱验证码（randomInt 生成、只存哈希、一次性、60s 重发、每日上限）
    │   └─ 首账号引导：库里没有任何用户时，首个注册免验证码并 role='admin'
    └─ 重置密码：同一套验证码链路
```

- SMTP 发件配置存 settings 表（smtp_user / smtp_pass），界面在 设置 → 通用 → 邮件服务。
- 桌面端必须登录或注册后使用；账户是未来订阅权益、订单归属与跨设备备份的主体。

## 约定与坑（务必先读）

1. **主进程依赖必须选纯 CJS**：Electron 33 = Node 20，不支持 require(esm)；
   本机 Node 22 的 `node -e "require(x)"` 验证是假阴性，打包安装后才炸
   （chokidar 5 踩过，已被 fs.watch 替代）。
2. **项目不做类型检查门禁的时代已结束**：`npx tsc -p tsconfig.json --noEmit` 当前 0 错误，请保持。
3. **不要写死颜色**：样式一律走 `glass.css` 的设计变量（`--text-*` / `--g-*` / 语义色）。
4. **入口必须收敛**：打开目录一律走 `setWorkspace`；账号状态一律走 auth-store；
   新增异步失败分支必须有用户可见的报错（历史上 3 个「点了没反应」的 bug 都是静默吞错）。
5. **打包**：`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
   CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack`；
   偶发「文件被另一进程占用」重试即可；图标由 `build.afterPack → scripts/patch-win-exe.cjs` 写入。
6. **排查第一入口**：`%APPDATA%\xiaoxiaoyu\logs\app-YYYYMMDD.log`（按天分文件，保留 7 天）。

## 验证

```bash
npm test        # 5 个桌面端冒烟套件：认证、Agent 沙箱、工作区授权、加密与适配器
npm run build   # renderer + main，0 TS 错误
node _test/agent-loop-check.cjs   # Agent 多轮工具循环端到端（mock OpenAI 服务）
node _test/app-protocol-check.cjs # app:// 协议 + Worker 可用性（需 env -u ELECTRON_RUN_AS_NODE）
```
