# LAPORAN TEKNIS: PERBAIKAN PERSISTENSI ONBOARDING TOUR (TAHAN RESTART & UPDATE APK)

**Aplikasi**: SakuKilat Android  
**Package ID**: `com.sakukilat.app.v2`  
**Version**: `1.0.7` (VersionCode: `13`)  
**Keystore SHA-256**: `13dccbbd787224435ad6ac5330fd96c5de30a5f703ee87689b46bf21991a90a4`  
**Branch**: `feat/navigation-entry-category-responsive`  
**Tanggal**: 12 September 2026  
**Status Eksekusi**: Selesai, Terverifikasi 100%, dan APK Tester Siap Diuji

---

## 1. Analisis Akar Masalah (Root Cause)

Pada pengujian APK tester fisik, data transaksi, dompet, dan profil pengguna tidak hilang, namun tour panduan onboarding selalu muncul dari awal setiap kali aplikasi ditutup dan dibuka ulang.

Melalui investigasi kode sumber, ditemukan **tiga akar masalah utama**:

1. **Penghapusan oleh Fungsi Pembersih Storage (`cleanupStaleStorageKeys` di `lib/storage.ts`)**:
   - `lib/store.tsx` memanggil `cleanupStaleStorageKeys(window.localStorage)` setiap kali aplikasi melakukan boot/mount dengan status storage `valid` atau `missing`.
   - Di `lib/storage.ts`, konstanta `ONBOARDING_STORAGE_KEY_PREFIX` sebelumnya bernilai `'sakukilat:onboarding:'` (format lama), sedangkan komponen `OnboardingTour` menulis kunci berawalan `'sakukilat:v2:onboarding-completed-v'`.
   - Prefix `'sakukilat:v2:onboarding-completed-v'` dan `'sakukilat:v2:onboarding-completed'` **belum didaftarkan** dalam `PRESERVED_KEY_PREFIXES` di `lib/storage.ts` maupun di `lib/store.tsx`.
   - Akibatnya: Setiap kali aplikasi dibuka, `cleanupStaleStorageKeys` menganggap kunci onboarding tersebut sebagai data usang/sampah yang tidak dikenal dan **menghapusnya secara otomatis (`storage.removeItem(key)`)**.

2. **Ketiadaan Sinkronisasi Native Durable Storage (`@capacitor/preferences` di `lib/native-store.ts`)**:
   - WebView Android memperlakukan `localStorage` seperti cache yang rentan hilang saat proses restart aplikasi atau pembersihan cache background oleh sistem operasi.
   - SakuKilat memiliki lapisan native durable storage berbasis SharedPreferences Android via `@capacitor/preferences`. Namun, array `TRACKED_KEYS` di `lib/native-store.ts` **tidak memuat kunci onboarding**.
   - Fungsi `writeCompleted` pada `components/onboarding-tour.tsx` hanya menulis ke `window.localStorage` tanpa memanggil `mirrorToNative()`, sehingga SharedPreferences native tidak pernah menyimpan flag selesai panduan.
   - Saat boot aplikasi, `hydrateFromNative()` menyaring kunci hanya berdasarkan `TRACKED_KEYS`, sehingga flag onboarding tidak pernah dipulihkan ke `localStorage`.

3. **Inkonsistensi Kunci Pengguna & Ketiadaan Multi-Key Fallback**:
   - Kunci onboarding awal dibentuk dengan menyematkan email user: `sakukilat:v2:onboarding-completed-v9:${encodeURIComponent(user.email)}`.
   - Pada saat inisialisasi awal sebelum auth ready, `user.email` bernilai `null` / `'local'`, sehingga terjadi diskrepansi antara kunci yang ditulis dan yang dibaca saat boot.

---

## 2. Rincian File yang Diubah & Solusi Implementasi

