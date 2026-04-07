<#
.SYNOPSIS
  Claude Desktop No-Login Setup (No Patch - requires HTTPS endpoint)
.EXAMPLE
  .\setup.ps1              # Interactive
  .\setup.ps1 -FromCli     # Reuse CLI config
  .\setup.ps1 -Status      # Show config
  .\setup.ps1 -Uninstall   # Remove
#>

param(
    [string]$BaseUrl,
    [string]$ApiKey,
    [string]$Models,
    [switch]$FromCli,
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$Help
)

$CliSettingsPath = Join-Path $env:USERPROFILE ".claude\settings.json"

function Write-C($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Write-Ok($msg)   { Write-C "  [+] $msg" "Green" }
function Write-Inf($msg)  { Write-C "  [i] $msg" "Cyan" }
function Write-Err($msg)  { Write-C "  [x] $msg" "Red" }
function Write-Wrn($msg)  { Write-C "  [!] $msg" "Yellow" }

function Mask-Key($k) {
    if (-not $k) { return "(none)" }
    if ($k.Length -gt 12) { return $k.Substring(0,8) + "..." + $k.Substring($k.Length-4) }
    return "***"
}

function Kill-Desktop {
    $procs = Get-Process claude -ErrorAction SilentlyContinue
    $killed = 0
    foreach ($p in $procs) {
        try {
            $exePath = $p.Path
            if ($exePath -and ($exePath -like '*WindowsApps*' -or $exePath -like '*claude-portable*')) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                $killed++
            }
        } catch {}
    }
    if ($killed -gt 0) { Write-Ok "Killed $killed Desktop process(es) (CLI untouched)" }
    else { Write-Inf "No Desktop processes found" }
    if ($killed -gt 0) { Start-Sleep -Seconds 2 }
}

function Require-Https($url) {
    if ($url -and -not $url.StartsWith("https://")) {
        Write-Err "URL must be HTTPS: $url"
        Write-Wrn "Claude Desktop requires HTTPS for 3P Gateway (no-patch mode)."
        Write-Wrn "Use scheme-B (patch mode) if you need HTTP support."
        return $false
    }
    return $true
}

function Read-CliSettings {
    if (-not (Test-Path $CliSettingsPath)) { return $null }
    try {
        $json = (Get-Content $CliSettingsPath -Raw -Encoding UTF8) | ConvertFrom-Json
        $e = $json.env; if (-not $e) { return $null }
        $r = @{ BaseUrl = $null; ApiKey = $null; Model = $null }
        if ($e.ANTHROPIC_BASE_URL) { $r.BaseUrl = $e.ANTHROPIC_BASE_URL }
        foreach ($f in @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "API_KEY")) {
            $v = $e.$f; if ($v) { $r.ApiKey = $v; break }
        }
        if ($e.ANTHROPIC_MODEL) { $r.Model = $e.ANTHROPIC_MODEL }
        return $r
    } catch { return $null }
}

