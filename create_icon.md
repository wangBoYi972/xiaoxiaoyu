# 创建应用图标

## 当前问题
- 图标存在但只有 16 色
- 可能显示不清晰或不显示

## 解决方案

### 方法 1：使用在线工具创建 ICO（推荐）

1. **设计 PNG 图标**
   - 尺寸：512x512 像素
   - 格式：PNG，透明背景
   - 内容：小小榆的 Logo

2. **转换为 ICO**
   访问：https://icoconvert.com/
   - 上传 PNG 图片
   - 选择多尺寸：16x16, 32x32, 48x48, 64x64, 128x128, 256x256
   - 下载 icon.ico

3. **替换图标**
   ```bash
   # 备份旧图标
   mv resources/icon.ico resources/icon.ico.bak
   
   # 放入新图标
   cp 下载的icon.ico resources/icon.ico
   
   # 重新打包
   npm run pack
   ```

### 方法 2：使用 ImageMagick 转换

```bash
# 安装 ImageMagick
# Windows: https://imagemagick.org/script/download.php

# 创建多尺寸 ICO
magick convert resources/icon.png \
  -resize 256x256 -depth 32 \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 16x16 \) \
  resources/icon.ico
```

### 方法 3：临时解决 - 刷新图标缓存

```bash
# 1. 删除 Windows 图标缓存
del /f /s /q /a %LocalAppData%\IconCache.db
del /f /s /q /a %LocalAppData%\Microsoft\Windows\Explorer\iconcache*

# 2. 重启 Windows 资源管理器
taskkill /f /im explorer.exe
start explorer.exe

# 3. 重新安装应用
```

---

## 快速修复

如果急用，可以：

1. **右键快捷方式 → 属性 → 更改图标**
   - 浏览到：E:\xioaxiaoyu\xiaoxiaoyu\resources\app\resources\icon.ico
   - 选择图标并应用

2. **固定到任务栏**
   - 右键应用 → 固定到任务栏
   - 再次右键任务栏图标 → 属性 → 更改图标

---

## 推荐的图标设计

**小小榆 Logo 建议：**
- 🌿 使用榆树叶元素
- 💚 绿色为主色调（代表自然、AI）
- 🤖 可加入简洁的 AI 符号
- 📐 简洁现代的设计风格

可以使用 AI 工具生成：
- DALL-E / Midjourney
- Canva
- Figma
