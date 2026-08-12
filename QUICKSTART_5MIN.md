# 小小榆微调 - 5 分钟快速上手

**更新时间：** 2026-08-12  
**当前版本：** 3.0.0

---

## ✅ 前置条件检查

在开始之前，确保你已经：

- [x] **已安装 Ollama** - 运行 `ollama list` 能看到输出
- [x] **已下载模型** - DeepSeek-R1 已在列表中
  ```bash
  ollama list
  # 应该看到：
  # deepseek-r1:1.5b    1.1 GB
  # deepseek-r1:7b      4.7 GB
  ```
- [x] **Python 3.8+** - 运行 `python --version` 检查版本
- [x] **NVIDIA 显卡** - RTX 3060 或更好（8GB 显存推荐）

---

## 🚀 方法一：命令行快速测试（推荐新手）

### 步骤 1：安装 Python 依赖（首次运行）

```bash
cd E:\ai-chat-desktop
python python\setup.py
```

**预计时间：** 15-30 分钟  
**下载大小：** 约 5GB

### 步骤 2：运行快速测试

```bash
python test_training.py
```

这个脚本会：
1. ✅ 检查 Python 环境
2. ✅ 检查测试数据集（10 条样本）
3. ✅ 检查 Ollama 模型
4. ✅ 配置训练参数
5. 🔥 开始训练（约 5-10 分钟）

### 步骤 3：测试你的模型

训练完成后：

```bash
# 测试模型
ollama run xiaoxiaoyu-test

# 输入测试问题
>>> 介绍你自己
>>> 写一个 Python 函数计算两个数的和
```

---

## 🎨 方法二：使用界面（更直观）

### 步骤 1：打开小小榆应用

双击桌面图标或运行：
```bash
cd E:\ai-chat-desktop
npm run dev
```

### 步骤 2：进入微调页面

1. 点击右上角 **"设置"** 图标 ⚙️
2. 点击 **"模型微调"** 按钮（蓝色按钮）

### 步骤 3：创建数据集

1. 切换到 **"数据集编辑"** 标签页
2. 点击 **"导入 JSON"**
3. 选择 `E:\ai-chat-desktop\datasets\example_dataset.json`
4. 给数据集命名，例如 "测试数据集"
5. 点击 **"保存"**

### 步骤 4：开始训练

1. 切换到 **"微调训练"** 标签页
2. 选择基座模型：**deepseek-r1:1.5b**（推荐新手）
3. 选择数据集：**测试数据集**
4. 训练轮数：**1**（快速测试）
5. 点击 **"开始训练"** 🔥

### 步骤 5：导出模型

训练完成后：
1. 在任务列表中找到已完成的任务
2. 点击 **"导出到 Ollama"**
3. 等待导出完成（约 1-2 分钟）

---

## 📊 训练参数说明

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| **基座模型** | deepseek-r1:1.5b | 新手推荐，速度快 |
| **训练轮数** | 3 | 数据量 < 100 用 1-3 轮 |
| **学习率** | 2e-4 | 保持默认即可 |
| **LoRA Rank** | 8 | 越大效果越好，但显存占用越高 |
| **LoRA Alpha** | 16 | 通常是 Rank 的 2 倍 |

### RTX 4060 推荐配置

```
✅ deepseek-r1:7b + LoRA Rank 8 = 约 6-7GB 显存
✅ qwen2.5:3b + LoRA Rank 16 = 约 4-5GB 显存
✅ deepseek-r1:1.5b + LoRA Rank 8 = 约 2-3GB 显存（最快）
```

---

## ⏱️ 训练时间参考

| 数据量 | 轮数 | deepseek-r1:1.5b | deepseek-r1:7b |
|--------|------|------------------|----------------|
| 10 条  | 1    | 2-3 分钟         | 5-8 分钟       |
| 100 条 | 3    | 15-20 分钟       | 40-60 分钟     |
| 500 条 | 3    | 1-1.5 小时       | 3-4 小时       |
| 1000 条| 5    | 3-4 小时         | 8-12 小时      |

---

## 🎯 制作自己的数据集

### 数据格式

每条数据包含三个字段：

```json
{
  "instruction": "任务描述（必填）",
  "input": "具体输入内容（可选，可以为空字符串）",
  "output": "期望的输出结果（必填）"
}
```

### 示例 1：问答型

