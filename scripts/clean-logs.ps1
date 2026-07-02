<#
  clean-logs.ps1
  Menyapu semua *.log dari root proyek ke folder /logs (atau hapus dengan -Purge).
  Pakai:  pwsh -ExecutionPolicy Bypass -File scripts/clean-logs.ps1
          pwsh -ExecutionPolicy Bypass -File scripts/clean-logs.ps1 -Purge
#>
param([switch]$Purge)

$root = Split-Path $PSScriptRoot -Parent
$logs = Join-Path $root 'logs'

$files = Get-ChildItem -Path $root -Filter '*.log' -File -ErrorAction SilentlyContinue
if (-not $files) { Write-Host 'Root sudah bersih. Tidak ada *.log.' -ForegroundColor Green; exit 0 }

if ($Purge) {
  $files | Remove-Item -Force
  Write-Host "Dihapus $($files.Count) file log dari root." -ForegroundColor Yellow
  exit 0
}

if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }
foreach ($f in $files) {
  Move-Item -Path $f.FullName -Destination (Join-Path $logs $f.Name) -Force
}
Write-Host "Dipindahkan $($files.Count) file log ke /logs." -ForegroundColor Green
