@echo off
echo 刷新 Windows 图标缓存
echo ========================================
echo.

echo [1/3] 删除图标缓存文件...
del /f /s /q /a "%LocalAppData%\IconCache.db" 2>nul
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\iconcache*" 2>nul
echo ✅ 图标缓存已清理
echo.

echo [2/3] 重启 Windows 资源管理器...
taskkill /f /im explorer.exe
timeout /t 2 /nobreak >nul
start explorer.exe
echo ✅ 资源管理器已重启
echo.

echo [3/3] 完成！
echo ========================================
echo.
echo 现在请：
echo 1. 重新安装小小榆应用
echo 2. 或者右键桌面快捷方式 → 属性 → 更改图标
echo    浏览到：E:\xioaxiaoyu\xiaoxiaoyu\resources\icon.ico
echo.
pause
