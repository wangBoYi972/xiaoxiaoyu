@echo off
chcp 65001 >nul
echo ========================================
echo   小小榆 - 构建和打包
echo ========================================
echo.
echo 这将需要几分钟时间...
echo.

cd /d E:\ai-chat-desktop

echo [1/3] 清理旧构建...
if exist dist rmdir /s /q dist
if exist release rmdir /s /q release

echo [2/3] 构建应用...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ 构建失败！
    pause
    exit /b 1
)

echo [3/3] 打包应用...
call npm run pack
if %errorlevel% neq 0 (
    echo ❌ 打包失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ 打包完成！
echo ========================================
echo.
echo 安装包位置：
echo E:\ai-chat-desktop\release\
echo.
dir /b release\*.exe
echo.
echo 请安装新版本即可更新桌面应用
echo ========================================
pause
