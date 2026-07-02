# SakuKilat Nova

README ini ditulis untuk manusia dan AI yang baru masuk ke folder ini.
Tujuannya bukan promosi, tapi onboarding cepat: apa fungsi proyek ini, bagaimana
arus kodenya, file mana yang penting, apa yang boleh diasumsikan, dan apa yang
jangan diasumsikan.

## 1. Ringkasan proyek

SakuKilat Nova adalah aplikasi pencatat keuangan pribadi yang:

- local-first
- bisa jalan penuh di web
- bisa dibungkus ke Android lewat Capacitor
- fokus pada input cepat, bukan akuntansi kompleks

Fitur inti:

- catat transaksi dari input bahasa natural
- input manual untuk pemasukan, pengeluaran, dan pindah uang
- dompet/saku, budget bulanan, goal tabungan, kategori custom
- rekapan dan insight pengeluaran
- backup/import data
- mode demo
- app lock dengan sandi + biometrik berbasis WebAuthn/browser

## 2. Prinsip produk

Kalau kamu AI yang akan lanjut mengerjakan proyek ini, anggap prinsip berikut
sebagai baseline:

- aplikasi ini local-first: data utama disimpan di `localStorage`
- tidak ada backend aktif yang wajib dipertahankan
- jangan mengasumsikan cloud sync
- perubahan sebaiknya kecil, langsung ke akar alur, dan tidak menambah abstraksi tanpa alasan
- UX mobile lebih penting daripada arsitektur yang terlalu rapi tapi lambat diubah

## 3. Yang jangan diasumsikan

- Jangan anggap project ini butuh login server sungguhan. `auth` di store lebih ke local session/profile.
- Jangan anggap biometrik di sini native Android penuh. Saat ini alurnya memakai WebAuthn/browser compatibility di [lib/app-lock.ts](./lib/app-lock.ts).
- Jangan anggap demo mode aman untuk data user. Mode demo memang menulis ke `localStorage`, lalu menyimpan backup dan bisa dipulihkan.
- Jangan anggap semua file `android/` harus diedit untuk perubahan UI biasa. Sebagian besar perubahan fitur cukup di `app/`, `components/`, dan `lib/`.

## 4. Stack teknis

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Recharts
- Capacitor Android

Command utama ada di [package.json](./package.json):

```bash
pnpm dev
pnpm build
pnpm build:mobile
pnpm sync:mobile
pnpm open:android
```

Catatan:

- engine yang tertulis adalah Node `22.x`
- di mesin ini project pernah tetap jalan di Node 24, tapi kalau ada error aneh, cek versi Node dulu

## 5. Cara menjalankan

### Web lokal

```bash
pnpm install
pnpm dev
```

Lalu buka:

- `http://127.0.0.1:3000/`
- demo: `http://127.0.0.1:3000/?demo=1`

### Android wrapper

Jalur mobile sudah disiapkan lewat Capacitor dan wrapper Android di folder `android/`.

Alur singkat:

```bash
pnpm build:mobile
pnpm sync:mobile
pnpm open:android
```

Konfigurasi wrapper ada di [capacitor.config.ts](./capacitor.config.ts).

## 6. Peta folder

Folder penting:

- [app](./app): entry halaman Next.js
- [components](./components): semua UI dan sebagian flow fitur
- [lib](./lib): state, parser, stats, demo, util, lock, recurring, notifikasi
- [public](./public): aset publik
- [android](./android): wrapper Android Capacitor
- [scripts](./scripts): helper script tambahan bila ada
- [docs](./docs): dokumen tambahan proyek

Folder yang biasanya bukan source of truth:

- `.next/`
- `node_modules/`
- `out/`
- `android/app/build/`

Kalau folder-folder di atas muncul, itu hasil build/cache dan aman dicurigai sebagai artefak turunan.

## 7. File paling penting

Kalau harus memahami proyek ini cepat, baca file ini dulu secara berurutan:

1. [app/page.tsx](./app/page.tsx)
2. [lib/store.tsx](./lib/store.tsx)
3. [components/smart-input.tsx](./components/smart-input.tsx)
4. [lib/parser.ts](./lib/parser.ts)
5. [components/tab-beranda.tsx](./components/tab-beranda.tsx)
6. [components/tab-saku.tsx](./components/tab-saku.tsx)
7. [components/tab-rekapan.tsx](./components/tab-rekapan.tsx)
8. [components/tab-profil.tsx](./components/tab-profil.tsx)

