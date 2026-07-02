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
$publicState = Join-Path $root 'public\preloaded-state.json'
$ownerState = Join-Path $root 'outputs\money-android-preview-state.json'
$personalAssets = Join-Path $root 'android\app\src\personal\assets\public'
$backupState = Join-Path $root '.next\preloaded-state.backup.json'

# Lokasi tool yang dipasang sebelumnya.
$pnpm = "$env:APPDATA\npm\node_modules\pnpm\bin\pnpm.cjs"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

if (-not (Test-Path $ownerState)) {
  Write-Host "`nGAGAL: data owner tidak ditemukan di $ownerState" -ForegroundColor Red
  exit 1
}

if (Test-Path $publicState) {
  Copy-Item $publicState $backupState -Force
}

try {
  Write-Host "`n[1/6] Build web user (Saku Kilat V2)..." -ForegroundColor Cyan
  $env:NEXT_PUBLIC_APP_VARIANT = 'user'
  node $pnpm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "`n[2/6] Sinkronisasi aset user ke Android..." -ForegroundColor Cyan
  node "$root\node_modules\@capacitor\cli\bin\capacitor" sync android
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "`n[3/6] Build web personal (SakuKilat)..." -ForegroundColor Cyan
  Copy-Item $ownerState $publicState -Force
  $env:NEXT_PUBLIC_APP_VARIANT = 'owner'
  node $pnpm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  if (Test-Path $personalAssets) {
    Remove-Item -LiteralPath $personalAssets -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $personalAssets | Out-Null
  Copy-Item (Join-Path $root 'out\*') $personalAssets -Recurse -Force

  Write-Host "`n[4/6] Pulihkan aset web user..." -ForegroundColor Cyan
  if (Test-Path $backupState) {
    Copy-Item $backupState $publicState -Force
  } else {
    '{}' | Set-Content $publicState
  }
  $env:NEXT_PUBLIC_APP_VARIANT = 'user'
  node $pnpm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Remove-Item Env:NEXT_PUBLIC_APP_VARIANT -ErrorAction SilentlyContinue
  if (Test-Path $backupState) {
    Remove-Item $backupState -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "`n[5/7] Bersihkan output release lama..." -ForegroundColor Cyan
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

Write-Host "`n[6/7] Build APK release lewat Gradle (bisa beberapa menit)..." -ForegroundColor Cyan
Push-Location "$root\android"
try {
  .\gradlew.bat assemblePublicRelease assemblePersonalRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host "`n[7/7] Menyalin APK ke folder root..." -ForegroundColor Cyan
$artifacts = @(
  @{
    SourceDir = "$root\android\app\build\outputs\apk\public\release"
    Pattern = "app-public-release*.apk"
    Destination = "$root\SakuKilat-v2.apk"
    Label = "SakuKilat-v2.apk"
  },
  @{
    SourceDir = "$root\android\app\build\outputs\apk\personal\release"
    Pattern = "app-personal-release*.apk"
    Destination = "$root\SakuKilat-Pribadi-v2.apk"
    Label = "SakuKilat-Pribadi-v2.apk"
  }
)

foreach ($artifact in $artifacts) {
  $source = Get-ChildItem -LiteralPath $artifact.SourceDir -Filter $artifact.Pattern -File |
    Select-Object -First 1

  if (-not $source) {
    Write-Host "`nGAGAL: $($artifact.Label) tidak ditemukan. Cek error build di atas." -ForegroundColor Red
    exit 1
  }

  Copy-Item $source.FullName -Destination $artifact.Destination -Force
}

$publicSize = [math]::Round((Get-Item "$root\SakuKilat-v2.apk").Length / 1MB, 2)
$personalSize = [math]::Round((Get-Item "$root\SakuKilat-Pribadi-v2.apk").Length / 1MB, 2)
Write-Host "`nSELESAI." -ForegroundColor Green
Write-Host " - SakuKilat-v2.apk ($publicSize MB) siap untuk user umum." -ForegroundColor Green
Write-Host " - SakuKilat-Pribadi-v2.apk ($personalSize MB) berisi data awal pribadi." -ForegroundColor Green
