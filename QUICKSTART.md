# 小小榆本地大模型改造 - 快速开始

## 🎯 5分钟快速体验

### 前提条件

✅ 已安装小小榆应用
✅ 电脑有 NVIDIA 显卡（RTX 4060 或更好）
✅ Windows 11 系统

---

## 📋 改造总结

### ✅ 已完成的改造（2024.08.12）

```
小小榆应用
├─ 💬 聊天功能（原有）
├─ 🤖 本地模型运行（已完成）
│   ├─ Ollama 集成
│   ├─ Qwen2.5-0.5B（已安装）
│   └─ DeepSeek-R1-1.5B（下载中）
│
└─ 🧪 微调训练模块（新增）
    ├─ 📊 数据集编辑器
    ├─ ⚙️  训练控制面板
    ├─ 🐍 Python 训练脚本
    └─ 📦 模型导出工具
```

---

## 🚀 立即开始

### 步骤1：测试本地模型（5分钟）

1. **启动小小榆**
2. **切换模型** → 选择 `qwen2.5:0.5b`
3. **开始对话**，测试完全离线 AI

✅ 如果能正常对话，说明本地化成功！

---

### 步骤2：查看微调模块（2分钟）

1. 点击**右上角"设置"图标**
2. 点击**"模型微调"按钮**（新增的蓝色按钮）
3. 你会看到：
   - 📊 **数据集编辑**标签页
   - ⚡ **微调训练**标签页
   - 🚀 **模型管理**标签页（待开发）

---

### 步骤3：准备训练环境（20分钟）

#### 3.1 安装 Python 依赖

打开命令行（Windows Terminal 或 PowerShell）：

```bash
# 进入小小榆目录
cd E:\ai-chat-desktop

# 安装依赖
python python\setup.py
```

**这将安装：**
- PyTorch（约 2GB）
- Transformers、PEFT、Datasets（约 1GB）
- BitsAndBytes（量化工具）
- TRL（训练工具）

**预计时间：15-30 分钟**（取决于网速）

#### 3.2 验证安装

```bash
python -c "import torch; print('PyTorch:', torch.__version__); print('CUDA:', torch.cuda.is_available())"
```

应该看到：
```
PyTorch: 2.x.x
CUDA: True
```

✅ 如果显示 `CUDA: True`，说明环境配置成功！

---

### 步骤4：第一次微调（30分钟）

#### 4.1 制作测试数据集

在小小榆界面：
1. 点击"设置" → "模型微调"
2. 切换到"数据集编辑"标签页
3. 点击"添加数据"
4. 添加 10-20 条测试数据（示例见下方）

**示例数据：**

```
指令：介绍你自己
输入：（留空）
输出：我是小小榆，一个运行在你电脑上的本地 AI 助手。我完全离线工作，你的数据不会上传到任何服务器。

---

指令：解释什么是大模型微调
输入：（留空）
输出：大模型微调是在预训练模型的基础上，使用特定领域的数据进行二次训练。就像是给一个已经会说话的人，教会他某个专业领域的知识。

---

指令：写一个 Python 函数
输入：计算两个数的和
输出：
def add(a, b):
    """计算两个数的和"""
    return a + b

# 示例
result = add(3, 5)
print(result)  # 输出: 8
```

#### 4.2 等待 DeepSeek-R1 下载完成

在命令行检查：

```bash
ollama list
```

如果看到 `deepseek-r1:1.5b`，说明下载完成！

#### 4.3 开始训练（目前需手动）

**当前版本需要在命令行手动训练**（界面自动化即将完成）：

```bash
cd E:\ai-chat-desktop\python

# 导出数据集（在小小榆界面点击"导出 JSON"）
# 假设导出到 E:\ai-chat-desktop\datasets\my_dataset.json

# 开始训练
python train.py \
  --base_model "deepseek-r1:1.5b" \
  --dataset "../datasets/my_dataset.json" \
  --output_dir "../finetune/test_1" \
  --model_name "xiaoxiaoyu-v1" \
  --epochs 3
```

