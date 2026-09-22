# 小小榆

面向中文项目开发者的 AI 桌面协作工具。它在本地项目中提供可审查的代码修改、命令执行和项目预览能力。

## 核心能力

- 通过供应商 API 或本地 Ollama 获取可用模型，不维护静态模型列表。
- Agent 默认关闭；文件修改和命令执行均需用户审批。
- 修改前展示 diff，批准后再写入工作区。
- 内置终端和项目预览浏览器，服务于已有项目的调试流程。

## 开发

```bash
npm install
npm run dev
```

## 验证与打包

```bash
npm test
npm run build
npm run pack
```

Windows 安装包生成在 `release/` 目录。

## 许可证

本项目采用 [LICENSE](LICENSE) 中的许可证。
