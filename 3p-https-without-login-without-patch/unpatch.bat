@echo off
REM Restore original app.asar and remove all 3P Gateway configuration
>nul 2>&1 reg query "HKU\S-1-5-19" && goto :run

echo Requesting admin privileges...
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
exit /b

:run
echo.
echo [*] Restoring Claude Desktop to original state...

powershell -NoProfile -Command ^
  "Get-Process claude -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "  try { $p = $_.Path } catch { $p = '' };" ^
  "  if ($p -like '*WindowsApps*' -or $p -like '*claude-portable*' -or $p -like '*AnthropicClaude*') {" ^
  "    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue" ^
  "  }" ^
  "}"
timeout /t 2 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch.ps1" -Uninstall
pause
