# 更新日志（CHANGELOG）

> 所有改动遵循语义化版本；每项均经过构建 + 冒烟测试验证。

## 3.1.0（2026-09-19）

**RAG 向量检索（知识库）**

- 新增 `src/main/rag/`：`embedder.ts`（Ollama / OpenAI 兼容 embeddings / 本地哈希兜底 +
  CJK 分词 + 余弦相似度）、`rag-store.ts`（sql.js 持久化向量块）、`indexer.ts`（切块 + 增量索引）。
- 新增 `src/main/ipc/rag.ipc.ts`：`rag:get-config/set-config/probe/status/index/cancel/clear/search/
  ollama-models/pull-model` + `rag:progress` 进度推送；已在 `src/main/ipc/index.ts` 注册。
- Agent 工具集新增 `search_codebase`（语义检索代码库）与 `build_codebase_index`（建/更新索引），
  系统提示同步列出；检索结果带文件路径与行号注入上下文。
- 渲染层：`stores/rag-store.ts` + `settings/RagSettings.tsx`（设置 → 知识库标签页，可探测后端、
  一键建索引、拉取 `nomic-embed-text`）；`ComposerHeader` 顶部显示「知识库 N」状态 chip。
- 冒烟测试 `_test/rag-smoke.cjs`：切块、CJK 分词、本地余弦检索命中、Ollama 探测。

**项目启动器（真启动器）**

- 新增 `src/main/ipc/runner.ipc.ts`：`runner:check-env` 探测 Node / JDK / Python / Git / Maven；
  `runner:start` 在已授权工作区 `spawn npm run <script>`，**完整继承 `process.env`**
  （PATH / JAVA_HOME / MAVEN_HOME 均可读）；`runner:stop` 用 `taskkill /PID /T /F` 杀进程树。
- 新增终端面板 `TerminalView.tsx`（Tab 类型 `terminal`）+ `runner-store.ts`：
  实时 stdout/stderr、自动滚动、localhost 链接可点击、停止 / 清空 / 重新检测环境。
- 「启动项目」不再把命令丢给聊天 Agent，而是直接起进程并在终端标签里看输出。

**供应商可自定义**

- `model-store.ts` 支持加载用户自建供应商（此前非内置供应商会被丢弃），
  新增 `addCustomProvider` / `removeCustomProvider` / `addCustomModel`。
- 新增 `CustomProviderModal.tsx`：名称 / Base URL / API Key / 模型 ID，
  内置 OpenAI、中转、vLLM、LM Studio、Ollama 兼容端点模板。
- `ProviderConfigModal` 补上「自定义模型 ID」字段；设置页自定义供应商可删除；
  输入框顶部模型下拉旁 `＋` 可随时手填模型 ID。

**界面**

- 浅色主题玻璃质感调整（面板不透明度、内高光、阴影）。
- 输入框底部「技能」改为「代码大师」Agent 模式开关；顶部 chips 抽成 `ComposerHeader` 复用。

## 3.0.7（2026-09-19）

**后端稳定性**

- Agent 循环关键修复：适配器每轮回复结束的 `done` 不再透传给外层，
  修复「工具从未真正执行」的致命问题（新增端到端验证 `_test/agent-loop-check.cjs`，8 断言）。
- Ollama 适配器支持工具协议（tools 传参 / tool_calls 解析 / 历史回填）；
  实测 0.5B~1.8B 本地模型不会真的调用工具，已在 Agent 模式下提示切换云端模型。
- `chokidar` 卸载（纯 ESM，在 Electron 33 的 Node 20 下打包后必炸 ERR_REQUIRE_ESM），
  文件监听改用 Node 原生 `fs.watch({ recursive: true })`。
- **渲染层改用自定义协议 `app://` 加载**：file:// 是 opaque origin，Web Worker 全被拦，
  导致 js/ts/json/css/html 的语言服务反复抛异常（「js 文件展示不了」的根因），
  同时解锁 Monaco 的 TS 类型级补全；协议不可用时自动回退 file://。

**前端体验**

- 修复「打开文件后聊天面板消失」：设置「对话」为常驻 pinned 标签（不可关闭）。
- 切换会话现在会真正加载对应消息（此前画面停留在旧会话）；
  同一会话切标签回来不打断流式。
- 修复新消息可能写入旧会话的问题（移除 activeId 兜底）。
- 项目名/工作区状态统一由 workspace-store 提供，顶部标签、项目 chip、
  会话面板「项目目录」三处永远同步。
- 消息列表最多渲染最近 300 条，长会话不再拖垮渲染层。
- 新增 React ErrorBoundary，视图崩溃给出可恢复界面而非白屏。
- 编辑器保存增加成功/失败提示；打开工作区/文件失败不再静默。
- 修复 3.0.1 安装包「打开项目目录无反应」（同 chokidar 问题）。

**账号体系**

- 登录页改为 QQ 邮箱 + 密码 / 邮箱验证码注册 / 验证码找回密码（60 秒重发倒计时）。
- 按产品要求**移除游客模式**：桌面端与 Web 端均需登录。
- 新增设置入口：账号（退出登录）、SMTP 发件配置（带授权码获取说明）。
- 兼容历史用户名登录（默认管理员 admin / admin123）。

**安全**

- 验证码改用 `crypto.randomInt` 生成，仅存哈希（timingSafeEqual 比较），每邮箱每日上限。
- 登录失败 5 次起指数退避封禁（1 分钟 → 30 分钟）。
- API Key 优先使用系统凭据链（safeStorage）加密，老数据自动兼容。
- Web 服务端：CSP、Permissions-Policy、统一 JSON 错误处理、请求日志、API 404 JSON 化。
- 依赖审计：`npm audit fix`；`uuid` 移除（换 `crypto.randomUUID`）。

**工程**

- **TypeScript 严格检查错误从 106 个清零**（含删除 5 个无引用死代码组件）。
- 日志：按天分文件 + 5MB 滚动 + 保留 7 天（桌面端 `%APPDATA%\xiaoxiaoyu\logs\`）。
- 主进程 `uncaughtException` / `unhandledRejection` 兜底；渲染进程崩溃留痕。
- `npm test` 聚合 5 个冒烟套件（94 项断言）。

## 3.0.6 / 3.0.5 / 3.0.4 / 3.0.3 / 3.0.2

- 3.0.2：修复打开项目目录无反应（chokidar ESM 问题）；会话常驻标签。
- 3.0.3：Agent 引擎与 QQ 邮箱认证相关修复。
- 3.0.4：app:// 自定义协议（Worker 限制根治）。
- 3.0.5：账号入口（登录 / 退出登录）。

## 3.0.1

- 初始功能版本。
