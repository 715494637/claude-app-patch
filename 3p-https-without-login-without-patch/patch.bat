@echo off
REM ============================================================
REM  Claude Desktop 3P Gateway Patch Launcher
REM  Patches app.asar to allow HTTP endpoints, then configures
REM  registry for 3P Gateway mode (no login required).
REM ============================================================

REM Auto-elevate to Administrator
>nul 2>&1 reg query "HKU\S-1-5-19" && goto :run

echo Requesting admin privileges...
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"%~f0\" %*' -Verb RunAs"
exit /b

:run
echo.
echo [*] Claude Desktop 3P Gateway Patch
echo [*] Closing Claude Desktop...

powershell -NoProfile -Command ^
  "Get-Process claude -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "  try { $p = $_.Path } catch { $p = '' };" ^
  "  if ($p -like '*WindowsApps*' -or $p -like '*claude-portable*' -or $p -like '*AnthropicClaude*') {" ^
  "    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue" ^
  "  }" ^
  "}"
timeout /t 2 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch.ps1" %*
pause
