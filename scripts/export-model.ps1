# 导出 Ollama 模型到安装包资源目录
# 用法：powershell -File scripts/export-model.ps1
# 前提：Ollama 已安装，qwen2.5:0.5b 已 pull

$OllamaHome = "$env:USERPROFILE\.ollama"
$ModelsDir = "$OllamaHome\models"
$OutputDir = "$PSScriptRoot\..\resources\models\qwen2.5-0.5b"
$ModelName = "qwen2.5:0.5b"

Write-Host "=== 导出模型 $ModelName 到安装包资源 ===" -ForegroundColor Cyan

# 1. 检查 Ollama 和模型
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
    Write-Host "Ollama 未找到，先安装或检查 PATH" -ForegroundColor Red
    exit 1
}

# 确保模型已拉取
Write-Host "确保模型已拉取..." -ForegroundColor Yellow
ollama pull $ModelName 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "模型拉取失败，请检查 Ollama 服务是否运行" -ForegroundColor Red
    exit 1
}

# 2. 清理旧的导出
if (Test-Path $OutputDir) {
    Write-Host "清理旧导出: $OutputDir" -ForegroundColor Yellow
    Remove-Item -Recurse -Force $OutputDir
}

# 3. 复制 blobs 目录（模型权重文件）
Write-Host "导出模型权重文件..." -ForegroundColor Yellow
$BlobsDir = "$ModelsDir\blobs"
if (Test-Path $BlobsDir) {
    New-Item -ItemType Directory -Force -Path "$OutputDir\blobs" | Out-Null
    # 只复制被当前模型引用的 blob 文件
    # 先读取 manifest 找出所有引用的 digest
    $ManifestDir = "$ModelsDir\manifests\registry.ollama.ai\library"
    $allBlobs = @{}

    # 递归扫描 manifests 目录，找到所有引用当前模型的 digest
    Get-ChildItem -Recurse -File -Path $ManifestDir | ForEach-Object {
        try {
            $json = Get-Content $_.FullName -Raw | ConvertFrom-Json
            # 收集 config digest
            if ($json.config.digest) {
                $hash = $json.config.digest -replace 'sha256:', 'sha256-'
                $allBlobs[$hash] = $true
            }
            # 收集 layer digests
            foreach ($layer in $json.layers) {
                if ($layer.digest) {
                    $hash = $layer.digest -replace 'sha256:', 'sha256-'
                    $allBlobs[$hash] = $true
                }
            }
        } catch {}
    }

    Write-Host "  找到 $($allBlobs.Count) 个 blob 引用" -ForegroundColor Gray
    $copied = 0
    foreach ($blob in $allBlobs.Keys) {
        $srcBlob = Join-Path $BlobsDir $blob
        if (Test-Path $srcBlob) {
            Copy-Item $srcBlob "$OutputDir\blobs\" -Force
            $copied++
        }
    }
    Write-Host "  已复制 $copied 个 blob 文件" -ForegroundColor Green
}

# 4. 复制 manifests 目录（模型元数据）
Write-Host "导出模型配置..." -ForegroundColor Yellow
$SrcManifests = "$ModelsDir\manifests"
if (Test-Path $SrcManifests) {
    Copy-Item -Recurse -Force $SrcManifests "$OutputDir\manifests"
    Write-Host "  已复制 manifests 目录" -ForegroundColor Green
}

# 5. 显示结果
$totalSize = (Get-ChildItem -Recurse -File -Path $OutputDir | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host "=== 导出完成 ===" -ForegroundColor Green
Write-Host "输出目录: $OutputDir" -ForegroundColor Green
Write-Host "总大小: $([math]::Round($totalSize / 1MB, 1)) MB" -ForegroundColor Green
Write-Host ""
Write-Host "下一步: npm run pack 打包安装包" -ForegroundColor Cyan