Kenapa file-file ini penting:

- `app/page.tsx`: shell utama aplikasi, navigasi tab, demo mode, lock screen
- `lib/store.tsx`: sumber state utama aplikasi
- `smart-input` + `parser`: jantung input cepat bahasa natural
- `tab-*`: membagi fitur per halaman utama

## 8. Arsitektur alur aplikasi

### Shell aplikasi

Entry UI utama ada di [app/page.tsx](./app/page.tsx).

Yang di-handle di sini:

- deteksi query `?demo=1`
- mount tab utama: Beranda, Rekapan, Saku, Profil
- lock screen
- smart input fixed di bawah
- event navigasi internal via `sakukilat:navigate`

### Store utama

[lib/store.tsx](./lib/store.tsx) adalah pusat state.

Store ini mengelola:

- transaksi
- wallet/saku
- budget bulanan
- kategori & metode bayar custom
- profil local
- theme / zen mode
- toast feedback

Kunci penting:

- state dipersist ke `localStorage`
- ada migrasi schema
- banyak komponen memakai context pecahan seperti `useTransactionData`, `useBudgetStore`, `useCustomizationStore`

Kalau ada bug data lintas fitur, mulai audit dari file ini dulu.

### Input transaksi

Ada 2 jalur:

- input cepat: [components/smart-input.tsx](./components/smart-input.tsx)
- input manual: [components/manual-entry-form.tsx](./components/manual-entry-form.tsx)

Parser bahasa natural hidup di [lib/parser.ts](./lib/parser.ts).

Tambahan:

- suggestion/rekomendasi frasa ada di [lib/suggestions.ts](./lib/suggestions.ts)
- format nominal ada di [lib/amount.ts](./lib/amount.ts)

### Rekapan dan insight

Perhitungan utama hidup di:

- [lib/stats.ts](./lib/stats.ts)
- [lib/report.ts](./lib/report.ts)

UI rekapan utama:

- [components/tab-rekapan.tsx](./components/tab-rekapan.tsx)
- [components/tab-beranda.tsx](./components/tab-beranda.tsx)

### Goal tabungan

Fitur goal terpusat di [components/goal-tracker.tsx](./components/goal-tracker.tsx).

Catatan:

- goal punya storage sendiri
- goal bisa dibuka dari tab Saku
- ada quick goal di Beranda (`Goal Kilat`)

### Backup / import / export

Pusatnya ada di [components/data-portability.tsx](./components/data-portability.tsx).

Ini file penting kalau kamu mengubah:

- format backup
- migrasi data user
- import CSV/JSON
- auto-augment wallet / kategori saat import

### Keamanan aplikasi

File inti:

- [components/app-lock-settings.tsx](./components/app-lock-settings.tsx)
- [lib/app-lock.ts](./lib/app-lock.ts)

App lock saat ini:

- sandi lokal
- biometrik via WebAuthn jika environment mendukung

## 9. Struktur tab

### Beranda

File: [components/tab-beranda.tsx](./components/tab-beranda.tsx)

Isi utama:

- saldo bulan berjalan
- ringkasan masuk/keluar
- insight cepat
- budget card
- goal kilat
- history transaksi

### Saku

File: [components/tab-saku.tsx](./components/tab-saku.tsx)

Isi utama:

- budget bulanan
- wallet manager
- pindah/simpan uang
- recurring manager
- goal tracker
- metode bayar
- kategori

### Rekapan

File: [components/tab-rekapan.tsx](./components/tab-rekapan.tsx)

Isi utama:

- breakdown kategori
- ringkasan periode
- drill-down transaksi

### Profil

File: [components/tab-profil.tsx](./components/tab-profil.tsx)

Isi utama:

- profil lokal
- theme / zen mode
- backup & import
- user guide
- report preview
- pengaturan notifikasi
- app lock
- toggle demo mode

## 10. Storage lokal yang penting

Jangan ubah key sembarangan tanpa migrasi.

Key yang jelas terlihat dari source:

- state utama: `sakukilat:v2:local-state`
- goals: `sakukilat:v2:goals`
- lock config: `sakukilat:v2:app-lock`

Key tambahan lain tersebar di:

- [lib/demo.ts](./lib/demo.ts)
- [lib/achievements.ts](./lib/achievements.ts)
- [lib/cron.ts](./lib/cron.ts)

Kalau mengubah nama key:

- cek migrasi
- cek demo mode
- cek backup/import
- cek achievements dan onboarding

## 11. Mode demo

Demo mode diaktifkan lewat:

- URL `?demo=1`
- toggle di tab Profil

File inti:

- [lib/demo.ts](./lib/demo.ts)
- [app/page.tsx](./app/page.tsx)
- [components/tab-profil.tsx](./components/tab-profil.tsx)

Perilaku penting:

- demo mode mengisi `localStorage` dengan data contoh
- state asli dibackup dulu
- saat demo dimatikan, state bisa dipulihkan

Kalau AI berikutnya sedang audit UI dan melihat data ramai, cek dulu apakah demo aktif.

## 12. Notifikasi dan cron

File penting:

- [lib/notifications.ts](./lib/notifications.ts)
- [components/notification-settings.tsx](./components/notification-settings.tsx)
- [lib/cron.ts](./lib/cron.ts)
- [lib/notification-plan.ts](./lib/notification-plan.ts)

Anggap fitur ini best-effort:

- di web biasa tidak selalu sama perilakunya dengan native
- di native, beberapa flow bergantung Capacitor

## 13. Status Android / APK

Project ini sudah punya wrapper Android aktif.

File dan folder kunci:

- [capacitor.config.ts](./capacitor.config.ts)
- [android](./android)
- [update-apk.ps1](./update-apk.ps1)

APK debug yang pernah dihasilkan di folder root:

- [SakuKilat-Nova-public-debug.apk](./SakuKilat-Nova-public-debug.apk)

Kalau APK perlu di-regenerate:

1. `pnpm install`
2. `pnpm sync:mobile`
3. build dari Gradle / Android Studio

## 14. Tempat edit berdasarkan kebutuhan

Kalau task-nya seperti ini, mulai dari sini:

- ubah tampilan homepage: [components/tab-beranda.tsx](./components/tab-beranda.tsx)
- ubah wallet/budget/goal/kategori: [components/tab-saku.tsx](./components/tab-saku.tsx)
- ubah parser input cepat: [lib/parser.ts](./lib/parser.ts)
- ubah suggestion teks: [lib/suggestions.ts](./lib/suggestions.ts)
- ubah nominal formatting: [lib/amount.ts](./lib/amount.ts)
- ubah backup/import/export: [components/data-portability.tsx](./components/data-portability.tsx)
- ubah keamanan app lock: [lib/app-lock.ts](./lib/app-lock.ts)
- ubah state global / persistensi: [lib/store.tsx](./lib/store.tsx)
- ubah wrapper Android: [capacitor.config.ts](./capacitor.config.ts) dan [android](./android)

## 15. Aturan kerja aman untuk AI berikutnya

Sebelum edit:

- baca `app/page.tsx`
- baca `lib/store.tsx`
- grep caller kalau mau mengubah helper bersama

Saat edit:

- prefer perubahan kecil
- reuse helper yang sudah ada
- jangan menambah dependency baru kalau fitur lama sudah cukup
- jangan pindahkan arsitektur besar kalau bug/fitur bisa selesai di level komponen atau helper sekarang

Sesudah edit:

- minimal jalankan `pnpm build`
- kalau terkait demo/local UI, cek juga `?demo=1`
- kalau terkait Android wrapper, jalankan `pnpm sync:mobile`

## 16. Masalah umum

### Build web lolos tapi APK lama tidak ikut berubah

Biasanya karena belum `pnpm sync:mobile`.

### UI audit terlihat "berbeda" dari data nyata

Cek apakah demo mode aktif.

### Data terasa hilang

Cek:

- key `localStorage`
- backup/import
- mode demo restore
- migrasi schema di store

### Sidik jari tidak muncul

Jangan langsung anggap bug. Bisa jadi environment/browser/device tidak mendukung
WebAuthn/platform authenticator.

## 17. Kesimpulan singkat untuk AI

Kalau kamu hanya punya 1 menit:

- ini app finance local-first berbasis Next.js
- pusat state ada di `lib/store.tsx`
- input cepat ada di `components/smart-input.tsx` + `lib/parser.ts`
- navigasi shell ada di `app/page.tsx`
- fitur dibagi ke `tab-beranda`, `tab-saku`, `tab-rekapan`, `tab-profil`
- demo mode dan persistensi lokal sangat memengaruhi perilaku runtime
- wrapper Android sudah ada, jadi jangan bikin ulang jalur mobile dari nol
