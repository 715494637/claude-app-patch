@echo off
REM Auto-elevate to admin
>nul 2>&1 reg query "HKU\S-1-5-19" && goto :run
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"%~f0\" %*' -Verb RunAs"
exit /b

:run
echo [*] Closing Claude Desktop...
powershell -NoProfile -Command ^
  "Get-Process claude -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "  try { $p = $_.Path } catch { $p = '' };" ^
  "  if ($p -like '*WindowsApps*' -or $p -like '*claude-portable*') {" ^
  "    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue" ^
  "  }" ^
  "}"
timeout /t 2 /nobreak >nul

node "%~dp0setup.js" %*
pause
