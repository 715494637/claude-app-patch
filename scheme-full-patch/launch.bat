@echo off
title Claude (Full Patched)
echo [*] Closing Claude Desktop...
powershell -NoProfile -Command ^
  "Get-Process claude -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "  try { $p = $_.Path } catch { $p = '' };" ^
  "  if ($p -like '*WindowsApps*' -or $p -like '*claude-portable*') {" ^
  "    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue" ^
  "  }" ^
  "}"
timeout /t 2 /nobreak >nul

cd /d "%~dp0claude-portable"
start "" "claude.exe" %*
