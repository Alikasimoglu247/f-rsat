@echo off
setlocal
cd /d "%~dp0"
title FirsatRadar AI - Guvenli guncelleme
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-update.ps1"
if errorlevel 1 (
  echo Guncelleme tamamlanamadi. Veri volume'u silinmedi. Yukaridaki hata ve yedek konumuna bakin.
  pause
  exit /b 1
)
echo Guncelleme tamamlandi. Mevcut ayarlar ve veritabani korundu.
pause
