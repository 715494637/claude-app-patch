<#
.SYNOPSIS
  Claude Desktop Patch Script - Bypass HTTPS restriction for 3P Gateway
  Patches app.asar to allow HTTP endpoints (e.g., http://localhost:8080)

.DESCRIPTION
  CTF Challenge: Make Claude Desktop accept custom HTTP API endpoints without login.

  Claude Desktop v1.2+ uses NEW enterprise config key names:
    inferenceProvider        (replaces custom3pProvider)
    inferenceGatewayBaseUrl  (replaces custom3pBaseUrl)
    inferenceGatewayApiKey   (replaces custom3pApiKey)
    inferenceModels          (replaces custom3pModels)

  The HTTPS restriction is enforced by a Zod validator in index.js:
    m5 = ke().trim().url().refine(t => new URL(t).protocol === "https:", ...)
  This script patches that check to accept both http: and https:.

.EXAMPLE
  .\patch.ps1                                          # Interactive mode
  .\patch.ps1 -BaseUrl http://localhost:8080 -ApiKey sk-xxx  # Direct mode
  .\patch.ps1 -PatchOnly                               # Only patch asar, skip registry
  .\patch.ps1 -Restore                                 # Restore original app.asar
  .\patch.ps1 -Status                                  # Show patch & registry status
#>

param(
    [string]$BaseUrl,
    [string]$ApiKey,
    [string]$Models,
    [switch]$FromCli,
    [switch]$PatchOnly,
    [switch]$Restore,
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$Help
)

# ======================== Helpers ========================

$CliSettingsPath = Join-Path $env:USERPROFILE ".claude\settings.json"

function Write-C($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Write-Ok($msg)   { Write-C "  [+] $msg" "Green" }
function Write-Inf($msg)  { Write-C "  [i] $msg" "Cyan" }
function Write-Err($msg)  { Write-C "  [x] $msg" "Red" }
function Write-Wrn($msg)  { Write-C "  [!] $msg" "Yellow" }
function Write-Banner {
    Write-C ""
    Write-C "  ============================================================" "Magenta"
    Write-C "    Claude Desktop 3P Gateway Patch (HTTP + HTTPS support)    " "Magenta"
    Write-C "  ============================================================" "Magenta"
    Write-C ""
}

function Mask-Key($k) {
    if (-not $k) { return "(none)" }
    if ($k.Length -gt 12) { return $k.Substring(0,8) + "..." + $k.Substring($k.Length-4) }
    return "***"
}

# ======================== Process Management ========================

function Kill-Desktop {
    $procs = Get-Process claude -ErrorAction SilentlyContinue
    $killed = 0
    foreach ($p in $procs) {
        try {
            $exePath = $p.Path
            if ($exePath -and ($exePath -like '*WindowsApps*' -or $exePath -like '*claude-portable*' -or $exePath -like '*AnthropicClaude*')) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                $killed++
            }
        } catch {}
    }
    if ($killed -gt 0) {
        Write-Ok "Killed $killed Desktop process(es) (CLI untouched)"
        Start-Sleep -Seconds 2
    } else {
        Write-Inf "No Desktop processes found"
    }
}

# ======================== Locate app.asar ========================

function Find-AsarPath {
    $candidates = [System.Collections.ArrayList]@()

    # Standard installer (non-Store) - most common
    $localAppData = $env:LOCALAPPDATA
    if ($localAppData) {
        $claudeDir = Join-Path $localAppData "AnthropicClaude"
        if (Test-Path $claudeDir) {
            # Find the latest app-* version directory
            $appDirs = Get-ChildItem -Path $claudeDir -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
                       Sort-Object Name -Descending
            foreach ($d in $appDirs) {
                $asar = Join-Path $d.FullName "resources\app.asar"
                if (Test-Path $asar) { [void]$candidates.Add($asar) }
            }
        }
    }

    # Microsoft Store / MSIX install
    $progFiles = $env:ProgramFiles
    if ($progFiles) {
        $winApps = Join-Path $progFiles "WindowsApps"
        if (Test-Path $winApps) {
            $storeDirs = Get-ChildItem -Path $winApps -Directory -Filter "AnthropicPBC.Claude*" -ErrorAction SilentlyContinue
            foreach ($d in $storeDirs) {
                $asar = Join-Path $d.FullName "app\resources\app.asar"
                if (Test-Path $asar) { [void]$candidates.Add($asar) }
            }
        }
    }

    # Portable install
    $portablePaths = @(
        (Join-Path $env:USERPROFILE "claude-portable\resources\app.asar"),
        (Join-Path $env:LOCALAPPDATA "Programs\Claude\resources\app.asar")
    )
    foreach ($pp in $portablePaths) {
        if (Test-Path $pp) { [void]$candidates.Add($pp) }
    }

    # IMPORTANT: Use comma operator to prevent PowerShell from unrolling the list
    return ,$candidates
}

# ======================== Node.js / npx check ========================

function Test-NodeAvailable {
    try {
        $null = & node --version 2>&1
        return $true
    } catch { return $false }
}

function Test-NpxAvailable {
    try {
        $null = & npx --version 2>&1
        return $true
    } catch { return $false }
}

function Ensure-AsarTool {
    if (-not (Test-NodeAvailable)) {
        Write-Err "Node.js is not installed or not in PATH."
        Write-Wrn "Install Node.js from https://nodejs.org/ and retry."
        return $false
    }
    if (-not (Test-NpxAvailable)) {
        Write-Err "npx is not available."
        return $false
    }

    # Check if @electron/asar is available
    Write-Inf "Checking @electron/asar tool..."
    $testResult = & npx --yes @electron/asar --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Wrn "Installing @electron/asar..."
        & npm install -g @electron/asar 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to install @electron/asar"
            return $false
        }
    }
    Write-Ok "@electron/asar is ready"
    return $true
}

