#!/bin/bash
# macOS 图标生成脚本
# 用法: bash scripts/generate-icons.sh
# 需要: macOS + sips 命令 (内置)

SRC="resources/icon.png"
ICONSET="resources/icon.iconset"

if [ ! -f "$SRC" ]; then
  echo "错误: 找不到 $SRC"
  echo "请先把你的图标放到 resources/icon.png (至少 512x512)"
  exit 1
fi

echo "正在生成 macOS .icns 图标..."

# 创建 iconset 目录
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# 生成各种尺寸
sips -z 16 16   "$SRC" --out "${ICONSET}/icon_16x16.png"
sips -z 32 32   "$SRC" --out "${ICONSET}/icon_16x16@2x.png"
sips -z 32 32   "$SRC" --out "${ICONSET}/icon_32x32.png"
sips -z 64 64   "$SRC" --out "${ICONSET}/icon_32x32@2x.png"
sips -z 128 128 "$SRC" --out "${ICONSET}/icon_128x128.png"
sips -z 256 256 "$SRC" --out "${ICONSET}/icon_128x128@2x.png"
sips -z 256 256 "$SRC" --out "${ICONSET}/icon_256x256.png"
sips -z 512 512 "$SRC" --out "${ICONSET}/icon_256x256@2x.png"
sips -z 512 512 "$SRC" --out "${ICONSET}/icon_512x512.png"
sips -z 1024 1024 "$SRC" --out "${ICONSET}/icon_512x512@2x.png"

# 生成 icns
iconutil -c icns "$ICONSET" -o resources/icon.icns

# 清理临时目录
rm -rf "$ICONSET"

echo "✅ 已生成 resources/icon.icns"
echo "现在可以运行: npm run pack:mac"
