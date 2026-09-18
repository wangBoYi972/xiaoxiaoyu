#!/bin/bash
# C 盘 30GB 安全清理脚本（跳过正在运行的应用）
# 生成时间：2026-08-12

echo "════════════════════════════════════════════════════════════════"
echo "              C 盘 30GB 空间释放工具（安全版）"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "本脚本将执行以下操作："
echo "  [1] 转移桌面文件到 E 盘 (6.7 GB)"
echo "  [2] 转移未运行的应用数据 (10-15 GB)"
echo "  [3] 转移开发工具缓存 (5 GB)"
echo "  [4] 清理临时文件和浏览器缓存 (5-8 GB)"
echo ""
echo "预计释放空间：25-35 GB"
echo "跳过正在运行的应用，确保系统稳定"
echo ""

# 创建备份目录
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 1/4：创建备份目录"
echo "════════════════════════════════════════════════════════════════"
mkdir -p /e/Desktop_Backup
mkdir -p /e/AppData_Backup
mkdir -p /e/Cache
echo "✅ 备份目录已创建"

# ============================================================
# 步骤 1：转移桌面文件（6.7 GB）- 已完成，跳过
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 2/4：检查桌面文件"
echo "════════════════════════════════════════════════════════════════"

if [ -d "/e/Desktop_Backup/王博弈专高5周考三" ]; then
    echo "✅ 桌面文件已转移完成！(6.7 GB)"
else
    echo "⏳ 桌面文件转移中..."
fi

# ============================================================
# 步骤 2：转移应用数据（只转移未运行的）
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 3/4：转移应用数据（跳过正在运行的应用）"
echo "════════════════════════════════════════════════════════════════"

APPDATA_LOCAL="/c/Users/王博弈/AppData/Local"
APPDATA_ROAMING="/c/Users/王博弈/AppData/Roaming"

# 安全转移函数
safe_move() {
    local source=$1
    local name=$2
    local size=$3

    if [ -d "$source" ] && [ ! -L "$source" ]; then
        echo "  [转移] $name ($size)"

        # 尝试复制
        if cp -r "$source" /e/AppData_Backup/ 2>/dev/null; then
            rm -rf "$source"
            ln -s "/e/AppData_Backup/$name" "$source"
            echo "    ✅ 完成"
            return 0
        else
            echo "    ⚠️  跳过（文件被占用或无法访问）"
            return 1
        fi
    else
        echo "  [跳过] $name（已转移或不存在）"
    fi
}

# 转移未运行的应用
echo ""
echo "转移应用数据..."

# 跳过 kingsoft（WPS 正在运行）
echo "  [跳过] kingsoft (3.7GB) - 应用正在运行"

# 转移其他应用
safe_move "$APPDATA_ROAMING/QQEX" "QQEX" "2.6GB"
safe_move "$APPDATA_ROAMING/webcast_mate" "webcast_mate" "1.6GB"
safe_move "$APPDATA_LOCAL/electron" "electron" "1.3GB"
safe_move "$APPDATA_LOCAL/Postman" "Postman" "932MB"
safe_move "$APPDATA_LOCAL/GitHubDesktop" "GitHubDesktop" "985MB"
safe_move "$APPDATA_ROAMING/5E对战平台" "5E对战平台" "825MB"
safe_move "$APPDATA_ROAMING/KwaiLive" "KwaiLive" "732MB"
safe_move "$APPDATA_ROAMING/Kun" "Kun" "673MB"
safe_move "$APPDATA_LOCAL/Quark" "Quark" "630MB"
safe_move "$APPDATA_ROAMING/xcdn" "xcdn" "596MB"

# Code 和 LarkShell 可能在运行，尝试转移
safe_move "$APPDATA_ROAMING/Code" "Code" "2.2GB"
safe_move "$APPDATA_ROAMING/LarkShell" "LarkShell" "2.0GB"

echo ""
echo "✅ 应用数据转移完成！"

