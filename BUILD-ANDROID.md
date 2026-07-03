# Build SakuKilat jadi Aplikasi Android (Capacitor)

Aplikasi ini sudah disiapkan untuk dibungkus jadi APK/AAB native lewat
[Capacitor](https://capacitorjs.com). Sebagian besar konfigurasi sudah dilakukan —
tinggal langkah yang butuh package manager sehat + Android Studio di mesinmu.

## Yang sudah disiapkan ✅

- `next.config.mjs` → `output: 'export'` aktif otomatis saat `BUILD_TARGET=mobile`
- `capacitor.config.ts` → konfigurasi app (appId, splash, warna)
- `package.json` → script `build:mobile`, `sync:mobile`, `open:android`
- Sudah diverifikasi: aplikasi **bisa** static export (tidak ada API route /
  server action / next/image yang butuh server)

## Prasyarat (sekali saja)

1. **Package manager sehat.** Di lingkungan ini `pnpm` belum terpasang dan
   `npm` gagal resolve dependency. Perbaiki dulu salah satu:
   ```powershell
   # Opsi A — aktifkan pnpm (jalankan PowerShell sebagai Administrator)
   corepack enable
   corepack prepare pnpm@11.9.0 --activate

   # Opsi B — pakai npm, bersihkan cache yang korup dulu
   npm cache clean --force
   ```
   Catatan: kalau `npm`/`pnpm` diblokir execution policy, jalankan sekali:
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

2. **Android Studio** terpasang (untuk SDK, Gradle, dan emulator/build).
   Download: https://developer.android.com/studio

## Langkah build

```powershell
# 1. Install Capacitor (sekali saja)
pnpm add -D @capacitor/cli cross-env
pnpm add @capacitor/core @capacitor/android

# 2. Inisialisasi platform Android (sekali saja) — membuat folder /android
npx cap add android

# 3. Build web statis + sync ke proyek Android
pnpm sync:mobile

# 4. Buka di Android Studio untuk build APK/AAB
pnpm open:android
```

Di Android Studio: **Build > Build Bundle(s)/APK(s)** untuk APK debug, atau
**Build > Generate Signed Bundle/APK** untuk AAB yang siap diunggah ke Play Store.

## Sebelum publish ke Play Store

- [ ] **Ganti `appId`** di `capacitor.config.ts` dari `com.sakukilat.app` ke
      domain milikmu. Package name **tidak bisa diubah** setelah app live.
- [ ] Siapkan **keystore** untuk signing (Android Studio bisa generate).
- [ ] Ikon launcher: taruh ikon adaptif di `android/app/src/main/res/`
      (Android Studio punya Asset Studio: kanan-klik `res` > New > Image Asset).
- [ ] **Firebase Auth di WebView:** `signInWithPopup` sering gagal di WebView.
      Kode di `lib/store.tsx` sudah punya fallback `signInWithRedirect` untuk
      device kecil/standalone. Tambahan untuk Capacitor:
      - Tambahkan domain app (`https://localhost` dan domain hosting-mu) ke
        **Firebase Console > Authentication > Settings > Authorized domains**.
      - Pertimbangkan plugin native auth (mis. `@capacitor-firebase/authentication`)
        kalau redirect web masih bermasalah di dalam WebView.

## Update aplikasi nanti

Setiap kali ada perubahan kode, cukup jalankan ulang:
```powershell
pnpm sync:mobile
```
lalu build ulang di Android Studio.
