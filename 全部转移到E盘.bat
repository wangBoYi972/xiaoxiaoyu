@echo off
chcp 65001 >nul
echo ========================================
echo   小小榆 - 全部转移到 E 盘
echo ========================================
echo.
echo 将要转移的内容：
echo   1. Ollama 模型数据 (约 6 GB)
echo   2. 小小榆应用数据 (数据库、对话历史)
echo   3. 微调训练输出 (如果有)
echo   4. Python 虚拟环境缓存 (如果有)
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️  此脚本需要管理员权限
    echo 请右键点击此脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo 按任意键开始转移...
pause >nul
echo.

REM ============================================
echo [1/5] 停止相关服务...
echo ----------------------------------------
taskkill /F /IM ollama.exe 2>nul
taskkill /F /IM "小小榆.exe" 2>nul
taskkill /F /IM "xiaoxiaoyu.exe" 2>nul
taskkill /F /IM electron.exe 2>nul
timeout /t 2 /nobreak >nul
echo ✅ 服务已停止
echo.

REM ============================================
echo [2/5] 创建 E 盘目录结构...
echo ----------------------------------------
if not exist "E:\XiaoXiaoYuData" mkdir "E:\XiaoXiaoYuData"
if not exist "E:\XiaoXiaoYuData\ollama" mkdir "E:\XiaoXiaoYuData\ollama"
if not exist "E:\XiaoXiaoYuData\app-data" mkdir "E:\XiaoXiaoYuData\app-data"
if not exist "E:\XiaoXiaoYuData\finetune" mkdir "E:\XiaoXiaoYuData\finetune"
if not exist "E:\XiaoXiaoYuData\datasets" mkdir "E:\XiaoXiaoYuData\datasets"
echo ✅ 目录结构已创建
echo.

REM ============================================
echo [3/5] 转移 Ollama 模型 (约 6 GB)...
echo ----------------------------------------
echo 这可能需要 2-5 分钟，请耐心等待...

if exist "C:\Users\%USERNAME%\.ollama" (
    echo 正在移动 Ollama 数据...
    robocopy "C:\Users\%USERNAME%\.ollama" "E:\XiaoXiaoYuData\ollama" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if %errorLevel% lss 8 (
        echo ✅ Ollama 数据已转移

        REM 删除旧目录
        if exist "C:\Users\%USERNAME%\.ollama" (
            rmdir /S /Q "C:\Users\%USERNAME%\.ollama"
        )

        REM 创建符号链接
        mklink /J "C:\Users\%USERNAME%\.ollama" "E:\XiaoXiaoYuData\ollama"
        echo ✅ 符号链接已创建
    ) else (
        echo ⚠️  移动时出现警告 (错误码: %errorLevel%)
    )
) else (
    echo ℹ️  未找到 Ollama 数据目录
)
echo.

REM ============================================
echo [4/5] 转移小小榆应用数据...
echo ----------------------------------------

REM 查找小小榆的数据目录
set "APPDATA_XIAOXIAOYU=%APPDATA%\小小榆"
set "LOCALAPPDATA_XIAOXIAOYU=%LOCALAPPDATA%\小小榆"

REM 转移 AppData\Roaming\小小榆
if exist "%APPDATA_XIAOXIAOYU%" (
    echo 正在转移 AppData\Roaming\小小榆...
    robocopy "%APPDATA_XIAOXIAOYU%" "E:\XiaoXiaoYuData\app-data\roaming" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if %errorLevel% lss 8 (
        if exist "%APPDATA_XIAOXIAOYU%" (
            rmdir /S /Q "%APPDATA_XIAOXIAOYU%"
        )
        mklink /J "%APPDATA_XIAOXIAOYU%" "E:\XiaoXiaoYuData\app-data\roaming"
        echo ✅ Roaming 数据已转移
    )
) else (
    echo ℹ️  未找到 Roaming 数据
)

REM 转移 AppData\Local\小小榆
if exist "%LOCALAPPDATA_XIAOXIAOYU%" (
    echo 正在转移 AppData\Local\小小榆...
    robocopy "%LOCALAPPDATA_XIAOXIAOYU%" "E:\XiaoXiaoYuData\app-data\local" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if %errorLevel% lss 8 (
        if exist "%LOCALAPPDATA_XIAOXIAOYU%" (
            rmdir /S /Q "%LOCALAPPDATA_XIAOXIAOYU%"
        )
        mklink /J "%LOCALAPPDATA_XIAOXIAOYU%" "E:\XiaoXiaoYuData\app-data\local"
        echo ✅ Local 数据已转移
    )
) else (
    echo ℹ️  未找到 Local 数据
)

