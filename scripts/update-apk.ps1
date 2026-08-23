<#
  update-apk.ps1
  ------------------------------------------------------------------
  Membangun ulang APK Android edisi umum dalam satu langkah.

  Jalankan dari folder proyek:
      powershell -ExecutionPolicy Bypass -File update-apk.ps1

  Hasil akhir:
    - SakuKilat.apk
#>

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $root

# Lokasi tool yang dipasang sebelumnya.
$pnpm = "$env:APPDATA\npm\node_modules\pnpm\bin\pnpm.cjs"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# Pastikan local.properties tersedia untuk Gradle SDK detection
$localProps = "$root\android\local.properties"
if (-not (Test-Path $localProps)) {
  "sdk.dir=$($env:ANDROID_HOME -replace '\\', '\\')" | Out-File $localProps -Encoding ASCII
}

Write-Host "`n[1/4] Build web statis (next export)..." -ForegroundColor Cyan
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  pnpm run build
} else {
  node $pnpm run build
}
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

Write-Host "`n[4/5] Build APK release Publik resmi lewat Gradle..." -ForegroundColor Cyan
Push-Location "$root\android"
try {
  .\gradlew.bat assemblePublicRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host "`n[5/5] Menyalin APK rilis publik ke folder root..." -ForegroundColor Cyan
$sourceCandidates = @(
  "$root\android\app\build\outputs\apk\public\release\app-public-release.apk",
  "$root\android\app\build\outputs\apk\public\release\app-public-release-unsigned.apk"
)

$foundSource = $null
foreach ($cand in $sourceCandidates) {
  if (Test-Path $cand) {
    $foundSource = $cand
    break
  }
}

if (-not $foundSource) {
  Write-Host "`nGAGAL: APK release tidak ditemukan. Cek error build di atas." -ForegroundColor Red
  exit 1
}

$pkg = Get-Content "$root\package.json" | ConvertFrom-Json
$version = $pkg.version

Copy-Item $foundSource -Destination "$root\SakuKilat.apk" -Force
Copy-Item $foundSource -Destination "$root\SakuKilat-v$version-Publik.apk" -Force

$publicSize = [math]::Round((Get-Item "$root\SakuKilat.apk").Length / 1MB, 2)
Write-Host "`nSELESAI." -ForegroundColor Green
Write-Host " - SakuKilat.apk ($publicSize MB) [v$version Publik] siap didistribusikan." -ForegroundColor Green
Write-Host " - SakuKilat-v$version-Publik.apk ($publicSize MB) tersimpan di root proyek." -ForegroundColor Green
