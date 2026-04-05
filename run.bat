@echo off
chcp 65001 >nul
title Claude Desktop Patcher
echo.
echo ========================================
echo   Claude Desktop Patcher - 一键补丁
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 进入脚本所在目录
cd /d "%~dp0"

:: 安装依赖
echo [1/2] 安装依赖...
call npm install --no-audit --no-fund >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo       完成

:: 运行补丁
echo [2/2] 运行补丁...
echo.
node patch-claude.js
echo.

pause
