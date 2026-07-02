<#
  update-apk.ps1
  ------------------------------------------------------------------
  Membangun ulang dua edisi APK Android dalam satu langkah.

  Jalankan dari folder proyek:
      powershell -ExecutionPolicy Bypass -File update-apk.ps1

  Hasil akhir:
    - SakuKilat-v2.apk
    - SakuKilat-Pribadi-v2.apk
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Lokasi tool yang dipasang sebelumnya.
$pnpm = "$env:APPDATA\npm\node_modules\pnpm\bin\pnpm.cjs"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

Write-Host "`n[1/4] Build web statis (next export)..." -ForegroundColor Cyan
node $pnpm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[2/4] Sinkronisasi ke proyek Android..." -ForegroundColor Cyan
node "$root\node_modules\@capacitor\cli\bin\capacitor" sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[3/5] Bersihkan output release lama..." -ForegroundColor Cyan
$stalePaths = @(
  "$root\android\app\build\outputs\apk\public\release",
  "$root\android\app\build\outputs\apk\personal\release",
  "$root\android\app\build\intermediates\incremental\packagePublicRelease",
  "$root\android\app\build\intermediates\incremental\packagePersonalRelease"
)
foreach ($stalePath in $stalePaths) {
  if (Test-Path $stalePath) {
    Remove-Item -LiteralPath $stalePath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "`n[4/5] Build APK release lewat Gradle (bisa beberapa menit)..." -ForegroundColor Cyan
Push-Location "$root\android"
try {
  .\gradlew.bat assemblePublicRelease assemblePersonalRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host "`n[5/5] Menyalin APK ke folder root..." -ForegroundColor Cyan
$artifacts = @(
  @{
    Source = "$root\android\app\build\outputs\apk\public\release\app-public-release.apk"
    Destination = "$root\SakuKilat-v2.apk"
    Label = "SakuKilat-v2.apk"
  },
  @{
    Source = "$root\android\app\build\outputs\apk\personal\release\app-personal-release.apk"
    Destination = "$root\SakuKilat-Pribadi-v2.apk"
    Label = "SakuKilat-Pribadi-v2.apk"
  }
)

foreach ($artifact in $artifacts) {
  if (-not (Test-Path $artifact.Source)) {
    Write-Host "`nGAGAL: $($artifact.Label) tidak ditemukan. Cek error build di atas." -ForegroundColor Red
    exit 1
  }

  Copy-Item $artifact.Source -Destination $artifact.Destination -Force
}

$publicSize = [math]::Round((Get-Item "$root\SakuKilat-v2.apk").Length / 1MB, 2)
$personalSize = [math]::Round((Get-Item "$root\SakuKilat-Pribadi-v2.apk").Length / 1MB, 2)
Write-Host "`nSELESAI." -ForegroundColor Green
Write-Host " - SakuKilat-v2.apk ($publicSize MB) siap untuk user umum." -ForegroundColor Green
Write-Host " - SakuKilat-Pribadi-v2.apk ($personalSize MB) berisi data awal pribadi." -ForegroundColor Green
