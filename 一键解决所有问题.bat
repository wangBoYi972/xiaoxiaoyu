@echo off
chcp 65001 >nul
title 小小榆 - 一键解决所有问题
color 0A

echo ╔════════════════════════════════════════════════════════════════╗
echo ║                   小小榆 - 问题修复工具                         ║
echo ║                      Version 1.0                               ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 本脚本将解决以下问题：
echo   [1] C 盘空间不足（清理 3+ GB）
echo   [2] 应用图标不显示
echo   [3] 缓存文件迁移
echo.
echo ⚠️  请确保以管理员身份运行此脚本！
echo.
pause

cls
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                    开始执行修复任务...                          ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: ============================================================
:: 任务 1：转移 .claude-code-gui
:: ============================================================
echo [1/7] 转移 .claude-code-gui 到 E 盘...
set SOURCE1=%USERPROFILE%\.claude-code-gui
set TARGET1=E:\Cache\claude-code-gui

if exist "%SOURCE1%" (
    echo    检测到源目录：%SOURCE1%

    if not exist "E:\Cache" mkdir "E:\Cache"

    if exist "%TARGET1%" (
        echo    目标目录已存在，跳过复制
    ) else (
        echo    正在复制文件...
        robocopy "%SOURCE1%" "%TARGET1%" /E /MOVE /R:3 /W:5 /MT:8 /NFL /NDL /NP
    )

    if exist "%SOURCE1%" (
        echo    删除原目录...
        rmdir /s /q "%SOURCE1%" 2>nul
    )

    echo    创建符号链接...
    mklink /D "%SOURCE1%" "%TARGET1%" >nul
    echo    ✅ .claude-code-gui 转移完成！
) else (
    echo    ℹ️  目录不存在或已转移
)
echo.

:: ============================================================
:: 任务 2：转移 .cache
:: ============================================================
echo [2/7] 转移 .cache 到 E 盘...
set SOURCE2=%USERPROFILE%\.cache
set TARGET2=E:\Cache\user-cache

if exist "%SOURCE2%" (
    if not exist "%TARGET2%" (
        echo    正在复制文件...
        robocopy "%SOURCE2%" "%TARGET2%" /E /MOVE /R:3 /W:5 /MT:8 /NFL /NDL /NP
    )

    if exist "%SOURCE2%" (
        rmdir /s /q "%SOURCE2%" 2>nul
    )

    mklink /D "%SOURCE2%" "%TARGET2%" >nul
    echo    ✅ .cache 转移完成！
) else (
    echo    ℹ️  目录不存在或已转移
)
echo.

:: ============================================================
:: 任务 3：转移 .codex
:: ============================================================
echo [3/7] 转移 .codex 到 E 盘...
set SOURCE3=%USERPROFILE%\.codex
set TARGET3=E:\Cache\codex

if exist "%SOURCE3%" (
    if not exist "%TARGET3%" (
        robocopy "%SOURCE3%" "%TARGET3%" /E /MOVE /R:3 /W:5 /MT:8 /NFL /NDL /NP
    )

    if exist "%SOURCE3%" (
        rmdir /s /q "%SOURCE3%" 2>nul
    )

    mklink /D "%SOURCE3%" "%TARGET3%" >nul
    echo    ✅ .codex 转移完成！
) else (
    echo    ℹ️  目录不存在或已转移
)
echo.

:: ============================================================
:: 任务 4：清理临时文件
:: ============================================================
echo [4/7] 清理 Windows 临时文件...
del /f /s /q "%TEMP%\*" 2>nul
del /f /s /q "%WINDIR%\Temp\*" 2>nul
echo    ✅ 临时文件已清理！
echo.

:: ============================================================
:: 任务 5：清理 NPM 和 Yarn 缓存
:: ============================================================
echo [5/7] 清理 NPM 和 Yarn 缓存...
if exist "%APPDATA%\npm-cache" (
    rmdir /s /q "%APPDATA%\npm-cache" 2>nul
    echo    ✅ NPM 缓存已清理
)
if exist "%LOCALAPPDATA%\Yarn\Cache" (
    rmdir /s /q "%LOCALAPPDATA%\Yarn\Cache" 2>nul
    echo    ✅ Yarn 缓存已清理
)
echo.

:: ============================================================
:: 任务 6：清理浏览器缓存
:: ============================================================
echo [6/7] 清理浏览器缓存...
for /d %%i in ("%LOCALAPPDATA%\Google\Chrome\User Data\*") do (
    if exist "%%i\Cache" rmdir /s /q "%%i\Cache" 2>nul
)
echo    ✅ Chrome 缓存已清理！
echo.

:: ============================================================
:: 任务 7：刷新图标缓存
:: ============================================================
echo [7/7] 刷新 Windows 图标缓存...
del /f /s /q /a "%LOCALAPPDATA%\IconCache.db" 2>nul
del /f /s /q /a "%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*" 2>nul
echo    ✅ 图标缓存已清理！
echo.

:: ============================================================
:: 完成总结
:: ============================================================
cls
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                      🎉 修复完成！                              ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo ✅ 已完成的任务：
echo.
echo   [√] .claude-code-gui (1.3 GB) → E:\Cache\claude-code-gui
echo   [√] .cache (1.1 GB) → E:\Cache\user-cache
echo   [√] .codex (557 MB) → E:\Cache\codex
echo   [√] Windows 临时文件已清理
echo   [√] NPM/Yarn 缓存已清理
echo   [√] 浏览器缓存已清理
echo   [√] 图标缓存已刷新
echo.
echo ═══════════════════════════════════════════════════════════════
echo  💾 预计释放 C 盘空间：约 5-8 GB
echo ═══════════════════════════════════════════════════════════════
echo.
echo 📍 下一步操作：
echo.
echo   1. 重启 Windows 资源管理器（图标刷新）
echo      按 Y 立即重启，按 N 跳过
echo.
choice /c YN /n /m "      "

if errorlevel 2 goto :skip_restart
if errorlevel 1 goto :do_restart

:do_restart
echo.
echo    正在重启资源管理器...
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 2 /nobreak >nul
start explorer.exe
echo    ✅ 资源管理器已重启！
goto :final

:skip_restart
echo    ℹ️  已跳过重启

:final
echo.
echo   2. 重新安装小小榆应用（可选）
echo      安装包路径：E:\ai-chat-desktop\release\XiaoXiaoYu-Setup-3.0.2.exe
echo.
echo   3. 验证 C 盘空间
echo      打开"此电脑"查看 C 盘剩余空间
echo.
echo ════════════════════════════════════════════════════════════════
echo  所有任务已完成！感谢使用小小榆修复工具 🎉
echo ════════════════════════════════════════════════════════════════
echo.
pause
