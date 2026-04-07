@echo off
REM Auto-elevate to admin, then run setup.ps1
>nul 2>&1 reg query "HKU\S-1-5-19" && goto :run

echo Requesting admin privileges...
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"%~f0\" %*' -Verb RunAs"
exit /b

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
pause
