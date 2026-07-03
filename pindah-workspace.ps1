<#
  pindah-workspace.ps1
  ==================================================================
  Memindahkan proyek SakuKilat KELUAR dari OneDrive ke:
      C:\Users\HYPE AMD\Downloads\VIBE CODING\SakuKilat

  PENTING — BACA DULU:
  1. TUTUP IDE (VS Code / Kiro) sebelum menjalankan script ini.
  2. Jalankan lewat PowerShell biasa (klik kanan > Run with PowerShell),
     ATAU:  powershell -ExecutionPolicy Bypass -File pindah-workspace.ps1
  3. Script ini MENYALIN (bukan memindah paksa) supaya aman — folder asli
     tidak dihapus. Setelah verifikasi folder baru jalan normal, kamu bisa
     hapus folder lama secara manual.

  Folder yang SENGAJA dilewati (akan dibuat ulang otomatis):
      node_modules, .next, out, android\build, android\.gradle, logs
  Setelah pindah cukup jalankan: pnpm install
#>

$ErrorActionPreference = 'Stop'

$sumber  = $PSScriptRoot
$tujuan  = 'C:\Users\HYPE AMD\Downloads\VIBE CODING\SakuKilat'

Write-Host "Sumber : $sumber"  -ForegroundColor Cyan
Write-Host "Tujuan : $tujuan`n" -ForegroundColor Cyan

if (-not (Test-Path $tujuan)) {
  New-Item -ItemType Directory -Path $tujuan -Force | Out-Null
}

# robocopy /MIR meniru struktur, /XD melewati folder berat/regenerate,
# /XF melewati file log yang terkunci. /NFL /NDL = output ringkas.
$excludeDirs  = @('node_modules', '.next', 'out', 'logs',
                  'android\build', 'android\.gradle', 'android\app\build')
$excludeFiles = @('*.log')

$xd = $excludeDirs  | ForEach-Object { Join-Path $sumber $_ }

robocopy $sumber $tujuan /E /XD @xd /XF @excludeFiles /NFL /NDL /NP /R:1 /W:1

# robocopy exit code < 8 = sukses (8+ = error nyata)
if ($LASTEXITCODE -ge 8) {
  Write-Host "`nGAGAL menyalin (kode $LASTEXITCODE). Cek pesan di atas." -ForegroundColor Red
  exit 1
}

Write-Host "`n==================================================================" -ForegroundColor Green
Write-Host "SELESAI menyalin ke lokasi baru." -ForegroundColor Green
Write-Host "Langkah berikutnya:" -ForegroundColor Green
Write-Host "  1. Buka folder baru di IDE:" -ForegroundColor Green
Write-Host "       `"$tujuan`"" -ForegroundColor White
Write-Host "  2. Install dependency di lokasi baru:" -ForegroundColor Green
Write-Host "       pnpm install" -ForegroundColor White
Write-Host "  3. Setelah dipastikan jalan normal, hapus folder lama di OneDrive." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
