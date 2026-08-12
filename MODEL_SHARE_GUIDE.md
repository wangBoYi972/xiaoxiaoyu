# 小小榆模型分享方案

## 🎯 场景

你训练了 `xiaoxiaoyu-v1` 模型，想让别人也能使用。

---

## ❌ 直接分享安装包 - 不可行

**原因：**
- 安装包不包含模型文件（6GB+）
- Ollama 模型存储在用户本地
- 每台电脑需要独立配置

---

## ✅ 三种分享方案

### 方案 1：分享数据集（推荐）⭐⭐⭐⭐⭐

**适用场景：** 让别人训练出相同的模型

**步骤：**

1. **导出你的训练数据集**
   ```bash
   # 在小小榆中导出
   设置 → 模型微调 → 数据集编辑 → 导出 JSON
   ```

2. **分享文件**
   ```
   - 小小榆安装包 (471 MB)
   - 训练数据集.json (几十 KB)
   - 训练说明.md
   ```

3. **别人使用**
   ```
   1. 安装小小榆
   2. 安装 Ollama
   3. 下载基座模型：ollama pull deepseek-r1:1.5b
   4. 导入数据集
   5. 开始训练
   6. 得到自己的 xiaoxiaoyu-v1
   ```

**优点：**
- ✅ 文件小（几十 KB）
- ✅ 易于分享（邮件、聊天工具都可以）
- ✅ 别人可以自定义修改数据集
- ✅ 合法合规（不涉及模型版权）

**缺点：**
- ⏱ 需要训练时间（5-60 分钟）
- 💻 需要有显卡

---

### 方案 2：导出模型文件 ⭐⭐⭐

**适用场景：** 直接分享训练好的模型

**步骤：**

#### A. 导出模型（在你的电脑上）

```bash
# 1. 创建 Modelfile
ollama show xiaoxiaoyu-v1 --modelfile > xiaoxiaoyu-v1.Modelfile

# 2. 查看模型文件位置
ollama show xiaoxiaoyu-v1 --modelfile | grep "FROM"
# 输出：FROM E:\XiaoXiaoYuData\ollama\models\blobs\sha256-xxxxx

# 3. 打包
mkdir xiaoxiaoyu-v1-package
copy xiaoxiaoyu-v1.Modelfile xiaoxiaoyu-v1-package\
copy E:\XiaoXiaoYuData\ollama\models\blobs\sha256-xxxxx xiaoxiaoyu-v1-package\model

# 4. 修改 Modelfile
notepad xiaoxiaoyu-v1-package\xiaoxiaoyu-v1.Modelfile
# 将 FROM 路径改为：FROM ./model

# 5. 压缩
7z a xiaoxiaoyu-v1.7z xiaoxiaoyu-v1-package
```

#### B. 分享文件

```
- xiaoxiaoyu-v1.7z (约 1-2 GB 压缩后)
- 使用说明.txt
```

#### C. 别人导入（在别人电脑上）

```bash
# 1. 解压到任意目录
7z x xiaoxiaoyu-v1.7z

# 2. 导入到 Ollama
cd xiaoxiaoyu-v1-package
ollama create xiaoxiaoyu-v1 -f xiaoxiaoyu-v1.Modelfile

# 3. 使用
ollama run xiaoxiaoyu-v1
```

**优点：**
- ✅ 别人直接可用，无需训练
- ✅ 效果完全一致

**缺点：**
- ❌ 文件很大（1-5 GB）
- ❌ 难以分享（需要网盘）
- ⚠️ 可能涉及版权问题（基于 DeepSeek 模型）

---

### 方案 3：搭建云端服务 ⭐⭐⭐⭐

**适用场景：** 多人使用，不想每人都训练

**架构：**

```
你的服务器 (Ollama + xiaoxiaoyu-v1)
    ↓ API
小小榆应用（修改为调用远程 API）
```

**步骤：**

#### A. 部署服务器

```bash
# 1. 在服务器上安装 Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. 上传你的模型
scp xiaoxiaoyu-v1.7z user@server:/tmp
ssh user@server
cd /tmp
7z x xiaoxiaoyu-v1.7z
ollama create xiaoxiaoyu-v1 -f xiaoxiaoyu-v1.Modelfile

# 3. 启动 Ollama API 服务
ollama serve
# 默认监听：http://localhost:11434
```

