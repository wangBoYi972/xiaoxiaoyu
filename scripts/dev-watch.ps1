# 开发模式 - 自动重启
# 用法: powershell -File scripts/dev-watch.ps1
# 修改代码后自动编译+重启，不需要手动操作

$project = "E:\ai-chat-desktop"
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = "$project\src"
$watcher.IncludeSubdirectories = $true
$watcher.Filter = "*.ts"
$watcher.EnableRaisingEvents = $true

$timer = New-Object System.Timers.Timer
$timer.Interval = 1500
$timer.AutoReset = $false

$action = {
    $timer.Stop()
    $timer.Start()
}

$restart = {
    Write-Host ""
    Write-Host "=== 检测到变更，重新编译... ===" -ForegroundColor Yellow

    # 杀掉旧进程
    Get-Process -Name "小小榆" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2

    # 编译 main
    $result = & npx tsc -p tsconfig.main.json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Main 编译失败:" -ForegroundColor Red
        Write-Host $result
        return
    }
    Write-Host "Main 编译 OK" -ForegroundColor Green

    # 编译 server
    & npx tsc -p tsconfig.server.json 2>&1 | Out-Null
    Write-Host "Server 编译 OK" -ForegroundColor Green

    # 清理锁文件
    Remove-Item "$env:APPDATA\xiaoxiaoyu\app.lock" -Force -ErrorAction SilentlyContinue

    # 启动
    Write-Host "启动 Electron..." -ForegroundColor Cyan
    Start-Process -FilePath ".\node_modules\.bin\electron.cmd" -ArgumentList ". --dev" -WindowStyle Hidden

    Write-Host "=== 重启完成 ===" -ForegroundColor Green
    Write-Host ""
}

$debounce = Register-ObjectEvent -InputObject $timer -EventName Elapsed -Action $restart
Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action | Out-Null

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  小小榆 - 自动重启开发模式" -ForegroundColor Cyan
Write-Host "  修改 src/ 下的 .ts 文件后自动编译+重启" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 先启动一次
& $restart

# 保持运行
while ($true) { Start-Sleep -Seconds 60 }
