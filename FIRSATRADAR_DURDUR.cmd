@echo off
setlocal
cd /d "%~dp0"
title FirsatRadar AI - Durdur
if not exist ".env.windows.local" (
  echo Yerel kurulum dosyasi bulunamadi.
  pause
  exit /b 1
)
docker compose --project-name firsatradar --env-file .env.windows.local -f compose.windows.yaml stop
if errorlevel 1 (
  echo Durdurulurken hata alindi.
) else (
  echo Uygulama durduruldu. Veritabani volume'u ve kayitlar korundu.
)
pause
