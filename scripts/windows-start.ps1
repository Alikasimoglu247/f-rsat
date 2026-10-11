# FirsatRadar AI - one-time configuration + Docker Desktop startup.
# Windows PowerShell 5.1 compatible; never overwrites an existing secret/config file.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path (Get-Location).Path ".env.windows.local"
$composeFile = Join-Path (Get-Location).Path "compose.windows.yaml"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop bulunamadi. Once Docker Desktop'i kurup baslatin: https://www.docker.com/products/docker-desktop/"
}
docker info --format "{{.Server.Version}}" *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop motoru calismiyor. Docker Desktop'i acin, hazir olmasini bekleyin ve yeniden deneyin."
}
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose bulunamadi. Docker Desktop'i guncelleyin." }

if (-not (Test-Path -LiteralPath $envPath)) {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $secret = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
  # ASCII prevents BOM issues in Docker's dotenv parser.
  @(
    "POSTGRES_USER=radar"
    "POSTGRES_PASSWORD=$secret"
    "POSTGRES_DB=firsatradar"
    "DATABASE_URL=postgresql://radar:$secret@postgres:5432/firsatradar?schema=public"
    "APP_BASE_URL=http://127.0.0.1:3000"
    "APP_ACCESS_TOKEN="
    "INVESTMENT_RESEARCH_CRON=0 9 * * *"
    "AI_ENABLED=false"
  ) | Set-Content -LiteralPath $envPath -Encoding ASCII
  Write-Host "Ilk kurulum ayarlari olusturuldu (sifreler saklanir, ekrana basilmaz)."
} else {
  Write-Host "Mevcut .env.windows.local korundu."
}
Write-Host "Uygulama hazirlaniyor. Ilk calistirma internete ve bilgisayara gore zaman alabilir..."
& docker compose --project-name firsatradar --env-file $envPath -f $composeFile up -d --build --wait --wait-timeout 240
if ($LASTEXITCODE -ne 0) {
  Write-Host "Baslatma tamamlanamadi. Son servis durumlari:"
  & docker compose --project-name firsatradar --env-file $envPath -f $composeFile ps
  throw "Docker kurulum/hazirlik hatasi. Yukaridaki mesaja bakin; hicbir veri volume'u silinmedi."
}
Write-Host ""
Write-Host "FIRSATRADAR HAZIR: http://127.0.0.1:3000/yatirim-analizi"
Write-Host "Arastirma her gun 09.00 Europe/Istanbul'da, bilgisayar ve Docker acikken calisir."
Write-Host "Ilk kurulum yeni bos veritabani acar; Cloud'daki ilanlari kendi basina tasimaz."
Start-Process "http://127.0.0.1:3000/yatirim-analizi"
