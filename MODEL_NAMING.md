# 小小榆模型命名规范

## 📝 命名逻辑

### 基座模型（Base Model）
**保持原名** - 用于表明来源和版本

例如：
- `deepseek-r1:7b` - DeepSeek-R1 7B 参数版本
- `deepseek-r1:1.5b` - DeepSeek-R1 1.5B 参数版本  
- `qwen2.5:7b` - Qwen2.5 7B 参数版本
- `qwen2.5:0.5b` - Qwen2.5 0.5B 参数版本

**作用：** 微调的起点，原始的预训练模型

---

### 微调模型（Fine-tuned Model）
**使用"小小榆"命名** - 这是你的专属模型

#### 推荐命名方案

**方案 1：版本号（推荐）**
```
xiaoxiaoyu-v1    # 第一版
xiaoxiaoyu-v2    # 第二版（改进）
xiaoxiaoyu-v3    # 第三版（持续优化）
```

**方案 2：用途分类**
```
xiaoxiaoyu-coder       # 编程助手
xiaoxiaoyu-writer      # 写作助手
xiaoxiaoyu-translator  # 翻译助手
xiaoxiaoyu-analyst     # 数据分析助手
```

**方案 3：领域专精**
```
xiaoxiaoyu-python      # Python 专家
xiaoxiaoyu-web         # Web 开发
xiaoxiaoyu-medical     # 医疗领域
xiaoxiaoyu-legal       # 法律领域
```

**方案 4：组合命名**
```
xiaoxiaoyu-coder-v1         # 编程助手第1版
xiaoxiaoyu-writer-v2        # 写作助手第2版
xiaoxiaoyu-python-advanced  # Python 高级版
```

---

## 🎯 当前配置

### 测试脚本默认
```python
# test_training.py
model_name: 'xiaoxiaoyu-v1'
```

### 界面显示
```
基座模型选择：
- DeepSeek-R1-7B（基座）
- DeepSeek-R1-1.5B（基座）
- Qwen2.5-7B（基座）
- Qwen2.5-0.5B（基座）

微调后模型：
- xiaoxiaoyu-v1（默认）
- xiaoxiaoyu-v2
- 或自定义名称
```

---

## 📊 示例对比

### 训练前
```bash
ollama list
# deepseek-r1:7b      4.7 GB    （基座模型）
# qwen2.5:0.5b        397 MB    （基座模型）
```

### 训练后
```bash
ollama list
# deepseek-r1:7b      4.7 GB    （基座模型，保持不变）
# qwen2.5:0.5b        397 MB    （基座模型，保持不变）
# xiaoxiaoyu-v1       4.8 GB    （你的专属模型！）
```

---

## 🔍 模型信息查看

### 查看模型详情
```bash
# 查看基座模型
ollama show deepseek-r1:7b

# 查看你的微调模型
ollama show xiaoxiaoyu-v1
```

### 对比测试
```bash
# 基座模型
ollama run deepseek-r1:7b
>>> 介绍你自己
[通用回答]

# 你的微调模型
ollama run xiaoxiaoyu-v1
>>> 介绍你自己
我是小小榆，一个运行在你电脑上的本地 AI 助手...
[定制化回答]
```

---

## 💡 命名建议

### ✅ 好的命名

```
xiaoxiaoyu-v1              # 清晰的版本号
xiaoxiaoyu-coder           # 明确的用途
xiaoxiaoyu-python-expert   # 具体的领域
my-assistant-v1            # 个性化名称
```

### ❌ 避免的命名

```
model1                     # 太模糊
test                       # 临时感太强
my_new_model_final_v2      # 太长
deepseek-custom            # 容易与基座混淆
```

---

## 🔄 版本演进示例

### 场景：打造编程助手

```
第1次训练（100条基础数据）
基座：deepseek-r1:1.5b
→ xiaoxiaoyu-coder-v1

第2次训练（+200条Python数据）
基座：xiaoxiaoyu-coder-v1
→ xiaoxiaoyu-coder-v2

第3次训练（+300条项目实战数据）
基座：xiaoxiaoyu-coder-v2
→ xiaoxiaoyu-coder-v3

最终：xiaoxiaoyu-coder-v3 是你专属的编程助手！
```

---

## 📋 在界面中使用

### 创建训练任务时

1. **基座模型**：选择 `DeepSeek-R1-7B（基座）`
2. **模型名称**：输入 `xiaoxiaoyu-v1`（或自定义）
3. **开始训练**
4. **训练完成后**：导出为 `xiaoxiaoyu-v1`

### 使用微调模型

1. 打开小小榆聊天界面
2. 点击模型选择器
3. 选择 `xiaoxiaoyu-v1`
4. 开始对话！

---

## 🎓 高级技巧

### 多模型管理

```bash
# 查看所有模型
ollama list

# 基座模型（保留）
deepseek-r1:7b
qwen2.5:0.5b

# 微调模型（你的作品）
xiaoxiaoyu-coder-v1      # 编程助手
xiaoxiaoyu-writer-v1     # 写作助手
xiaoxiaoyu-translator-v1 # 翻译助手

# 根据任务切换模型
ollama run xiaoxiaoyu-coder-v1      # 写代码时
ollama run xiaoxiaoyu-writer-v1     # 写文章时
ollama run xiaoxiaoyu-translator-v1 # 翻译时
```

### 模型重命名

```bash
# 如果想改名
ollama cp xiaoxiaoyu-v1 xiaoxiaoyu-coder-v1

# 删除旧名称
ollama rm xiaoxiaoyu-v1
```

---

## 📝 总结

- **基座模型** = 原始名称（deepseek-r1:7b, qwen2.5:0.5b）
- **微调模型** = 小小榆命名（xiaoxiaoyu-xxx）
- **推荐格式** = `xiaoxiaoyu-[用途]-v[版本]`

这样：
- ✅ 一眼就能分辨哪些是基座，哪些是你的模型
- ✅ 模型名称有意义，容易记忆
- ✅ 版本管理清晰，方便迭代

---

**🎉 现在，你的每个微调模型都是独一无二的"小小榆"！**
