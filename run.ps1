# Киберрывок 2026: Скрипт запуска платформы (PowerShell)
$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $RootPath
python start.py
