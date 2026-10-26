@echo off
title CyberBreak 2026 - Launcher
cd /d "%~dp0"

echo ========================================================
echo   CyberBreak 2026 - Semantic Video Search Platform
echo ========================================================
echo.

echo [1/2] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Python is not found in PATH!
    echo Please install Python 3.11+ and check "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

echo [2/2] Launching backend and frontend...
echo.
python start.py
if errorlevel 1 (
    echo.
    echo [ERROR] Process exited with error code %errorlevel%.
    pause
)
