@echo off
REM Auto-elevate to admin
>nul 2>&1 reg query "HKU\S-1-5-19" && goto :run
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"%~f0\" %*' -Verb RunAs"
exit /b

:run
node "%~dp0setup.js" %*
pause