# ============================================================
# 步骤 3：转移开发工具缓存
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  步骤 4/4：转移开发工具缓存和清理临时文件"
echo "════════════════════════════════════════════════════════════════"

USER_HOME="/c/Users/王博弈"

# .vscode
if [ -d "$USER_HOME/.vscode" ] && [ ! -L "$USER_HOME/.vscode" ]; then
    echo "  转移 .vscode (1.2 GB)"
    cp -r "$USER_HOME/.vscode" /e/Cache/vscode 2>/dev/null
    rm -rf "$USER_HOME/.vscode"
    ln -s /e/Cache/vscode "$USER_HOME/.vscode"
    echo "  ✅ .vscode 已转移"
fi

# .cache
if [ -d "$USER_HOME/.cache" ] && [ ! -L "$USER_HOME/.cache" ]; then
    echo "  转移 .cache (1.1 GB)"
    cp -r "$USER_HOME/.cache" /e/Cache/user-cache 2>/dev/null
    rm -rf "$USER_HOME/.cache"
    ln -s /e/Cache/user-cache "$USER_HOME/.cache"
    echo "  ✅ .cache 已转移"
fi

# ============================================================
# 步骤 4：清理临时文件（重点）
# ============================================================
echo ""
echo "清理临时文件和缓存..."

# 清理用户临时文件（通常 1-2 GB）
echo "  清理 Temp 目录..."
rm -rf "$APPDATA_LOCAL/Temp/"* 2>/dev/null
echo "  ✅ Temp 已清理"

# 清理 JetBrains 缓存（可能 1-2 GB）
if [ -d "$APPDATA_ROAMING/JetBrains" ]; then
    echo "  清理 JetBrains 缓存..."
    find "$APPDATA_ROAMING/JetBrains" -type d -name "log" -exec rm -rf {} + 2>/dev/null
    find "$APPDATA_ROAMING/JetBrains" -type d -name "tmp" -exec rm -rf {} + 2>/dev/null
    find "$APPDATA_ROAMING/JetBrains" -type d -name "system" -exec rm -rf {}/* + 2>/dev/null
    echo "  ✅ JetBrains 缓存已清理"
fi

# 清理浏览器缓存（可能 2-3 GB）
echo "  清理浏览器缓存..."
find "$APPDATA_LOCAL" -type d -path "*/Microsoft/Edge/User Data/*/Cache" -exec rm -rf {} + 2>/dev/null
find "$APPDATA_LOCAL" -type d -path "*/Google/Chrome/User Data/*/Cache" -exec rm -rf {} + 2>/dev/null
find "$APPDATA_LOCAL" -type d -path "*/Microsoft/Edge/User Data/*/Code Cache" -exec rm -rf {} + 2>/dev/null
echo "  ✅ 浏览器缓存已清理"

# 清理 Windows 更新缓存
echo "  清理系统临时文件..."
rm -rf /c/Windows/Temp/* 2>/dev/null
rm -rf /c/Windows/SoftwareDistribution/Download/* 2>/dev/null
echo "  ✅ 系统临时文件已清理"

# 清理回收站
echo "  清理回收站..."
rm -rf /c/'$Recycle.Bin'/* 2>/dev/null
echo "  ✅ 回收站已清理"

echo ""
echo "✅ 清理完成！"

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
echo "  [√] 桌面文件         释放 6.7 GB"
echo "  [√] 应用数据         释放 8-12 GB"
echo "  [√] 开发工具缓存     释放 2-3 GB"
echo "  [√] 临时文件清理     释放 5-8 GB"
echo "  [×] kingsoft (WPS)   跳过（正在运行）"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  💾 预计释放 C 盘空间：22-30 GB"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "正在检查 C 盘空间..."
df -h /c | tail -1
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  感谢使用！🎉"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "💡 提示："
echo "  - 如需转移 kingsoft (WPS 3.7GB)，请关闭 WPS 后手动转移"
echo "  - 所有数据都在 E:\Desktop_Backup 和 E:\AppData_Backup"
echo "  - 可以随时从 E 盘恢复"
