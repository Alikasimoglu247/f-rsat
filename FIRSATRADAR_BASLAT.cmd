@echo off
setlocal
cd /d "%~dp0"
title FirsatRadar AI - Windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-start.ps1"
if errorlevel 1 (
  echo.
  echo FirsatRadar baslatilamadi. Hata mesajlarini inceleyin.
  pause
  exit /b 1
)
echo.
echo FirsatRadar hazir. Bu pencereyi kapatabilirsiniz.
pause
