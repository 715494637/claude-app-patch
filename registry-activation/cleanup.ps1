# Cleanup: Remove custom-3p registry keys and/or config file entries
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File cleanup.ps1 -Registry
#   powershell -ExecutionPolicy Bypass -File cleanup.ps1 -Config
#   powershell -ExecutionPolicy Bypass -File cleanup.ps1 -All

param(
    [switch]$Registry,
    [switch]$Config,
    [switch]$All
)

$ErrorActionPreference = "SilentlyContinue"

if (-not $Registry -and -not $Config -and -not $All) {
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  -Registry  Remove HKLM registry keys (requires admin)"
    Write-Host "  -Config    Remove custom3p fields from claude_desktop_config.json"
    Write-Host "  -All       Both"
    exit 0
}

if ($All) { $Registry = $true; $Config = $true }

if ($Registry) {
    Write-Host "=== Cleaning HKLM registry ===" -ForegroundColor Cyan
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "  [SKIP] Requires admin. Run as Administrator." -ForegroundColor Yellow
    } else {
        $regPath = "HKLM:\SOFTWARE\Policies\Claude"
        if (Test-Path $regPath) {
            Remove-Item -Path $regPath -Recurse -Force
            Write-Host "  Removed: $regPath" -ForegroundColor Green
        } else {
            Write-Host "  Already clean." -ForegroundColor Gray
        }
    }
}

if ($Config) {
    Write-Host "=== Cleaning config file ===" -ForegroundColor Cyan
    $paths = @("$env:APPDATA\Claude\claude_desktop_config.json")
    $msixBase = "$env:LOCALAPPDATA\Packages"
    if (Test-Path $msixBase) {
        $claudePkg = Get-ChildItem $msixBase -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($claudePkg) {
            $paths += Join-Path $claudePkg.FullName "LocalCache\Roaming\Claude\claude_desktop_config.json"
        }
    }
    foreach ($cfgPath in $paths) {
        if (Test-Path $cfgPath) {
            $json = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $clean = [ordered]@{}
            $removed = @()
            foreach ($prop in $json.PSObject.Properties) {
                if ($prop.Name -like "custom3p*") { $removed += $prop.Name }
                else { $clean[$prop.Name] = $prop.Value }
            }
            if ($removed.Count -gt 0) {
                $clean | ConvertTo-Json -Depth 10 | Set-Content $cfgPath -Encoding UTF8
                Write-Host "  Cleaned: $cfgPath" -ForegroundColor Green
            } else {
                Write-Host "  Already clean: $cfgPath" -ForegroundColor Gray
            }
        }
    }
}

Write-Host ""
Write-Host "Done. Restart Claude Desktop to apply." -ForegroundColor Cyan