### 2.1. [`lib/storage.ts`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/lib/storage.ts)
- Menambahkan `'sakukilat:v2:onboarding-completed'` ke dalam `KNOWN_STORAGE_KEYS`.
- Memperbarui `ONBOARDING_STORAGE_KEY_PREFIX = 'sakukilat:v2:onboarding-completed-v'` dan menyediakan array `ONBOARDING_STORAGE_KEY_PREFIXES`.
- Menambahkan `'sakukilat:v2:onboarding-completed'`, `'sakukilat:v2:onboarding-completed-v'`, dan `'sakukilat:onboarding:'` ke dalam `PRESERVED_KEY_PREFIXES`.
- Memperbarui filter pengecualian pada `cleanupStaleStorageKeys()` sehingga kunci onboarding kebal dari pembersihan otomatis.

### 2.2. [`lib/store.tsx`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/lib/store.tsx)
- Menambahkan `'sakukilat:v2:onboarding-completed'` ke dalam `KNOWN_STORAGE_KEYS`.
- Menambahkan `'sakukilat:v2:onboarding-completed'`, `'sakukilat:v2:onboarding-completed-v'`, dan `'sakukilat:onboarding:'` ke dalam `PRESERVED_KEY_PREFIXES` agar sinkron dengan `lib/storage.ts`.

### 2.3. [`lib/native-store.ts`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/lib/native-store.ts)
- Menambahkan kunci kanonikal onboarding ke dalam `CANONICAL_TRACKED_KEYS`.
- Membuat fungsi pembantu `isTrackedKey(key: string): boolean` yang mengenali seluruh varian prefix kunci onboarding.
- Memperbarui `localEntries()`, `applyEntries()`, `hydrateFromNative()`, `syncAllToNative()`, `mirrorToNative()`, dan `removeFromNative()` agar seluruh flag onboarding secara otomatis dicerminkan ke `@capacitor/preferences` (Android SharedPreferences) dan dipulihkan saat startup.

### 2.4. [`lib/onboarding-storage.ts`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/lib/onboarding-storage.ts) *(File Baru)*
- Modul murni TypeScript untuk pengelolaan status onboarding:
  - `readCompleted(userId)`: Memeriksa multi-key fallback (`targetKey`, `localKey`, `canonicalKey`, dan pemindaian prefix). Jika salah satu flag bernilai `'1'`, mengembalikan `true`.
  - `writeCompleted(userId)`: Menulis ke `targetKey`, `localKey`, dan `canonicalKey` secara bersamaan, serta memanggil `mirrorToNative()` untuk memastikan penyimpanan native durable.

### 2.5. [`components/onboarding-tour.tsx`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/components/onboarding-tour.tsx)
- Mengimpor dan mengekspor ulang utilitas dari `lib/onboarding-storage.ts`.
- Komponen tetap mempertahankan fungsionalitas UI yang ada, namun kini membaca dan menulis status penyelesaian dengan lapisan penyimpanan tahan restart.

---

## 3. Test Regresi yang Ditambahkan

