@echo off
setlocal
cd /d "%~dp0"
title FirsatRadar AI - Mevcut Windows kurulumunu guncelle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-install-update.ps1"
if errorlevel 1 (
  echo Islem tamamlanamadi. Hata mesajina bakin; volume silinmez.
  pause
  exit /b 1
)
echo Mevcut kurulum guncellendi. Bu pencereyi kapatabilirsiniz.
pause
