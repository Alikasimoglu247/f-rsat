# Run from the extracted private handoff ZIP. The user selects the existing
# installation once; code and public research merge into that directory.
$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Mevcut FirsatRadar klasorunuzu secin (.env.windows.local bulunan klasor). Yeni ZIP klasorunu secmeyin."
$dialog.ShowNewFolderButton = $false
try {
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "Klasor secilmedi; mevcut kurulum degistirilmedi." }
  $target = $dialog.SelectedPath
} finally { $dialog.Dispose() }
if ($target -eq $source) { throw "Yeni paket yerine eski kurulum klasorunuzu secin." }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-update.ps1") -SourceDirectory $source -TargetDirectory $target
if ($LASTEXITCODE -ne 0) { throw "Guncelleme/aktarim tamamlanamadi. Yukaridaki hata ve yedek konumuna bakin." }