Dibuat suite pengujian otomatis baru pada [`scripts/test-onboarding-persistence.mjs`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/scripts/test-onboarding-persistence.mjs) dan didaftarkan ke runner pengujian utama [`scripts/run-all-tests.mjs`](file:///c:/Users/HYPE%20AMD/Projects/SakuKilat/scripts/run-all-tests.mjs).

Cakupan pengujian:
1. **Test 1**: `readCompleted` mengembalikan `false` pada instalasi baru / storage kosong.
2. **Test 2**: `writeCompleted` menulis multi-key flags (`targetKey`, `localKey`, `canonicalKey`) dan terbaca `true` oleh `readCompleted`.
3. **Test 3**: `cleanupStaleStorageKeys` **TIDAK** menghapus kunci onboarding baru maupun legacy (`v8`/`onboarding:`), namun tetap membersihkan kunci sampah yang tidak dikenal.
4. **Test 4**: `isTrackedKey` di `lib/native-store.ts` mengenali kunci onboarding untuk sinkronisasi native `@capacitor/preferences`.
5. **Test 5**: Simulasi siklus hidup restart aplikasi (selesai tour -> reboot aplikasi -> pembersihan storage berjalan -> tour dicek kembali) membuktikan onboarding tetap selesai dan tidak muncul kembali.

Hasil eksekusi: **5/5 PASS (LULUS 100%)**.

---

## 4. Hasil Verifikasi & Uji Kualitas Lengkap

| No | Perintah Verifikasi | Status | Hasil Faktual |
|---|---|---|---|
| 1 | `node scripts/test-onboarding-persistence.mjs` | **LULUS (Code 0)** | 5/5 skenario persistensi onboarding lolos |
| 2 | `pnpm test` | **LULUS (Code 0)** | 13 regression test suites + 1 security scan lolos (0 failed) |
| 3 | `pnpm exec tsc --noEmit` | **LULUS (Code 0)** | 0 error TypeScript pada seluruh proyek |
| 4 | `pnpm build` | **LULUS (Code 0)** | Static web production build Next.js 16.2.6 sukses |
| 5 | `pnpm build:mobile` | **LULUS (Code 0)** | Static export mobile Capacitor sukses |
| 6 | `git diff --check` | **LULUS (Code 0)** | Bersih, 0 whitespace error / conflict marker |

---

## 5. Hasil Build & Audit APK Tester Android

Kompilasi ulang dieksekusi menggunakan skrip resmi:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/update-apk.ps1
```

### 5.1. Log & Ukuran APK
- **Status Gradle**: `BUILD SUCCESSFUL in 29s` (261 actionable tasks).
- **Ukuran File**: `6.16 MB` (wajar dan sehat).
- **Lokasi File**:
  - `c:\Users\HYPE AMD\Projects\SakuKilat\SakuKilat.apk` (Repo Root)
  - `C:\Users\HYPE AMD\Downloads\SakuKilat.apk` (Downloads Cepat)

### 5.2. Audit Keamanan & Identitas APK
1. **Sertifikat Digital (`apksigner verify --verbose --print-certs SakuKilat.apk`)**:
   - `Verifies`: **True** (APK Signature Scheme v2)
   - `Signer DN`: `CN=SakuKilat, OU=Mobile, O=SakuKilat, L=Jakarta, ST=DKI Jakarta, C=ID`
   - `Signer SHA-256 Digest`: `13dccbbd787224435ad6ac5330fd96c5de30a5f703ee87689b46bf21991a90a4` *(100% identik dengan sertifikat rilis resmi)*.
2. **Manifest Aplikasi (`aapt dump badging SakuKilat.apk`)**:
   - `package: name`: `com.sakukilat.app.v2` *(Kanonikal tunggal)*
   - `versionCode`: `13` *(Tidak dinaikkan, sesuai instruksi)*
   - `versionName`: `1.0.7` *(Tidak dinaikkan, sesuai instruksi)*

---

## 6. Instruksi Singkat Pengujian di HP

Untuk memvalidasi perbaikan di perangkat Android fisik Anda:

1. **Install APK Baru**:
   - Ambil file [`SakuKilat.apk`](file:///C:/Users/HYPE%20AMD/Downloads/SakuKilat.apk) dari folder `Downloads` laptop Anda, lalu kirim/install ke HP (pilih *Update / Pasang*).
2. **Selesaikan Onboarding Sekali**:
   - Buka aplikasi SakuKilat.
   - Klik lewati atau selesaikan tour panduan (8 slide) hingga masuk ke layar utama Beranda.
3. **Uji Tutup Aplikasi Paksa (Kill & Restart)**:
   - Buka menu *Recent Apps* pada HP Anda.
   - Swipe/tutup aplikasi SakuKilat secara total (Force Close).
   - Buka kembali aplikasi SakuKilat dari app drawer HP.
4. **Hasil yang Diharapkan**:
   - Aplikasi langsung masuk ke Beranda tanpa menampilkan tour panduan lagi.
   - Seluruh data transaksi, saldo dompet, dan kategori tetap utuh seperti sedia kala.
   - Jika suatu saat ingin melihat panduan kembali, dapat dibuka kapan saja melalui menu **Profil -> Buku Panduan**.
