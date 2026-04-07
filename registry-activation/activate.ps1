# Claude Desktop Custom-3P Activation via HKLM Registry
# Must run as Administrator
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File activate.ps1 -BaseUrl "https://your-gateway.com" -ApiKey "sk-your-key"

param(
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl,

    [Parameter(Mandatory=$true)]
    [string]$ApiKey,

    [ValidateSet("gateway","vertex","bedrock","azure")]
    [string]$Provider = "gateway"
)

$ErrorActionPreference = "Stop"
$REG_PATH = "HKLM:\SOFTWARE\Policies\Claude"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> Run as Administrator" -ForegroundColor Yellow
    exit 1
}

Write-Host "=== Claude Desktop Custom-3P Activation ===" -ForegroundColor Cyan

if (-not (Test-Path $REG_PATH)) {
    New-Item -Path $REG_PATH -Force | Out-Null
    Write-Host "[CREATED] $REG_PATH" -ForegroundColor Green
} else {
    Write-Host "[EXISTS]  $REG_PATH" -ForegroundColor Yellow
}

Set-ItemProperty -Path $REG_PATH -Name "custom3pProvider" -Value $Provider -Type String
Set-ItemProperty -Path $REG_PATH -Name "custom3pBaseUrl"  -Value $BaseUrl -Type String
Set-ItemProperty -Path $REG_PATH -Name "custom3pApiKey"   -Value $ApiKey -Type String

Write-Host ""
Write-Host "  custom3pProvider = $Provider" -ForegroundColor Green
Write-Host "  custom3pBaseUrl  = $BaseUrl" -ForegroundColor Green
Write-Host "  custom3pApiKey   = ****" -ForegroundColor Green
Write-Host ""
Write-Host "=== SUCCESS ===" -ForegroundColor Green
Write-Host "Restart Claude Desktop to activate custom-3p mode." -ForegroundColor Yellow
