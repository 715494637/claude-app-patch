@echo off
chcp 65001 >nul 2>nul
title Claude Desktop Patcher
echo.
echo ========================================
echo   Claude Desktop Patcher
echo ========================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install: https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

:: Kill portable Claude if running (don't touch CLI)
echo Closing patched Claude Desktop if running...
powershell -Command "Get-Process -Name claude -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like '*claude-portable*' } | Stop-Process -Force" >nul 2>&1
timeout /t 3 /nobreak >nul

:: Clean old portable dir
if exist claude-portable (
    echo Removing old portable dir...
    powershell -Command "Remove-Item -Recurse -Force '%~dp0claude-portable' -ErrorAction SilentlyContinue" >nul 2>&1
    timeout /t 1 /nobreak >nul
)

echo [1/2] Installing dependencies...
call npm install --no-audit --no-fund >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo       Done

echo [2/2] Patching...
echo.
node patch-claude.js
echo.

pause
