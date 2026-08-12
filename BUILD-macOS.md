# 小小榆 - macOS 构建指南

## 前提条件

- 一台 **Mac 电脑**（macOS 13+）
- 已安装 **Node.js v18+**
- 已安装 **Xcode Command Line Tools**: `xcode-select --install`

## 构建步骤

### 1. 从 Windows 电脑拷贝项目

把整个 `ai-chat-desktop` 文件夹复制到 Mac 上，或通过 Git：

```bash
# 如果用了 Git
git clone <你的仓库地址>
cd ai-chat-desktop
```

### 2. 安装依赖

```bash
npm install
```

> ⚠️ 国内网络慢的话，先设镜像：
> ```bash
> export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> npm install
> ```

### 3. 生成 macOS 图标

```bash
# 先放一张 512x512 以上的 PNG 图片到 resources/icon.png
# 然后运行：
bash scripts/generate-icons.sh
```

### 4. 构建 macOS 安装包

```bash
# 构建 ARM64（Apple Silicon M1/M2/M3/M4）
npm run pack:mac:arm64

# 构建 x64（Intel Mac）
npm run pack:mac:x64

# 构建通用版（同时支持 Intel + Apple Silicon）——推荐！
npm run pack:mac
```

### 5. 产物位置

```
release/
├── 小小榆-1.0.0-macOS.dmg       ← 双击安装
├── 小小榆-1.0.0-macOS.zip       ← 解压版
└── mac/
    └── 小小榆.app               ← 直接拖到 Applications 文件夹
```

## 分发方式

### DMG 安装包（推荐）

把 `release/小小榆-1.0.0-macOS.dmg` 发给用户，用户双击挂载后拖入 Applications 即可。

### ZIP 压缩包

把 `release/小小榆-1.0.0-macOS.zip` 发给用户，解压后得到 `.app`。

### 直接分发 .app

把 `release/mac/小小榆.app` 压缩成 zip 发给用户。

## 代码签名（可选）

如果要在 Mac App Store 分发或去掉 "未验证开发者" 警告，需要 Apple Developer 账号：

```bash
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
npm run pack:mac
```

## 与 Windows 版的差异

| 项目 | Windows | macOS |
|------|---------|-------|
| 图标格式 | icon.ico | icon.icns / icon.png |
| 安装包 | NSIS (.exe) | DMG (.dmg) |
| 窗口控制 | 自定义按钮 | 原生红绿灯 |
| 托盘图标 | icon.ico | icon.png |
| 快捷键 | Ctrl+Shift+空格 | Cmd+Shift+空格 |
| 窗口行为 | 关闭=隐藏到托盘 | 关闭=隐藏窗口（Dock保留） |
