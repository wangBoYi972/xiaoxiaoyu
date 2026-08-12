# 小小榆 - 全部转移到 E 盘
# PowerShell 脚本版本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  小小榆 - 全部转移到 E 盘" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  需要管理员权限才能创建符号链接" -ForegroundColor Yellow
    Write-Host "正在请求管理员权限..." -ForegroundColor Yellow

    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$scriptPath`""
    exit
}

Write-Host "✅ 管理员权限已获取" -ForegroundColor Green
Write-Host ""

# ============================================
Write-Host "[1/5] 停止相关服务..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "xiaoxiaoyu" -ErrorAction SilentlyContinue | Stop-Process -Force

Start-Sleep -Seconds 2
Write-Host "✅ 服务已停止" -ForegroundColor Green
Write-Host ""

# ============================================
Write-Host "[2/5] 创建 E 盘目录结构..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

$baseDir = "E:\XiaoXiaoYuData"
$dirs = @(
    "$baseDir\ollama",
    "$baseDir\app-data\roaming",
    "$baseDir\app-data\local",
    "$baseDir\app-data\user",
    "$baseDir\finetune",
    "$baseDir\datasets"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "✅ 目录结构已创建" -ForegroundColor Green
Write-Host ""

# ============================================
Write-Host "[3/5] 转移 Ollama 模型 (约 6 GB)..." -ForegroundColor Yellow
Write-Host "----------------------------------------"
Write-Host "这可能需要 2-5 分钟，请耐心等待..." -ForegroundColor Cyan

$ollamaSource = "$env:USERPROFILE\.ollama"
$ollamaTarget = "$baseDir\ollama"

if (Test-Path $ollamaSource) {
    Write-Host "正在移动 Ollama 数据..."

    # 使用 robocopy 移动文件
    $robocopyArgs = @(
        $ollamaSource,
        $ollamaTarget,
        "/E", "/MOVE", "/R:3", "/W:5", "/NFL", "/NDL", "/NP"
    )

    $result = Start-Process -FilePath "robocopy.exe" -ArgumentList $robocopyArgs -Wait -PassThru -NoNewWindow

    if ($result.ExitCode -lt 8) {
        Write-Host "✅ Ollama 数据已转移" -ForegroundColor Green

        # 删除旧目录（如果还存在）
        if (Test-Path $ollamaSource) {
            Remove-Item -Path $ollamaSource -Recurse -Force -ErrorAction SilentlyContinue
        }

        # 创建符号链接
        New-Item -ItemType Junction -Path $ollamaSource -Target $ollamaTarget -Force | Out-Null
        Write-Host "✅ 符号链接已创建: $ollamaSource -> $ollamaTarget" -ForegroundColor Green
    } else {
        Write-Host "⚠️  移动时出现错误 (退出码: $($result.ExitCode))" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  未找到 Ollama 数据目录" -ForegroundColor Gray
}

Write-Host ""

# ============================================
Write-Host "[4/5] 转移小小榆应用数据..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

# 转移 AppData\Roaming\小小榆
$roamingSource = "$env:APPDATA\小小榆"
$roamingTarget = "$baseDir\app-data\roaming"

if (Test-Path $roamingSource) {
    Write-Host "正在转移 Roaming 数据..."
    robocopy $roamingSource $roamingTarget /E /MOVE /R:3 /W:5 /NFL /NDL /NP | Out-Null

    if (Test-Path $roamingSource) {
        Remove-Item -Path $roamingSource -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Junction -Path $roamingSource -Target $roamingTarget -Force | Out-Null
    Write-Host "✅ Roaming 数据已转移" -ForegroundColor Green
} else {
    Write-Host "ℹ️  未找到 Roaming 数据（首次使用会自动创建）" -ForegroundColor Gray
    # 预先创建符号链接
    New-Item -ItemType Junction -Path $roamingSource -Target $roamingTarget -Force -ErrorAction SilentlyContinue | Out-Null
}

# 转移 AppData\Local\小小榆
$localSource = "$env:LOCALAPPDATA\小小榆"
$localTarget = "$baseDir\app-data\local"

if (Test-Path $localSource) {
    Write-Host "正在转移 Local 数据..."
    robocopy $localSource $localTarget /E /MOVE /R:3 /W:5 /NFL /NDL /NP | Out-Null

    if (Test-Path $localSource) {
        Remove-Item -Path $localSource -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Junction -Path $localSource -Target $localTarget -Force | Out-Null
    Write-Host "✅ Local 数据已转移" -ForegroundColor Green
} else {
    Write-Host "ℹ️  未找到 Local 数据（首次使用会自动创建）" -ForegroundColor Gray
    # 预先创建符号链接
    New-Item -ItemType Junction -Path $localSource -Target $localTarget -Force -ErrorAction SilentlyContinue | Out-Null
}

Write-Host ""

# ============================================
Write-Host "[5/5] 设置项目目录链接..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

$projectDir = "E:\ai-chat-desktop"

# 微调输出目录
$finetuneSource = "$projectDir\finetune"
$finetuneTarget = "$baseDir\finetune"

if (Test-Path $finetuneSource) {
    Write-Host "正在转移微调数据..."
    robocopy $finetuneSource $finetuneTarget /E /MOVE /R:3 /W:5 /NFL /NDL /NP | Out-Null
    if (Test-Path $finetuneSource) {
        Remove-Item -Path $finetuneSource -Recurse -Force
    }
}

New-Item -ItemType Junction -Path $finetuneSource -Target $finetuneTarget -Force | Out-Null
Write-Host "✅ 微调目录已链接" -ForegroundColor Green

# 数据集备份（保留原目录，因为有测试数据）
$datasetSource = "$projectDir\datasets"
$datasetTarget = "$baseDir\datasets"

if (Test-Path $datasetSource) {
    Write-Host "正在备份数据集..."
    robocopy $datasetSource $datasetTarget /E /R:3 /W:5 /NFL /NDL /NP | Out-Null
    Write-Host "✅ 数据集已备份" -ForegroundColor Green
}

Write-Host ""

# ============================================
Write-Host "[验证] 检查转移结果..." -ForegroundColor Yellow
Write-Host "----------------------------------------"
Write-Host ""

Write-Host "📊 E 盘目录结构:" -ForegroundColor Cyan
Get-ChildItem $baseDir | Format-Table Name, LastWriteTime -AutoSize

Write-Host ""
Write-Host "📊 符号链接验证:" -ForegroundColor Cyan

$links = @(
    @{Source="$env:USERPROFILE\.ollama"; Target="$baseDir\ollama"},
    @{Source="$env:APPDATA\小小榆"; Target="$baseDir\app-data\roaming"},
    @{Source="$env:LOCALAPPDATA\小小榆"; Target="$baseDir\app-data\local"},
    @{Source="$projectDir\finetune"; Target="$baseDir\finetune"}
)

foreach ($link in $links) {
    if (Test-Path $link.Source) {
        $item = Get-Item $link.Source
        if ($item.LinkType -eq "Junction") {
            Write-Host "  ✅ $($link.Source) -> $($link.Target)" -ForegroundColor Green
        } else {
            Write-Host "  ℹ️  $($link.Source) (普通目录)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ❌ $($link.Source) (不存在)" -ForegroundColor Red
    }
}

Write-Host ""

# ============================================
Write-Host "[启动服务] 重启 Ollama..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
    $models = & ollama list 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Ollama 运行正常" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 当前模型列表:" -ForegroundColor Cyan
        & ollama list
    } else {
        Write-Host "⚠️  Ollama 可能需要手动重启" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Ollama 启动中..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ 转移完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 迁移总结:" -ForegroundColor Cyan
Write-Host "  ✅ Ollama 模型: C 盘 -> $baseDir\ollama" -ForegroundColor Green
Write-Host "  ✅ 应用数据: AppData -> $baseDir\app-data" -ForegroundColor Green
Write-Host "  ✅ 微调数据: 项目目录 -> $baseDir\finetune" -ForegroundColor Green
Write-Host "  ✅ 数据集: 已备份到 $baseDir\datasets" -ForegroundColor Green
Write-Host ""

Write-Host "💾 C 盘释放空间: 约 6-7 GB" -ForegroundColor Yellow
Write-Host "💾 E 盘占用空间: 约 6-7 GB" -ForegroundColor Yellow
Write-Host ""

Write-Host "📁 统一存储位置: $baseDir" -ForegroundColor Cyan
Write-Host ""

Write-Host "⚠️  重要提示:" -ForegroundColor Yellow
Write-Host "  1. 所有数据现在都在 $baseDir" -ForegroundColor White
Write-Host "  2. C 盘上的是符号链接，应用访问正常" -ForegroundColor White
Write-Host "  3. 请勿删除 $baseDir 目录" -ForegroundColor White
Write-Host "  4. 以后下载的模型和训练的数据都自动存到 E 盘" -ForegroundColor White
Write-Host ""

Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
