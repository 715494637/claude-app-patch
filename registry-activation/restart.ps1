# Restart Claude Desktop (MSIX + standard install)

Write-Host "Stopping Claude..." -ForegroundColor Yellow
Stop-Process -Name claude -Force -ErrorAction SilentlyContinue
Start-Sleep 3

Write-Host "Starting Claude..." -ForegroundColor Green
try {
    Start-Process "shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude" -ErrorAction Stop
} catch {
    $exePath = "$env:LOCALAPPDATA\Programs\claude\Claude.exe"
    if (Test-Path $exePath) {
        Start-Process $exePath
    } else {
        Write-Host "[WARN] Could not auto-start. Please start Claude manually." -ForegroundColor Yellow
    }
}

Write-Host "Done." -ForegroundColor Cyan