#### B. 开放 API（配置 Nginx）

```nginx
server {
    listen 80;
    server_name api.xiaoxiaoyu.com;

    location / {
        proxy_pass http://localhost:11434;
    }
}
```

#### C. 修改小小榆应用

```typescript
// src/adapters/ollama.ts
const OLLAMA_BASE_URL = 
  process.env.OLLAMA_URL || 'https://api.xiaoxiaoyu.com';
```

#### D. 分享

```
- 小小榆安装包（已配置好 API 地址）
- 使用说明（告诉别人无需安装 Ollama）
```

**优点：**
- ✅ 别人无需安装 Ollama
- ✅ 无需训练，直接使用
- ✅ 集中管理，统一更新
- ✅ 可以控制访问权限

**缺点：**
- ❌ 需要服务器（成本）
- ❌ 需要带宽（多人同时用）
- ⚠️ 隐私问题（对话数据经过服务器）

---

## 📊 方案对比

| 维度 | 方案1：分享数据集 | 方案2：分享模型 | 方案3：云端服务 |
|------|------------------|----------------|----------------|
| **分享文件大小** | ✅ 几十 KB | ❌ 1-5 GB | ✅ 几百 MB |
| **使用难度** | ⭐⭐⭐ 需要训练 | ⭐⭐ 需要导入 | ⭐ 直接用 |
| **效果一致性** | ⭐⭐⭐⭐ 高度一致 | ⭐⭐⭐⭐⭐ 完全一致 | ⭐⭐⭐⭐⭐ 完全一致 |
| **成本** | ✅ 免费 | ✅ 免费 | ❌ 服务器费用 |
| **隐私性** | ✅ 完全本地 | ✅ 完全本地 | ⚠️ 数据经过服务器 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 💡 具体建议

### 如果是朋友/同事（少数人）
**推荐：方案 1（分享数据集）**
```
1. 导出训练数据集
2. 写一个简单的训练指南
3. 通过微信/邮件发送
```

### 如果是公开分享（很多人）
**推荐：方案 3（云端服务）**
```
1. 租一个云服务器（阿里云/腾讯云）
2. 部署 Ollama + 你的模型
3. 修改应用配置
4. 发布应用安装包
```

### 如果要商业使用
**推荐：方案 3 + 付费订阅**
```
1. 搭建专业 API 服务
2. 添加用户认证
3. 按量计费或订阅制
4. 提供 Web 版 + 客户端
```

---

## 🛠️ 实操：最简单的分享方式

**立即可行的方案：**

1. **导出数据集**
   ```bash
   小小榆 → 设置 → 微调训练 → 数据集编辑 → 选择数据集 → 导出 JSON
   ```

2. **创建分享包**
   ```
   xiaoxiaoyu-share/
   ├─ XiaoXiaoYu-Setup-3.0.0.exe  (安装包)
   ├─ 训练数据集.json              (你的数据)
   └─ 使用说明.txt                 (训练步骤)
   ```

3. **使用说明.txt 内容**
   ```
   小小榆微调模型使用指南

   1. 安装小小榆
      - 双击 XiaoXiaoYu-Setup-3.0.0.exe
      - 完成安装

   2. 安装 Ollama
      - 访问 https://ollama.ai
      - 下载并安装

   3. 下载基座模型
      - 打开命令行
      - 运行：ollama pull deepseek-r1:1.5b

   4. 导入数据集并训练
      - 启动小小榆
      - 设置 → 模型微调 → 数据集编辑 → 导入 JSON
      - 选择"训练数据集.json"
      - 切换到"微调训练"标签
      - 选择数据集，点击"开始训练"
      - 等待 5-30 分钟

   5. 使用模型
      - 训练完成后，模型名称：xiaoxiaoyu-v1
      - 在聊天界面切换到该模型即可使用
   ```

4. **压缩分享**
   ```bash
   7z a xiaoxiaoyu-share.7z xiaoxiaoyu-share
   # 上传到网盘或直接发送
   ```

---

**总结：推荐分享数据集，文件小、合规、易用！** 🎉