# ======================== Core Patch Logic ========================

function Invoke-Patch($asarPath) {
    $resourcesDir = Split-Path $asarPath -Parent
    if (-not $resourcesDir) {
        Write-Err "Cannot determine parent directory of: $asarPath"
        return $false
    }
    $backupPath   = Join-Path $resourcesDir "app.asar.bak"
    $unpackedDir  = Join-Path $resourcesDir "app_unpacked"

    # Step 1: Backup
    if (-not (Test-Path $backupPath)) {
        Write-Inf "Creating backup: app.asar.bak"
        Copy-Item $asarPath $backupPath -Force
        Write-Ok "Backup created"
    } else {
        Write-Inf "Backup already exists (app.asar.bak)"
    }

    # Step 2: Extract
    Write-Inf "Extracting app.asar..."
    if (Test-Path $unpackedDir) {
        Remove-Item $unpackedDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    & npx --yes @electron/asar extract $asarPath $unpackedDir 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $unpackedDir)) {
        Write-Err "Failed to extract app.asar"
        return $false
    }
    Write-Ok "Extracted successfully"

    # Step 3: Find and patch HTTPS checks
    # ============================================================
    # PRIMARY TARGET: The Zod URL validator "m5" in index.js
    #   m5=ke().trim().url().refine(t=>new URL(t).protocol==="https:",{message:"must use https"})
    # This validator is used for:
    #   - inferenceGatewayBaseUrl (gateway mode base URL)
    #   - MCP server URLs
    #   - Various other URL fields
    # We patch: .protocol==="https:" -> .protocol==="https:"||true
    # ============================================================
    Write-Inf "Scanning for HTTPS validation patterns..."
    $jsFiles = Get-ChildItem -Path $unpackedDir -Recurse -Include "*.js" -ErrorAction SilentlyContinue
    $patched = $false
    $patchCount = 0

    foreach ($jsFile in $jsFiles) {
        $content = [System.IO.File]::ReadAllText($jsFile.FullName, [System.Text.Encoding]::UTF8)
        $originalContent = $content

        # Pattern A: The exact Zod refine pattern from Claude Desktop v1.2+ (v1.1617.0)
        # .refine(t=>new URL(t).protocol==="https:",{message:"must use https"})
        $searchA = '.protocol==="https:",{message:"must use https"}'
        $replaceA = '.protocol==="https:"||true,{message:"must use https"}'
        if ($content.Contains($searchA)) {
            $content = $content.Replace($searchA, $replaceA)
            Write-Ok "  Patched Zod URL validator (m5 refine) in: $($jsFile.Name)"
            $patchCount++
        }

        # Pattern B: protocol==="https:" in other validation contexts
        # e.g., return e.protocol==="https:"&&e.pathname!=="/"
        $searchB = '.protocol==="https:"&&'
        $replaceB = '.protocol.startsWith("http")&&'
        if ($content.Contains($searchB)) {
            $content = $content.Replace($searchB, $replaceB)
            Write-Ok "  Patched protocol AND-chain check in: $($jsFile.Name)"
            $patchCount++
        }

        if ($content -ne $originalContent) {
            [System.IO.File]::WriteAllText($jsFile.FullName, $content, (New-Object System.Text.UTF8Encoding $false))
            $patched = $true
        }
    }

    if (-not $patched) {
        Write-Wrn "No HTTPS validation patterns found to patch."
        Write-Wrn "Claude Desktop version may have changed its validation logic."
        Write-Wrn "Proceeding with repack anyway (registry config may still work)."
    } else {
        Write-Ok "Applied $patchCount patch(es) total"
    }

    # Step 4: Repack
    Write-Inf "Repacking app.asar..."
    & npx --yes @electron/asar pack $unpackedDir $asarPath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to repack app.asar"
        Write-Wrn "Restoring from backup..."
        Copy-Item $backupPath $asarPath -Force
        return $false
    }
    Write-Ok "Repacked successfully"

    # Step 5: Cleanup extracted directory
    Remove-Item $unpackedDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok "Cleaned up temporary files"

    return $true
}