**预计时间：**
- 10 条数据：5-10 分钟
- 100 条数据：30-60 分钟

#### 4.4 导出模型到 Ollama

训练完成后：

```bash
python export.py \
  --model_path "../finetune/test_1" \
  --model_name "xiaoxiaoyu-v1" \
  --base_model "deepseek-r1:1.5b" \
  --format ollama
```

#### 4.5 测试你的模型

```bash
ollama run xiaoxiaoyu-v1
```

输入：`介绍你自己`

应该看到你训练的回答！

---

## 📊 改造成果对比

### 改造前 vs 改造后

| 功能 | 改造前 | 改造后 |
|------|--------|--------|
| **AI 能力** | 依赖云端 API | ✅ 完全本地运行 |
| **隐私安全** | 数据上传云端 | ✅ 数据不出本地 |
| **使用成本** | 按量付费 | ✅ 零成本 |
| **离线使用** | ❌ 需要联网 | ✅ 断网可用 |
| **模型定制** | ❌ 不可修改 | ✅ 可微调训练 |
| **智能进化** | ❌ 固定能力 | ✅ 持续学习 |

### 硬件要求

| 配置 | 最低要求 | 推荐配置 |
|------|---------|---------|
| **显卡** | RTX 3060 (8GB) | RTX 4060 (8GB) |
| **内存** | 16GB | 32GB |
| **硬盘** | 20GB 可用空间 | 50GB SSD |
| **系统** | Windows 10 | Windows 11 |

---

## 🎯 实际应用场景

### 1. 个人知识助手

**数据来源：**
- 你的笔记、文档
- 工作中的邮件、报告
- 学习资料、论文

**微调后：**
- 回答符合你的知识体系
- 引用你收藏的资料
- 使用你习惯的术语

### 2. 编程助手

**数据来源：**
- 你的代码仓库
- 常用代码片段
- 项目文档

**微调后：**
- 生成符合团队规范的代码
- 使用项目已有的技术栈
- 注释风格统一

### 3. 写作助手

**数据来源：**
- 你写过的文章
- 喜欢的写作风格
- 专业术语库

**微调后：**
- 模仿你的写作风格
- 使用你的行文结构
- 专业术语准确

### 4. 客服机器人

**数据来源：**
- 产品文档
- 常见问题 FAQ
- 历史工单

**微调后：**
- 准确回答产品问题
- 符合公司话术规范
- 自动处理常见咨询

---

## 💡 使用技巧

### 数据集质量提升

#### ❌ 低质量数据
```json
{
  "instruction": "写代码",
  "output": "function test() { return 1; }"
}
```

#### ✅ 高质量数据
```json
{
  "instruction": "编写一个 JavaScript 函数计算数组平均值",
  "input": "要求：处理空数组、非数字元素、保留两位小数",
  "output": "/**\n * 计算数组平均值\n * @param {number[]} arr - 数字数组\n * @returns {number} 平均值（保留两位小数）\n */\nfunction calculateAverage(arr) {\n  // 过滤非数字元素\n  const numbers = arr.filter(x => typeof x === 'number' && !isNaN(x));\n  \n  // 处理空数组\n  if (numbers.length === 0) return 0;\n  \n  // 计算平均值\n  const sum = numbers.reduce((acc, val) => acc + val, 0);\n  const avg = sum / numbers.length;\n  \n  // 保留两位小数\n  return Math.round(avg * 100) / 100;\n}\n\n// 测试用例\nconsole.log(calculateAverage([1, 2, 3, 4, 5])); // 3\nconsole.log(calculateAverage([1, 'a', 3])); // 2\nconsole.log(calculateAverage([])); // 0"
}
```

**区别：**
- ✅ 详细的需求说明
- ✅ 完整的代码注释
- ✅ 边界情况处理
- ✅ 测试用例

---

## 🐛 常见问题排查

