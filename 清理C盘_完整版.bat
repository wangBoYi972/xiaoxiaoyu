@echo off
chcp 65001 >nul
echo ========================================
echo   C 盘空间清理 - 转移到 E 盘
echo ========================================
echo.
echo 当前 C 盘使用：181/201 GB (91%%)
echo.
echo 将要清理和转移的内容：
echo   1. .android (6.09 GB) - Android SDK
echo   2. .claude-code-gui (1.24 GB) - Claude 缓存
echo   3. .cache (1.01 GB) - 各种缓存
echo   4. .codex (0.53 GB) - 其他缓存
echo   5. AppData\Local\Temp - 临时文件
echo   6. npm-cache - NPM 缓存
echo.
echo 预计释放空间：约 10-15 GB
echo.
pause

REM ============================================
echo.
echo [1/6] 清理临时文件...
echo ----------------------------------------
rd /s /q "C:\Users\%USERNAME%\AppData\Local\Temp" 2>nul
mkdir "C:\Users\%USERNAME%\AppData\Local\Temp"
echo ✅ 临时文件已清理
echo.

REM ============================================
echo [2/6] 转移 Android SDK...
echo ----------------------------------------
if exist "C:\Users\%USERNAME%\.android" (
    if not exist "E:\DevTools\android" mkdir "E:\DevTools\android"
    echo 正在移动 Android SDK (6 GB)...
    robocopy "C:\Users\%USERNAME%\.android" "E:\DevTools\android" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if exist "C:\Users\%USERNAME%\.android" (
        rmdir /s /q "C:\Users\%USERNAME%\.android"
    )
    mklink /J "C:\Users\%USERNAME%\.android" "E:\DevTools\android"
    echo ✅ Android SDK 已转移到 E:\DevTools\android
) else (
    echo ℹ️  未找到 .android 目录
)
echo.

REM ============================================
echo [3/6] 转移 Claude 缓存...
echo ----------------------------------------
if exist "C:\Users\%USERNAME%\.claude-code-gui" (
    if not exist "E:\Cache\claude-code-gui" mkdir "E:\Cache\claude-code-gui"
    echo 正在移动 Claude 缓存 (1.24 GB)...
    robocopy "C:\Users\%USERNAME%\.claude-code-gui" "E:\Cache\claude-code-gui" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if exist "C:\Users\%USERNAME%\.claude-code-gui" (
        rmdir /s /q "C:\Users\%USERNAME%\.claude-code-gui"
    )
    mklink /J "C:\Users\%USERNAME%\.claude-code-gui" "E:\Cache\claude-code-gui"
    echo ✅ Claude 缓存已转移到 E:\Cache\claude-code-gui
) else (
    echo ℹ️  未找到 .claude-code-gui 目录
)
echo.

REM ============================================
echo [4/6] 转移通用缓存...
echo ----------------------------------------
if exist "C:\Users\%USERNAME%\.cache" (
    if not exist "E:\Cache\user-cache" mkdir "E:\Cache\user-cache"
    echo 正在移动通用缓存 (1.01 GB)...
    robocopy "C:\Users\%USERNAME%\.cache" "E:\Cache\user-cache" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if exist "C:\Users\%USERNAME%\.cache" (
        rmdir /s /q "C:\Users\%USERNAME%\.cache"
    )
    mklink /J "C:\Users\%USERNAME%\.cache" "E:\Cache\user-cache"
    echo ✅ 通用缓存已转移到 E:\Cache\user-cache
) else (
    echo ℹ️  未找到 .cache 目录
)
echo.

REM ============================================
echo [5/6] 转移 Codex 缓存...
echo ----------------------------------------
if exist "C:\Users\%USERNAME%\.codex" (
    if not exist "E:\Cache\codex" mkdir "E:\Cache\codex"
    echo 正在移动 Codex 缓存 (0.53 GB)...
    robocopy "C:\Users\%USERNAME%\.codex" "E:\Cache\codex" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if exist "C:\Users\%USERNAME%\.codex" (
        rmdir /s /q "C:\Users\%USERNAME%\.codex"
    )
    mklink /J "C:\Users\%USERNAME%\.codex" "E:\Cache\codex"
    echo ✅ Codex 缓存已转移到 E:\Cache\codex
) else (
    echo ℹ️  未找到 .codex 目录
)
echo.

REM ============================================
echo [6/6] 清理其他缓存...
echo ----------------------------------------

REM NPM 缓存
if exist "C:\Users\%USERNAME%\AppData\Local\npm-cache" (
    echo 正在清理 NPM 缓存...
    rd /s /q "C:\Users\%USERNAME%\AppData\Local\npm-cache" 2>nul
    echo ✅ NPM 缓存已清理
)

REM Yarn 缓存
if exist "C:\Users\%USERNAME%\AppData\Local\Yarn" (
    echo 正在清理 Yarn 缓存...
    rd /s /q "C:\Users\%USERNAME%\AppData\Local\Yarn\Cache" 2>nul
    echo ✅ Yarn 缓存已清理
)

REM VS Code 缓存
if exist "C:\Users\%USERNAME%\AppData\Roaming\Code\Cache" (
    echo 正在清理 VS Code 缓存...
    rd /s /q "C:\Users\%USERNAME%\AppData\Roaming\Code\Cache" 2>nul
    rd /s /q "C:\Users\%USERNAME%\AppData\Roaming\Code\CachedData" 2>nul
    echo ✅ VS Code 缓存已清理
)

REM Chrome 缓存
if exist "C:\Users\%USERNAME%\AppData\Local\Google\Chrome\User Data\Default\Cache" (
    echo 正在清理 Chrome 缓存...
    rd /s /q "C:\Users\%USERNAME%\AppData\Local\Google\Chrome\User Data\Default\Cache" 2>nul
    echo ✅ Chrome 缓存已清理
)

echo.

REM ============================================
echo [验证] 检查 C 盘空间...
echo ----------------------------------------
echo.
wmic logicaldisk where "DeviceID='C:'" get FreeSpace,Size /format:list | findstr /r "[0-9]"
echo.

REM ============================================
echo ========================================
echo ✅ 清理完成！
echo ========================================
echo.
echo 📊 转移总结：
echo   ✅ Android SDK (6 GB) → E:\DevTools\android
echo   ✅ Claude 缓存 (1.24 GB) → E:\Cache\claude-code-gui
echo   ✅ 通用缓存 (1 GB) → E:\Cache\user-cache
echo   ✅ Codex 缓存 (0.53 GB) → E:\Cache\codex
echo   ✅ 临时文件已清理
echo   ✅ NPM/Yarn/VSCode/Chrome 缓存已清理
echo.
echo 💾 预计释放空间：10-15 GB
echo.
echo 📁 新的存储位置：
echo   E:\DevTools\android\    (Android SDK)
echo   E:\Cache\               (各种缓存)
echo   E:\XiaoXiaoYuData\      (Ollama 模型)
echo.
echo ⚠️  注意事项：
echo   1. C 盘上保留了符号链接，应用正常使用
echo   2. 请勿删除 E 盘上的目录
echo   3. 以后这些数据会自动存到 E 盘
echo.
echo ========================================
pause