# ======================== Restore ========================

function Invoke-Restore($asarPath) {
    $resourcesDir = Split-Path $asarPath -Parent
    if (-not $resourcesDir) {
        Write-Err "Cannot determine parent directory of: $asarPath"
        return $false
    }
    $backupPath = Join-Path $resourcesDir "app.asar.bak"

    if (-not (Test-Path $backupPath)) {
        Write-Err "No backup found (app.asar.bak). Cannot restore."
        return $false
    }

    Kill-Desktop
    Copy-Item $backupPath $asarPath -Force
    Write-Ok "Restored original app.asar from backup"
    return $true
}

# ======================== Registry (reuse from setup.ps1) ========================

function Reg-Set($key, $name, $value, $type = "REG_SZ") {
    $psPath = $key -replace '^HKCU\\', 'HKCU:\' -replace '^HKLM\\', 'HKLM:\'
    if (-not (Test-Path $psPath)) {
        New-Item -Path $psPath -Force | Out-Null
    }
    if ($type -eq "REG_DWORD") {
        New-ItemProperty -Path $psPath -Name $name -Value ([int]$value) -PropertyType DWord -Force | Out-Null
    } else {
        New-ItemProperty -Path $psPath -Name $name -Value $value -PropertyType String -Force | Out-Null
    }
}