function Reg-Set($key, $name, $value, $type = "REG_SZ") {
    # Use .reg file import to preserve quotes in JSON values
    $hive = if ($key.StartsWith("HKLM")) { "HKEY_LOCAL_MACHINE" } else { "HKEY_CURRENT_USER" }
    $subkey = $key -replace "^HKCU\\\\|^HKLM\\\\", ""
    $fullKey = "$hive\$subkey"
    if ($type -eq "REG_DWORD") {
        $regVal = "dword:{0:x8}" -f [int]$value
    } else {
        $escaped = $value.Replace('\','\\').Replace('"','\"')
        $regVal = "`"$escaped`""
    }
    $tmp = Join-Path $env:TEMP "_claude_reg_$(Get-Random).reg"
    $content = "Windows Registry Editor Version 5.00`r`n`r`n[$fullKey]`r`n`"$name`"=$regVal`r`n"
    [System.IO.File]::WriteAllText($tmp, $content, [System.Text.Encoding]::Unicode)
    regedit /s $tmp 2>&1 | Out-Null
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

function Write-Registry($Url, $Key, $Mdl) {
    # Try HKCU first, fall back to HKLM
    $null = reg add "HKCU\SOFTWARE\Policies\Claude" /v _probe /t REG_SZ /d "" /f 2>&1
    if ($LASTEXITCODE -eq 0) {
        reg delete "HKCU\SOFTWARE\Policies\Claude" /v _probe /f 2>&1 | Out-Null
        $rk = "HKCU\SOFTWARE\Policies\Claude"
    } else {
        $rk = "HKLM\SOFTWARE\Policies\Claude"
    }

    Write-Inf "Writing to $rk"
    Reg-Set $rk "custom3pProvider" "gateway"
    Reg-Set $rk "custom3pBaseUrl" $Url
    Reg-Set $rk "custom3pApiKey" $Key
    if ($Mdl) { Reg-Set $rk "custom3pModels" $Mdl }
    Reg-Set $rk "disableEssentialTelemetry" 1 "REG_DWORD"
    Reg-Set $rk "disableNonessentialTelemetry" 1 "REG_DWORD"
    Reg-Set $rk "disableNonessentialServices" 1 "REG_DWORD"
    Reg-Set $rk "disableAutoUpdates" 1 "REG_DWORD"

    Write-Ok "custom3pProvider = gateway"
    Write-Ok "custom3pBaseUrl = $Url"
    Write-Ok "custom3pApiKey = $(Mask-Key $Key)"
    if ($Mdl) { Write-Ok "custom3pModels = $Mdl" }
    Write-Ok "Telemetry + auto-update disabled"

    Kill-Desktop
    Write-C "`n  Done! Restart Claude Desktop to use 3P mode." "Green"
    Write-C ""
}

function Show-Status {
    Write-C "`n===== 3P Gateway Status =====" "Cyan"
    $found = $false
    foreach ($h in @("HKCU\SOFTWARE\Policies\Claude", "HKLM\SOFTWARE\Policies\Claude")) {
        $out = reg query $h 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "$h :"
            $out | ForEach-Object { if ($_ -match "^\s+\S") { Write-C "  $_" "Yellow" } }
            $found = $true
        }
    }
    if (-not $found) { Write-Inf "Not configured" }
    $cli = Read-CliSettings
    if ($cli) {
        Write-C ""; Write-Ok "CLI: $CliSettingsPath"
        Write-C "  URL=$($cli.BaseUrl)  Key=$(Mask-Key $cli.ApiKey)  Model=$($cli.Model)" "Yellow"
    }
    Write-C ""
}

function Start-Interactive {
    Write-C "`n===== Claude Desktop No-Login Setup (no-patch, HTTPS only) =====" "Cyan"

    $cli = Read-CliSettings
    if ($cli -and $cli.BaseUrl) {
        Write-Ok "CLI config: $($cli.BaseUrl) | $(Mask-Key $cli.ApiKey) | $($cli.Model)"
        if (-not (Require-Https $cli.BaseUrl)) { return }
        $ch = Read-Host "  Reuse? [Y/n]"
        if ($ch -eq "" -or $ch -match "^[Yy]") {
            $mdl = $null
            if ($cli.Model) { $mdl = "[{\`"id\`":\`"$($cli.Model)\`",\`"name\`":\`"$($cli.Model)\`"}]" }
            Write-Registry -Url $cli.BaseUrl -Key $cli.ApiKey -Mdl $mdl
            return
        }
    }

    $u = Read-Host "  Base URL (HTTPS required)"
    if (-not $u) { Write-Err "Cancelled"; return }
    if (-not (Require-Https $u)) { return }
    $k = Read-Host "  API Key"
    if (-not $k) { Write-Err "Cancelled"; return }
    $m = Read-Host "  Models JSON (enter to skip)"
    Write-Registry -Url $u -Key $k -Mdl $(if($m){$m}else{$null})
}

function Invoke-Uninstall {
    Kill-Desktop
    foreach ($h in @("HKCU\SOFTWARE\Policies\Claude", "HKLM\SOFTWARE\Policies\Claude")) {
        reg delete $h /f 2>&1 | Out-Null
    }
    Write-Ok "Removed. Restart Claude for default login."
    Write-C ""
}

# ---- Main ----
if ($Help) {
    Write-C @"

  No-Patch mode (HTTPS endpoints only)
  =====================================
  .\setup.ps1              Interactive (auto-detects CLI config)
  .\setup.ps1 -FromCli     Reuse ~/.claude/settings.json
  .\setup.ps1 -BaseUrl URL -ApiKey KEY   Manual
  .\setup.ps1 -Status      Show current config
  .\setup.ps1 -Uninstall   Remove registry config

  NOTE: Endpoint MUST be HTTPS. For HTTP support, use scheme-B (patch mode).

"@ "Cyan"
}
elseif ($Status) { Show-Status }
elseif ($Uninstall) { Invoke-Uninstall }
elseif ($FromCli) {
    $cli = Read-CliSettings
    if (-not $cli -or -not $cli.BaseUrl) { Write-Err "CLI config not found"; exit 1 }
    if (-not (Require-Https $cli.BaseUrl)) { exit 1 }
    $mdl = $null
    if ($Models) { $mdl = $Models }
    elseif ($cli.Model) { $mdl = "[{\`"id\`":\`"$($cli.Model)\`",\`"name\`":\`"$($cli.Model)\`"}]" }
    Write-Registry -Url $cli.BaseUrl -Key $cli.ApiKey -Mdl $mdl
}
elseif ($BaseUrl) {
    if (-not $ApiKey) { Write-Err "-ApiKey required"; exit 1 }
    if (-not (Require-Https $BaseUrl)) { exit 1 }
    Write-Registry -Url $BaseUrl -Key $ApiKey -Mdl $Models
}
else { Start-Interactive }
