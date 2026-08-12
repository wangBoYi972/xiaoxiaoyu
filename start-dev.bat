@echo off
cd /d E:\ai-chat-desktop
start "" /min cmd /c "npm run dev"
echo 小小榆开发模式已启动（无黑窗口）
echo Vite: http://localhost:5173
echo 等待几秒后 Electron 窗口会自动打开
timeout /t 3 >nul
