@echo off
chcp 65001 >nul
echo ========================================
echo   小小榆 - 开发模式启动
echo ========================================
echo.
echo 正在启动开发服务器...
echo.
echo 新功能测试：
echo   - DeepSeek-R1 模型支持 ✓
echo   - 微调训练界面 ✓
echo   - 测试数据集已准备 ✓
echo.
echo ----------------------------------------
echo 启动后会自动打开 Electron 窗口
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

cd /d E:\ai-chat-desktop
npm run dev

pause
