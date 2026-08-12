#!/bin/bash
cd "$(dirname "$0")"
echo "========================================="
echo "  小小榆 - Mac 安装器"
echo "========================================="
echo ""
echo "  Step 1: 安装所有依赖 (1-3分钟)..."
npm install 2>&1 | tail -5
echo ""
echo "  Step 2: 生成图标..."
bash scripts/generate-icons.sh 2>/dev/null
echo ""
echo "  Step 3: 构建前端..."
npx vite build 2>&1 | tail -3
echo ""
echo "  Step 4: 编译主进程..."
npx tsc -p tsconfig.main.json 2>&1 | tail -3
echo ""
echo "  Step 5: 打包 macOS 安装包..."
npx electron-builder --mac 2>&1 | tail -5
echo ""
echo "========================================="
echo "  完成！"
echo ""
echo "  安装包位置: release/"
echo "  DMG文件: release/小小榆-*.dmg"
echo "  APP文件: release/mac/小小榆.app"
echo "========================================="
open release/