```json
{
  "instruction": "回答问题",
  "input": "Python 和 JavaScript 的主要区别是什么？",
  "output": "主要区别包括：\n1. 用途：Python 主要用于数据分析、AI、后端；JavaScript 主要用于前端和全栈\n2. 语法：Python 使用缩进，JavaScript 使用大括号\n3. 类型：Python 是强类型，JavaScript 是弱类型\n4. 运行环境：Python 需要解释器，JavaScript 运行在浏览器或 Node.js 中"
}
```

### 示例 2：代码生成

```json
{
  "instruction": "编写一个 Python 函数",
  "input": "反转字符串",
  "output": "```python\ndef reverse_string(s):\n    \"\"\"\n    反转字符串\n    \n    参数:\n        s: 要反转的字符串\n    \n    返回:\n        反转后的字符串\n    \"\"\"\n    return s[::-1]\n\n# 示例\nprint(reverse_string(\"hello\"))  # 输出: olleh\n```"
}
```

### 示例 3：任务指令

```json
{
  "instruction": "将下列文本改写为正式语言",
  "input": "这个东西真的超级好用啊！",
  "output": "该产品功能优秀，使用体验良好。"
}
```

### 数据集质量检查清单

- [ ] 每条数据的 `instruction` 和 `output` 都不为空
- [ ] `output` 内容准确、完整、符合期望
- [ ] 数据格式统一（如代码块都用 \`\`\`，术语翻译一致）
- [ ] 覆盖多种场景（不要全是同一类问题）
- [ ] 至少 50-100 条数据（少于 50 条效果不明显）
- [ ] 包含正反例（告诉模型什么该做、什么不该做）

---

## ❓ 常见问题

### Q1: 训练时提示 "CUDA out of memory"

**解决方案：**
1. 降低 LoRA Rank（8 → 4）
2. 使用更小的模型（7b → 1.5b）
3. 关闭其他占用显存的程序

### Q2: 训练后效果不好

**可能原因：**
- 数据量太少（< 50 条）
- 数据质量差（格式不统一、有错误）
- 训练轮数不够（只训练了 1 轮）

**改进方法：**
1. 增加数据到 100-500 条
2. 人工审核每条数据
3. 增加训练轮数到 3-5 轮

### Q3: 找不到 Python 或 PyTorch

**解决方案：**
```bash
# 检查 Python
python --version

# 检查 PyTorch
python -c "import torch; print(torch.__version__)"

# 如果失败，重新运行安装脚本
python python\setup.py
```

### Q4: Ollama 导入失败

**解决方案：**
```bash
# 检查 Ollama 是否运行
ollama list

# 检查模型文件是否存在
cd E:\ai-chat-desktop\finetune\test_quick\merged
dir

# 手动导入
ollama create xiaoxiaoyu-test -f Modelfile
```

---

## 🎓 进阶技巧

### 1. 多次微调（持续学习）

```
基座模型 (deepseek-r1:7b)
  ↓ 第一次微调（100 条编程数据）
xiaoxiaoyu-v1
  ↓ 第二次微调（100 条中文写作数据）
xiaoxiaoyu-v2
  ↓ 第三次微调（100 条领域知识）
xiaoxiaoyu-v3
```

每次微调都在上次基础上进行。

### 2. 不同任务用不同模型

```
xiaoxiaoyu-coder     # 专门写代码
xiaoxiaoyu-writer    # 专门写文章
xiaoxiaoyu-translator # 专门翻译
xiaoxiaoyu-analyst   # 专门数据分析
```

根据任务切换模型。

### 3. A/B 测试对比

训练前后对比效果：
```bash
# 基座模型
ollama run deepseek-r1:7b

# 微调模型
ollama run xiaoxiaoyu-v1

# 输入相同的问题，对比回答质量
```

---

## 📚 下一步

- [ ] 阅读完整文档：`FINETUNE_README.md`
- [ ] 查看优化计划：`OPTIMIZATION_PLAN.md`
- [ ] 制作自己的数据集（100+ 条）
- [ ] 进行完整训练（3-5 轮）
- [ ] 测试和评估效果
- [ ] 持续改进数据集

---

## 🆘 获取帮助

遇到问题时：

1. **查看日志**
   ```
   E:\ai-chat-desktop\finetune\task_X\
   ```

2. **检查环境**
   ```bash
   python test_training.py
   # 会检查所有依赖
   ```

3. **验证数据**
   ```bash
   python -c "import json; print(json.load(open('datasets/example_dataset.json')))"
   ```

---

**🎉 祝你微调成功！打造属于自己的 AI 助手！**