### 问题1：训练时显存不足

**错误信息：**
```
RuntimeError: CUDA out of memory
```

**解决方案：**

1. **降低 LoRA Rank**
   ```bash
   --lora_r 4  # 从 8 降到 4
   ```

2. **减少序列长度**
   编辑 `train.py`，找到：
   ```python
   max_length=512  # 改成 256
   ```

3. **使用更小的模型**
   ```bash
   --base_model "qwen2.5:0.5b"  # 从 1.5B 降到 0.5B
   ```

### 问题2：训练速度太慢

**现象：** 1 小时才训练 100 条

**解决方案：**

1. **检查是否用了 GPU**
   ```bash
   python -c "import torch; print(torch.cuda.is_available())"
   ```
   如果是 `False`，重新安装 CUDA 版本的 PyTorch

2. **增加梯度累积**
   ```bash
   gradient_accumulation_steps=8  # 从 4 改到 8
   ```

3. **减少训练轮数（先快速验证）**
   ```bash
   --epochs 1  # 先用 1 轮测试
   ```

### 问题3：训练后效果不好

**现象：** 模型回答还是很通用，没有学到数据集内容

**原因分析：**
- ❌ 数据量太少（< 50 条）
- ❌ 训练轮数不够（Epochs = 1）
- ❌ 学习率太小

**解决方案：**

1. **增加数据量到 200-500 条**
2. **增加训练轮数**
   ```bash
   --epochs 5  # 从 3 改到 5
   ```
3. **调整学习率**
   ```bash
   --learning_rate 3e-4  # 从 2e-4 调到 3e-4
   ```

---

## 📈 进阶改进（待实现）

### 即将添加的功能

- [ ] **界面化训练**：点击按钮启动，不需要命令行
- [ ] **实时进度显示**：Loss 曲线、ETA 时间
- [ ] **模型对比工具**：A/B 测试微调效果
- [ ] **自动数据增强**：AI 自动生成更多训练数据
- [ ] **模型版本管理**：回退到之前的版本
- [ ] **一键部署**：导出为独立 API 服务

---

## 🎓 学习资源

### 了解原理

- **QLoRA 论文**：https://arxiv.org/abs/2305.14314
- **LoRA 原理讲解**：https://www.youtube.com/watch?v=XXX
- **大模型微调实战**：https://huggingface.co/docs/peft

### 社区交流

- **Ollama 社区**：https://ollama.ai/discord
- **Hugging Face 论坛**：https://discuss.huggingface.co
- **本项目 Issues**：（待开源后添加）

---

## 📝 更新日志

### 2024.08.12 - 阶段1+阶段2 完成

**新增功能：**
- ✅ 本地模型运行（Ollama 集成）
- ✅ 数据集编辑器界面
- ✅ 训练控制面板界面
- ✅ QLoRA 微调脚本（Python）
- ✅ 模型导出工具
- ✅ 后端 IPC 完整支持

**已下载模型：**
- ✅ Qwen2.5-0.5B（可用）
- 🔄 DeepSeek-R1-1.5B（下载中）

**待完成：**
- [ ] 界面自动化训练（不需要命令行）
- [ ] 实时训练进度显示
- [ ] 模型性能对比工具

---

## 🎉 总结

### 你现在拥有的能力

✅ **完全本地化的 AI 助手**
- 不依赖任何云服务
- 数据完全私密
- 永久免费使用

✅ **可自我训练的模型**
- 用你的数据微调
- 专属于你的 AI
- 持续进化

✅ **专业级开发环境**
- QLoRA 微调
- 模型导出
- 完整工具链

### 下一步行动

1. **立即测试**：按照上面的步骤操作一遍
2. **制作数据集**：收集 100-500 条高质量数据
3. **开始微调**：训练你的第一个专属模型
4. **持续改进**：根据使用反馈不断优化

---

**🚀 开始你的本地大模型之旅吧！**

有任何问题，请查看完整文档：`FINETUNE_README.md`