function Write-Registry($Url, $Key, $Mdl) {
    foreach ($h in @("HKCU\SOFTWARE\Policies\Claude", "HKLM\SOFTWARE\Policies\Claude")) {
        reg delete $h /f 2>&1 | Out-Null
    }

    $null = reg add "HKCU\SOFTWARE\Policies\Claude" /v _probe /t REG_SZ /d "" /f 2>&1
    if ($LASTEXITCODE -eq 0) {
        reg delete "HKCU\SOFTWARE\Policies\Claude" /v _probe /f 2>&1 | Out-Null
        $rk = "HKCU\SOFTWARE\Policies\Claude"
    } else {
        $rk = "HKLM\SOFTWARE\Policies\Claude"
    }

    Write-Inf "Writing registry: $rk"

    # NEW key names for v1.2+ (the ones Claude Desktop actually reads)
    Reg-Set $rk "inferenceProvider"       "gateway"
    Reg-Set $rk "inferenceGatewayBaseUrl" $Url
    Reg-Set $rk "inferenceGatewayApiKey"  $Key
    if ($Mdl) { Reg-Set $rk "inferenceModels" $Mdl }

    # ALSO write legacy key names for older versions
    Reg-Set $rk "custom3pProvider" "gateway"
    Reg-Set $rk "custom3pBaseUrl"  $Url
    Reg-Set $rk "custom3pApiKey"   $Key
    if ($Mdl) { Reg-Set $rk "custom3pModels" $Mdl }

    Reg-Set $rk "disableEssentialTelemetry"    1 "REG_DWORD"
    Reg-Set $rk "disableNonessentialTelemetry" 1 "REG_DWORD"
    Reg-Set $rk "disableNonessentialServices"  1 "REG_DWORD"
    Reg-Set $rk "disableAutoUpdates"           1 "REG_DWORD"

    Write-Ok "inferenceProvider       = gateway"
    Write-Ok "inferenceGatewayBaseUrl = $Url"
    Write-Ok "inferenceGatewayApiKey  = $(Mask-Key $Key)"
    if ($Mdl) { Write-Ok "inferenceModels         = $Mdl" }
    Write-Ok "Legacy keys also written (custom3pProvider/BaseUrl/ApiKey)"
    Write-Ok "Telemetry + auto-update disabled"
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

# ======================== Status ========================

function Show-Status {
    Write-Banner
    Write-C "  --- app.asar Patch Status ---" "Cyan"

    $asarPaths = Find-AsarPath
    if ($asarPaths.Count -eq 0) {
        Write-Wrn "Claude Desktop not found"
    } else {
        foreach ($ap in $asarPaths) {
            $resourcesDir = Split-Path $ap -Parent
            $backupPath = Join-Path $resourcesDir "app.asar.bak"
            if (Test-Path $backupPath) {
                Write-Ok "PATCHED: $ap"
                Write-Inf "  Backup: $backupPath"
            } else {
                Write-Inf "UNPATCHED: $ap"
            }
        }
    }

    Write-C ""
    Write-C "  --- Registry Status ---" "Cyan"
    $found = $false
    foreach ($h in @("HKCU\SOFTWARE\Policies\Claude", "HKLM\SOFTWARE\Policies\Claude")) {
        $out = reg query $h 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "$h :"
            $out | ForEach-Object { if ($_ -match "^\s+\S") { Write-C "    $_" "Yellow" } }
            $found = $true
        }
    }
    if (-not $found) { Write-Inf "Registry: Not configured" }

    $cli = Read-CliSettings
    if ($cli) {
        Write-C ""
        Write-Ok "CLI config: $CliSettingsPath"
        Write-C "    URL=$($cli.BaseUrl)  Key=$(Mask-Key $cli.ApiKey)  Model=$($cli.Model)" "Yellow"
    }
    Write-C ""
}

# ======================== Uninstall ========================

function Invoke-FullUninstall {
    Write-Banner
    Write-Inf "Full uninstall: restore asar + remove registry..."

    $asarPaths = Find-AsarPath
    foreach ($ap in $asarPaths) {
        Invoke-Restore $ap
    }

    Kill-Desktop
    foreach ($h in @("HKCU\SOFTWARE\Policies\Claude", "HKLM\SOFTWARE\Policies\Claude")) {
        reg delete $h /f 2>&1 | Out-Null
    }
    Write-Ok "Registry cleaned"
    Write-Ok "Uninstall complete. Restart Claude Desktop for default login."
    Write-C ""
}

