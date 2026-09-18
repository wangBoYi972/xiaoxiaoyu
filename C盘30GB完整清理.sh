#!/bin/bash
# C 盘 30GB 完整清理脚本
# 生成时间：2026-08-12

echo "════════════════════════════════════════════════════════════════"
echo "              C 盘 30GB 空间释放工具"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "本脚本将执行以下操作："
echo "  [1] 转移桌面文件到 E 盘 (6.7 GB)"
echo "  [2] 转移应用数据到 E 盘 (15-18 GB)"
echo "  [3] 转移开发工具缓存 (5 GB)"
echo "  [4] 清理临时文件 (2-3 GB)"
echo ""
echo "预计释放空间：30-35 GB"
echo ""
read -p "按 Enter 继续，Ctrl+C 取消..."

# 创建备份目录
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 1/4：创建备份目录"
echo "════════════════════════════════════════════════════════════════"
mkdir -p /e/Desktop_Backup
mkdir -p /e/AppData_Backup
mkdir -p /e/Cache
echo "✅ 备份目录已创建"

# ============================================================
# 步骤 1：转移桌面文件（6.7 GB）
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 2/4：转移桌面文件 (6.7 GB)"
echo "════════════════════════════════════════════════════════════════"

DESKTOP="/c/Users/王博弈/Desktop"
files_to_move=(
    "王博弈专高5周考三"
    "xm"
    "时迹"
    "王博弈专高5周考二"
    "王博弈专高5周考1"
    "ngrok"
    "natapp_windows_amd64_2_4_0"
)

for file in "${files_to_move[@]}"; do
    if [ -e "$DESKTOP/$file" ]; then
        echo "  转移: $file"
        mv "$DESKTOP/$file" /e/Desktop_Backup/
    fi
done

# 创建桌面快捷方式
if [ ! -e "$DESKTOP/学习资料(E盘)" ]; then
    ln -s /e/Desktop_Backup "$DESKTOP/学习资料(E盘)"
    echo "  ✅ 已创建桌面快捷方式"
fi

echo "✅ 桌面文件转移完成！释放约 6.7 GB"

# ============================================================
# 步骤 2：转移应用数据（15-18 GB）
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 3/4：转移应用数据 (15-18 GB)"
echo "════════════════════════════════════════════════════════════════"
echo "  ⏳ 这个步骤可能需要 10-15 分钟..."

APPDATA_LOCAL="/c/Users/王博弈/AppData/Local"
APPDATA_ROAMING="/c/Users/王博弈/AppData/Roaming"

# 转移函数
move_appdata() {
    local source=$1
    local name=$2
    local size=$3

    if [ -d "$source" ] && [ ! -L "$source" ]; then
        echo "  [转移] $name ($size)"
        cp -r "$source" /e/AppData_Backup/
        rm -rf "$source"
        ln -s "/e/AppData_Backup/$name" "$source"
        echo "    ✅ 完成"
    fi
}

# Roaming 目录
echo ""
echo "转移 Roaming 应用数据..."
move_appdata "$APPDATA_ROAMING/kingsoft" "kingsoft" "3.7GB"
move_appdata "$APPDATA_ROAMING/QQEX" "QQEX" "2.6GB"
move_appdata "$APPDATA_ROAMING/Code" "Code" "2.2GB"
move_appdata "$APPDATA_ROAMING/LarkShell" "LarkShell" "2.0GB"
move_appdata "$APPDATA_ROAMING/webcast_mate" "webcast_mate" "1.6GB"
move_appdata "$APPDATA_ROAMING/5E对战平台" "5E对战平台" "825MB"
move_appdata "$APPDATA_ROAMING/KwaiLive" "KwaiLive" "732MB"
move_appdata "$APPDATA_ROAMING/Kun" "Kun" "673MB"
move_appdata "$APPDATA_ROAMING/xcdn" "xcdn" "596MB"

