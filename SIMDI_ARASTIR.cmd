@echo off
setlocal
cd /d "%~dp0"
title FirsatRadar AI - Arastirma
if not exist ".env.windows.local" (
  echo Once FIRSATRADAR_BASLAT.cmd dosyasini calistirin.
  pause
  exit /b 1
)
docker compose --project-name firsatradar --env-file .env.windows.local -f compose.windows.yaml run --rm --no-deps research npm run research -- --rounds 6
if errorlevel 1 (
  echo.
  echo Arastirma hatasi var. Kayitlar silinmedi.
) else (
  echo.
  echo Arastirma tamamlandi. Tarayicida Yatirim Analizi sayfasini yenileyebilirsiniz.
)
pause