# ======================== Interactive ========================

function Start-Interactive {
    Write-Banner

    # Step 1: Locate app.asar
    Write-C "  [Step 1/3] Locating Claude Desktop..." "Cyan"
    $asarPaths = Find-AsarPath
    if ($asarPaths.Count -eq 0) {
        Write-Err "Claude Desktop installation not found!"
        Write-Wrn "Searched:"
        Write-Wrn "  - %LOCALAPPDATA%\AnthropicClaude\app-*\resources\"
        Write-Wrn "  - %ProgramFiles%\WindowsApps\AnthropicPBC.Claude*\"
        Write-Wrn "  - %USERPROFILE%\claude-portable\resources\"
        $custom = Read-Host "`n  Enter app.asar path manually (or press Enter to abort)"
        if (-not $custom -or -not (Test-Path $custom)) {
            Write-Err "Aborted."; return
        }
        $asarPaths = @($custom)
    }

    $asarPath = $asarPaths[0]
    Write-Ok "Found: $asarPath"

    if ($asarPaths.Count -gt 1) {
        Write-Wrn "Multiple installations found:"
        for ($i = 0; $i -lt $asarPaths.Count; $i++) {
            Write-C "    [$i] $($asarPaths[$i])" "Yellow"
        }
        $sel = Read-Host "  Select [0-$($asarPaths.Count-1)]"
        if ($sel -match '^\d+$' -and [int]$sel -lt $asarPaths.Count) {
            $asarPath = $asarPaths[[int]$sel]
        }
    }

    # Step 2: Patch app.asar
    Write-C ""
    Write-C "  [Step 2/3] Patching app.asar..." "Cyan"

    Kill-Desktop

    if (-not (Ensure-AsarTool)) { return }

    $patchResult = Invoke-Patch $asarPath
    if (-not $patchResult) {
        Write-Err "Patch failed. Check errors above."
        return
    }

    # Step 3: Configure registry
    Write-C ""
    Write-C "  [Step 3/3] Configuring 3P Gateway..." "Cyan"

    $cli = Read-CliSettings
    if ($cli -and $cli.BaseUrl) {
        Write-Ok "CLI config detected: $($cli.BaseUrl) | $(Mask-Key $cli.ApiKey) | $($cli.Model)"
        $ch = Read-Host "  Reuse CLI config? [Y/n]"
        if ($ch -eq "" -or $ch -match "^[Yy]") {
            $mdl = $null
            if ($cli.Model) { $mdl = "[`"$($cli.Model)`"]" }
            Write-Registry -Url $cli.BaseUrl -Key $cli.ApiKey -Mdl $mdl
            Write-C ""
            Write-C "  Done! Restart Claude Desktop to use 3P Gateway (HTTP/HTTPS)." "Green"
            Write-C ""
            return
        }
    }

    $u = Read-Host "  Base URL (HTTP or HTTPS)"
    if (-not $u) { Write-Err "Cancelled"; return }
    if (-not ($u.StartsWith("http://") -or $u.StartsWith("https://"))) {
        Write-Err "URL must start with http:// or https://"
        return
    }
    $k = Read-Host "  API Key"
    if (-not $k) { Write-Err "Cancelled"; return }
    $m = Read-Host "  Models JSON (Enter to skip)"

    Write-Registry -Url $u -Key $k -Mdl $(if($m){$m}else{$null})

    Write-C ""
    Write-C "  Done! Restart Claude Desktop to use 3P Gateway (HTTP/HTTPS)." "Green"
    Write-C ""
}

# ======================== Main Entry ========================

if ($Help) {
    Write-Banner
    Write-C @"
  Patch mode (HTTP + HTTPS endpoints)
  ====================================
  This script patches Claude Desktop's app.asar to remove the HTTPS-only
  restriction, then configures the registry for 3P Gateway mode.

  USAGE:
    .\patch.ps1                                  Interactive (recommended)
    .\patch.ps1 -BaseUrl URL -ApiKey KEY         Direct mode
    .\patch.ps1 -FromCli                         Reuse ~/.claude/settings.json
    .\patch.ps1 -PatchOnly                       Only patch asar (no registry)
    .\patch.ps1 -Restore                         Restore original app.asar
    .\patch.ps1 -Uninstall                       Full uninstall (restore + clean registry)
    .\patch.ps1 -Status                          Show current status

  PREREQUISITES:
    - Node.js (for npx / @electron/asar)
    - Administrator privileges
    - Claude Desktop installed (non-Store version recommended)

  NOTES:
    - A backup (app.asar.bak) is created before patching
    - Claude Desktop updates will overwrite the patch
    - Re-run this script after each Claude Desktop update

"@ "Cyan"
}
elseif ($Status) {
    Show-Status
}
elseif ($Restore) {
    Write-Banner
    $asarPaths = Find-AsarPath
    if ($asarPaths.Count -eq 0) { Write-Err "Claude Desktop not found"; exit 1 }
    Kill-Desktop
    foreach ($ap in $asarPaths) { Invoke-Restore $ap }
    Write-Ok "Restore complete. Restart Claude Desktop."
    Write-C ""
}
elseif ($Uninstall) {
    Invoke-FullUninstall
}
elseif ($PatchOnly) {
    Write-Banner
    $asarPaths = Find-AsarPath
    if ($asarPaths.Count -eq 0) { Write-Err "Claude Desktop not found"; exit 1 }
    Kill-Desktop
    if (-not (Ensure-AsarTool)) { exit 1 }
    foreach ($ap in $asarPaths) {
        Write-Inf "Patching: $ap"
        Invoke-Patch $ap
    }
    Write-C ""
    Write-C "  Patch complete. Now configure registry with setup.ps1 or re-run with -BaseUrl." "Green"
    Write-C ""
}
elseif ($FromCli) {
    Write-Banner
    $cli = Read-CliSettings
    if (-not $cli -or -not $cli.BaseUrl) { Write-Err "CLI config not found"; exit 1 }

    $asarPaths = Find-AsarPath
    if ($asarPaths.Count -eq 0) { Write-Err "Claude Desktop not found"; exit 1 }
    Kill-Desktop
    if (-not (Ensure-AsarTool)) { exit 1 }
    Invoke-Patch $asarPaths[0]

    $mdl = $null
    if ($Models) { $mdl = $Models }
    elseif ($cli.Model) { $mdl = "[`"$($cli.Model)`"]" }
    Write-Registry -Url $cli.BaseUrl -Key $cli.ApiKey -Mdl $mdl

    Write-C ""
    Write-C "  Done! Restart Claude Desktop." "Green"
    Write-C ""
}
elseif ($BaseUrl) {
    Write-Banner
    if (-not $ApiKey) { Write-Err "-ApiKey is required"; exit 1 }
    if (-not ($BaseUrl.StartsWith("http://") -or $BaseUrl.StartsWith("https://"))) {
        Write-Err "URL must start with http:// or https://"; exit 1
    }

    $asarPaths = Find-AsarPath
    if ($asarPaths.Count -eq 0) { Write-Err "Claude Desktop not found"; exit 1 }
    Kill-Desktop
    if (-not (Ensure-AsarTool)) { exit 1 }
    Invoke-Patch $asarPaths[0]

    Write-Registry -Url $BaseUrl -Key $ApiKey -Mdl $Models

    Write-C ""
    Write-C "  Done! Restart Claude Desktop." "Green"
    Write-C ""
}
else {
    Start-Interactive
}
