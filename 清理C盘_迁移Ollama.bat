@echo off
chcp 65001 >nul
echo ========================================
echo   清理 C 盘并转移 Ollama 模型到 E 盘
echo ========================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️  此脚本需要管理员权限
    echo 请右键点击此脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo [步骤 1/5] 停止 Ollama 服务...
echo ----------------------------------------

taskkill /F /IM ollama.exe 2>nul
timeout /t 2 /nobreak >nul
echo ✅ Ollama 服务已停止

echo.
echo [步骤 2/5] 创建 E 盘目录...
echo ----------------------------------------

if not exist "E:\OllamaData" mkdir "E:\OllamaData"
echo ✅ 创建目录：E:\OllamaData

echo.
echo [步骤 3/5] 移动模型文件（约 5.8 GB）...
echo ----------------------------------------
echo 这可能需要 2-5 分钟，请耐心等待...
echo.

REM 使用 robocopy 移动文件（保留时间戳）
robocopy "C:\Users\%USERNAME%\.ollama" "E:\OllamaData" /E /MOVE /R:3 /W:5 /NFL /NDL /NP

if %errorLevel% lss 8 (
    echo ✅ 模型文件已移动到 E:\OllamaData
) else (
    echo ❌ 移动失败，错误码: %errorLevel%
    pause
    exit /b 1
)

echo.
echo [步骤 4/5] 创建符号链接（让 Ollama 访问 E 盘）...
echo ----------------------------------------

REM 删除旧的 C 盘目录（如果还有残留）
if exist "C:\Users\%USERNAME%\.ollama" (
    rmdir /S /Q "C:\Users\%USERNAME%\.ollama"
)

REM 创建目录联接（Junction）
mklink /J "C:\Users\%USERNAME%\.ollama" "E:\OllamaData"

if %errorLevel% equ 0 (
    echo ✅ 符号链接已创建
    echo    C:\Users\%USERNAME%\.ollama → E:\OllamaData
) else (
    echo ❌ 创建符号链接失败
    pause
    exit /b 1
)

echo.
echo [步骤 5/5] 验证迁移...
echo ----------------------------------------

REM 启动 Ollama（后台）
start "" "ollama" serve >nul 2>&1
timeout /t 3 /nobreak >nul

REM 检查模型列表
ollama list >nul 2>&1
if %errorLevel% equ 0 (
    echo ✅ Ollama 运行正常
    echo.
    echo 📊 当前模型列表：
    ollama list
) else (
    echo ⚠️  Ollama 可能需要手动重启
)

echo.
echo ========================================
echo ✅ 迁移完成！
echo ========================================
echo.
echo 📊 空间节省：
echo   C 盘释放：约 5.8 GB
echo   E 盘占用：约 5.8 GB
echo.
echo 📁 新位置：
echo   实际存储：E:\OllamaData
echo   访问路径：C:\Users\%USERNAME%\.ollama (符号链接)
echo.
echo ⚠️  注意事项：
echo   1. 请勿删除 E:\OllamaData 目录
echo   2. 如需恢复，删除 C 盘符号链接，将 E 盘文件移回即可
echo   3. 以后 Ollama 下载的新模型也会自动存到 E 盘
echo.
echo ========================================
pause
