$dir = "E:\ai-chat-desktop"
Set-Location $dir
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"

$tsc = Join-Path $dir "node_modules\typescript\bin\tsc"
$vite = Join-Path $dir "node_modules\vite\bin\vite.js"
$electron = Join-Path $dir "node_modules\electron\dist\electron.exe"

# Step 1: compile
Start-Process -FilePath node -ArgumentList $tsc,"-p","tsconfig.main.json" -Wait -WindowStyle Hidden

# Step 2: start Vite in background
Start-Process -FilePath node -ArgumentList $vite,"--host" -WindowStyle Hidden

# Step 3: wait for Vite
for ($i = 0; $i -lt 40; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 1 -UseBasicParsing
        if ($r.StatusCode -eq 200) { break }
    } catch { Start-Sleep -Milliseconds 500 }
}

# Step 4: start Electron
Start-Process -FilePath $electron -ArgumentList ".","--dev" -WindowStyle Normal
