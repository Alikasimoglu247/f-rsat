# Windows PowerShell 5.1. Updates ZIP installations in-place, never deletes a volume.
param([string]$SourceDirectory = "", [string]$TargetDirectory = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if ($TargetDirectory) { $root = (Resolve-Path -LiteralPath $TargetDirectory).Path }
Set-Location -LiteralPath $root
$envPath = Join-Path $root ".env.windows.local"
if (-not (Test-Path -LiteralPath $envPath)) { throw "Mevcut .env.windows.local yok. Yeni kurulum icin FIRSATRADAR_BASLAT.cmd kullanin." }
if (Test-Path -LiteralPath (Join-Path $root ".git")) { throw "Bu guncelleyici ZIP kurulumu icindir. Git checkout'unuzu degistirmez. Git ile feature/m2-email-discovery dalini guncelleyip FIRSATRADAR_BASLAT.cmd calistirin." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop bulunamadi." }
docker info --format "{{.ServerVersion}}" *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop motoru hazir degil." }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".local\windows-backups\$stamp"
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("firsatradar-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage,$backup -Force | Out-Null
try {
  if (-not $SourceDirectory) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $stage "source.zip"
    Write-Host "PR dalinin guncel surumu GitHub'dan aliniyor..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/Alikasimoglu247/f-rsat/zip/refs/heads/feature/m2-email-discovery" -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $stage "source")
    $SourceDirectory = (Get-ChildItem -LiteralPath (Join-Path $stage "source") -Directory | Select-Object -First 1).FullName
  }
  if (-not (Test-Path -LiteralPath (Join-Path $SourceDirectory "compose.windows.yaml")) -or -not (Test-Path -LiteralPath (Join-Path $SourceDirectory "package-lock.json"))) { throw "Guncelleme paketi dogrulanamadi." }
  # The staged ZIP intentionally has no credentials file. Interpolate from the
  # existing --env-file without trying to open a staged .env.windows.local.
  & docker compose --project-name firsatradar --env-file $envPath -f (Join-Path $SourceDirectory "compose.windows.yaml") config --no-env-resolution --quiet
  if ($LASTEXITCODE -ne 0) { throw "Yeni Compose mevcut ayarlarla dogrulanamadi; eski kurulum korunuyor." }
  $files = @(Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File | Where-Object {
    $relative = $_.FullName.Substring($SourceDirectory.TrimEnd('\').Length + 1)
    $relative -notmatch '(^|\\)(\.env[^\\]*|\.local|\.git|node_modules|\.next|test-results|playwright-report)(\\|$)' -and $relative -ne "FIRSATRADAR_GERCEK_VERI.json"
  })
  if ($files.Count -lt 20) { throw "Eksik kaynak paketi; dosyalariniza dokunulmadi." }
  # Compose's fixed project name preserves firsatradar_radar_postgres across ZIP folders.
  & docker compose --project-name firsatradar --env-file $envPath -f compose.windows.yaml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/firsatradar-update.dump'
  if ($LASTEXITCODE -ne 0) { throw "Veritabani yedegi alinamadi; guncelleme baslatilmadi. Mevcut uygulamayi once baslatin." }
  & docker compose --project-name firsatradar --env-file $envPath -f compose.windows.yaml cp postgres:/tmp/firsatradar-update.dump (Join-Path $backup "database.dump")
  if ($LASTEXITCODE -ne 0) { throw "Veritabani yedegi Windows'a alinamadi; dosyalariniza dokunulmadi." }
  $configHash = (Get-FileHash -LiteralPath $envPath -Algorithm SHA256).Hash
  & docker compose --project-name firsatradar --env-file $envPath -f compose.windows.yaml stop web research
  if ($LASTEXITCODE -ne 0) { throw "Servisler durdurulamadi; guncelleme iptal edildi." }
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($SourceDirectory.TrimEnd('\').Length + 1)
    $destination = Join-Path $root $relative
    if (Test-Path -LiteralPath $destination) {
      # Preserve local source edits: retain every overwritten file in the backup.
      $saved = Join-Path (Join-Path $backup "code") $relative
      New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null
      Copy-Item -LiteralPath $destination -Destination $saved
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }
  if ((Get-FileHash -LiteralPath $envPath -Algorithm SHA256).Hash -ne $configHash) { throw "Ayar dosyasi beklenmedik sekilde degisti; yedekler: $backup" }
  Write-Host "Ayarlar korundu. Veritabani ve onceki kod yedegi: $backup"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\windows-start.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Yeni surum hazir olmadi. Yedek: $backup. PostgreSQL volume'u silinmedi; database.dump otomatik geri yuklenmez." }
  $researchPackage = Join-Path $SourceDirectory "FIRSATRADAR_GERCEK_VERI.json"
  if (Test-Path -LiteralPath $researchPackage) {
    Write-Host "Ozel Cloud arastirma paketi bulundu. Butunluk ve birlestirme onizlemesi yapiliyor..."
    & docker compose --project-name firsatradar --env-file $envPath -f compose.windows.yaml cp $researchPackage web:/tmp/firsatradar-transfer.json
    if ($LASTEXITCODE -ne 0) { throw "Paket aktarilamadi. Kayitlar silinmedi; Arastirma Merkezi'nden tekrar deneyebilirsiniz." }
    & docker compose --project-name firsatradar --env-file $envPath -f compose.windows.yaml exec -T web npm run research:transfer -- preview /tmp/firsatradar-transfer.json
    if ($LASTEXITCODE -ne 0) { throw "Cloud paketi onizlemesi basarisiz; veri yazilmadi. Aktif arastirma varsa tamamlaninca uygulamadan yukleyin." }
    & docker compose --project-name firsatradar --env-file $envPath -f compose.windows.yaml exec -T web npm run research:transfer -- import /tmp/firsatradar-transfer.json --apply
    if ($LASTEXITCODE -ne 0) { throw "Cloud aktarimi tamamlanamadi; hata nedeniyle transaction geri alindi. Yerel kayitlar silinmedi." }
    Write-Host "Cloud arastirma kayitlari birlestirildi. Ikinci aktarim mukerrer uretmez."
  }
} finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