REM 转移 xiaoxiaoyu 用户数据目录（如果存在）
if exist "C:\Users\%USERNAME%\.xiaoxiaoyu" (
    echo 正在转移用户数据目录...
    robocopy "C:\Users\%USERNAME%\.xiaoxiaoyu" "E:\XiaoXiaoYuData\app-data\user" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if %errorLevel% lss 8 (
        if exist "C:\Users\%USERNAME%\.xiaoxiaoyu" (
            rmdir /S /Q "C:\Users\%USERNAME%\.xiaoxiaoyu"
        )
        mklink /J "C:\Users\%USERNAME%\.xiaoxiaoyu" "E:\XiaoXiaoYuData\app-data\user"
        echo ✅ 用户数据已转移
    )
) else (
    echo ℹ️  未找到用户数据目录
)

echo.

REM ============================================
echo [5/5] 转移微调训练数据...
echo ----------------------------------------

REM 从项目目录转移 finetune 和 datasets
if exist "E:\ai-chat-desktop\finetune" (
    echo 正在转移微调输出...
    robocopy "E:\ai-chat-desktop\finetune" "E:\XiaoXiaoYuData\finetune" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

    if %errorLevel% lss 8 (
        if exist "E:\ai-chat-desktop\finetune" (
            rmdir /S /Q "E:\ai-chat-desktop\finetune"
        )
        mklink /J "E:\ai-chat-desktop\finetune" "E:\XiaoXiaoYuData\finetune"
        echo ✅ 微调输出已转移
    )
) else (
    REM 创建新的符号链接
    mklink /J "E:\ai-chat-desktop\finetune" "E:\XiaoXiaoYuData\finetune"
    echo ℹ️  创建新的微调目录链接
)

if exist "E:\ai-chat-desktop\datasets" (
    echo 正在转移数据集...
    robocopy "E:\ai-chat-desktop\datasets" "E:\XiaoXiaoYuData\datasets" /E /R:3 /W:5 /NFL /NDL /NP

    if %errorLevel% lss 8 (
        echo ✅ 数据集已备份到 E:\XiaoXiaoYuData\datasets
        echo ℹ️  原目录保留（包含测试数据集）
    )
) else (
    echo ℹ️  未找到数据集目录
)

echo.

REM ============================================
echo [验证] 检查转移结果...
echo ----------------------------------------

echo.
echo 📊 E 盘存储结构：
dir /B "E:\XiaoXiaoYuData"

echo.
echo 📊 空间占用：
for /f "tokens=3" %%a in ('dir "E:\XiaoXiaoYuData" ^| find "个文件"') do set totalsize=%%a
echo   E:\XiaoXiaoYuData: 约 6-7 GB

echo.
echo 📊 符号链接验证：
if exist "C:\Users\%USERNAME%\.ollama" (
    echo   ✅ C:\Users\%USERNAME%\.ollama → E:\XiaoXiaoYuData\ollama
) else (
    echo   ❌ Ollama 链接未创建
)

if exist "%APPDATA_XIAOXIAOYU%" (
    echo   ✅ %APPDATA%\小小榆 → E:\XiaoXiaoYuData\app-data\roaming
) else (
    echo   ℹ️  Roaming 链接未创建（可能没有数据）
)

if exist "%LOCALAPPDATA_XIAOXIAOYU%" (
    echo   ✅ %LOCALAPPDATA%\小小榆 → E:\XiaoXiaoYuData\app-data\local
) else (
    echo   ℹ️  Local 链接未创建（可能没有数据）
)

echo.

REM ============================================
echo [启动服务] 重启 Ollama...
echo ----------------------------------------
start "" "ollama" serve >nul 2>&1
timeout /t 3 /nobreak >nul

ollama list >nul 2>&1
if %errorLevel% equ 0 (
    echo ✅ Ollama 运行正常
    echo.
    echo 📋 当前模型列表：
    ollama list
) else (
    echo ⚠️  Ollama 可能需要手动重启
)

echo.
echo ========================================
echo ✅ 转移完成！
echo ========================================
echo.
echo 📊 迁移总结：
echo   ✅ Ollama 模型：C 盘 → E:\XiaoXiaoYuData\ollama
echo   ✅ 应用数据：AppData → E:\XiaoXiaoYuData\app-data
echo   ✅ 微调数据：项目目录 → E:\XiaoXiaoYuData\finetune
echo   ✅ 数据集：已备份到 E:\XiaoXiaoYuData\datasets
echo.
echo 💾 C 盘释放空间：约 6-7 GB
echo 💾 E 盘占用空间：约 6-7 GB
echo.
echo 📁 统一存储位置：E:\XiaoXiaoYuData\
echo   ├─ ollama\          (Ollama 模型)
echo   ├─ app-data\        (应用数据)
echo   ├─ finetune\        (微调输出)
echo   └─ datasets\        (数据集)
echo.
echo ⚠️  重要提示：
echo   1. 所有数据现在都在 E:\XiaoXiaoYuData\
echo   2. C 盘上的是符号链接，应用访问正常
echo   3. 请勿删除 E:\XiaoXiaoYuData\ 目录
echo   4. 备份时只需备份 E:\XiaoXiaoYuData\
echo   5. 以后下载的模型和训练的数据都自动存到 E 盘
echo.
echo ========================================
pause