# Local 目录
echo ""
echo "转移 Local 应用数据..."
move_appdata "$APPDATA_LOCAL/electron" "electron" "1.3GB"
move_appdata "$APPDATA_LOCAL/Postman" "Postman" "932MB"
move_appdata "$APPDATA_LOCAL/GitHubDesktop" "GitHubDesktop" "985MB"
move_appdata "$APPDATA_LOCAL/Quark" "Quark" "630MB"

echo ""
echo "✅ 应用数据转移完成！释放约 15-18 GB"

# ============================================================
# 步骤 3：转移开发工具缓存（5 GB）
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 4/4：转移开发工具缓存 (5 GB)"
echo "════════════════════════════════════════════════════════════════"

USER_HOME="/c/Users/王博弈"

# .vscode
if [ -d "$USER_HOME/.vscode" ] && [ ! -L "$USER_HOME/.vscode" ]; then
    echo "  转移 .vscode (1.2 GB)"
    cp -r "$USER_HOME/.vscode" /e/Cache/vscode
    rm -rf "$USER_HOME/.vscode"
    ln -s /e/Cache/vscode "$USER_HOME/.vscode"
    echo "  ✅ .vscode 已转移"
fi

# .cache (如果还没转移)
if [ -d "$USER_HOME/.cache" ] && [ ! -L "$USER_HOME/.cache" ]; then
    echo "  转移 .cache (1.1 GB)"
    cp -r "$USER_HOME/.cache" /e/Cache/user-cache
    rm -rf "$USER_HOME/.cache"
    ln -s /e/Cache/user-cache "$USER_HOME/.cache"
    echo "  ✅ .cache 已转移"
fi

echo "✅ 开发工具缓存转移完成！释放约 5 GB"

# ============================================================
# 步骤 4：清理临时文件和缓存（2-3 GB）
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  额外清理：临时文件和缓存 (2-3 GB)"
echo "════════════════════════════════════════════════════════════════"

# 清理用户临时文件
echo "  清理 Temp 目录..."
rm -rf "$APPDATA_LOCAL/Temp/"* 2>/dev/null
echo "  ✅ 临时文件已清理"

# 清理 JetBrains 日志和临时文件
if [ -d "$APPDATA_ROAMING/JetBrains" ]; then
    echo "  清理 JetBrains 缓存..."
    find "$APPDATA_ROAMING/JetBrains" -type d -name "log" -exec rm -rf {} + 2>/dev/null
    find "$APPDATA_ROAMING/JetBrains" -type d -name "tmp" -exec rm -rf {} + 2>/dev/null
    echo "  ✅ JetBrains 缓存已清理"
fi

# 清理浏览器缓存
echo "  清理浏览器缓存..."
find "$APPDATA_LOCAL/Microsoft/Edge/User Data" -type d -name "Cache" -exec rm -rf {} + 2>/dev/null
find "$APPDATA_LOCAL/Google/Chrome/User Data" -type d -name "Cache" -exec rm -rf {} + 2>/dev/null
echo "  ✅ 浏览器缓存已清理"

echo "✅ 额外清理完成！释放约 2-3 GB"

# ============================================================
# 完成总结
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "              🎉 清理完成！"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 已完成的任务："
echo ""
echo "  [√] 桌面文件       → E:\Desktop_Backup      (6.7 GB)"
echo "  [√] 应用数据       → E:\AppData_Backup     (15-18 GB)"
echo "  [√] 开发工具缓存   → E:\Cache              (5 GB)"
echo "  [√] 临时文件清理   →                       (2-3 GB)"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  💾 预计释放 C 盘空间：30-35 GB"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📍 数据位置："
echo "  - E:\Desktop_Backup   (桌面文件)"
echo "  - E:\AppData_Backup   (应用数据)"
echo "  - E:\Cache            (缓存数据)"
echo ""
echo "📍 桌面快捷方式："
echo "  - 学习资料(E盘) → E:\Desktop_Backup"
echo ""
echo "⚠️  如需恢复，删除符号链接并从 E 盘复制回来即可"
echo ""
echo "正在检查 C 盘空间..."
df -h /c | tail -1
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  感谢使用！🎉"
echo "════════════════════════════════════════════════════════════════"
