# 小小榆 Web 服务器启动脚本
param(
  [int]$Port = 3000,
  [string]$AdminToken = ""
)

$ErrorActionPreference = "Stop"

# 设置环境变量
$env:PORT = $Port
if ($AdminToken) {
  $env:ADMIN_TOKEN = $AdminToken
}
$env:NODE_ENV = "production"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  小小榆 Web 服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
  $nodeVersion = node --version
  Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
  Write-Host "错误: 未找到 Node.js，请先安装 Node.js 18+" -ForegroundColor Red
  pause
  exit 1
}

# 进入项目目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
Set-Location $projectDir

# 确保 data 目录存在
if (-not (Test-Path "data")) {
  New-Item -ItemType Directory -Path "data" | Out-Null
  Write-Host "已创建 data 目录" -ForegroundColor Gray
}

# 检查是否已构建
if (-not (Test-Path "dist/server/server/index.js")) {
  Write-Host "正在构建服务器..." -ForegroundColor Yellow
  npx tsc -p tsconfig.server.json
}

Write-Host ""
Write-Host "启动服务器..." -ForegroundColor Green
Write-Host "  地址: http://localhost:$Port" -ForegroundColor White

if ($AdminToken) {
  Write-Host "  管理员Token: $AdminToken" -ForegroundColor White
}

Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host ""

# 启动服务器
node dist/server/server/index.js

pause
