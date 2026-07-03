# Catatan Sesi — SakuKilat

> Ringkasan kerja untuk handoff ke sesi baru. Baca file ini dulu sebelum lanjut.
> Terakhir diperbarui: 29 Juni 2026.

---

## 1. Tentang Proyek
- **Nama**: SakuKilat — pencatat keuangan (expense tracker) berbahasa Indonesia.
- **Stack**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 + Recharts. Dibungkus Android via Capacitor 8.
- **Sifat**: **100% lokal-first** — semua data di `localStorage`. TANPA login, TANPA server, TANPA cloud. Jalan offline.
- **Package manager**: pnpm 11.9.0 (Node 22.x diminta; mesin pakai Node 24 → hanya warning, aman).
- **Build**: `pnpm build` (static export ke `out/`). `pnpm dev` untuk server lokal (port 3000).
- **PENTING**: `next.config.mjs` sudah punya `turbopack.root` + `output: 'export'`. Jangan dihapus.

---

## 2. Status: Firebase & Netlify SUDAH DICABUT
- Login Google, Firebase Auth, Firestore cloud-sync, dan Netlify **dihapus total**.
- File dihapus: `lib/firebase.ts`, `components/auth-gate.tsx`, `firestore.rules`, `netlify.toml`.
- Dependency `firebase` dihapus dari package.json (app jauh lebih ringan).
- App auto-login profil lokal (`DEMO_USER`). Tidak ada lagi tombol "Keluar".

---

## 3. Perubahan UI/Fitur yang Sudah Dikerjakan (semua BUILD LULUS)

### Navigasi & layout
- Urutan tab: **Beranda → Rekapan → Saku → Profil** (Rekapan ditukar ke kiri).
- Tab Saku: Metode Bayar & Kategori dibungkus panel collapsible (`CollapsibleSection`).
- Tab Rekapan: default view **History** (urutan History → Kalender → Tren).

### Avatar (tab Profil)
- Maks 5MB + **cropper** (`components/avatar-cropper.tsx`): zoom/geser/pinch, hasil dikompres 256px JPEG.

### Backup/Ekspor (`components/data-portability.tsx`)
- `downloadFile` punya fallback data-URL untuk WebView Android + notifikasi sukses/gagal.
- **Impor "minimum"**: `augmentFromImport()` otomatis buat saku & kategori baru dari data impor (cocokkan dulu ke yang ada agar tak duplikat). Nol data yatim.

### Parser (`lib/parser.ts`)
- Deteksi multi-transaksi: kalau ada penghubung (`terus/lalu/kemudian`) + ≥2 nominal → confidence ditahan ≤0.45 + warning. Mencegah "gagal diam-diam".
- Keterbatasan diketahui (sengaja, pakai Catat Manual): nominal kata ("setengah juta"), transfer ke nama orang, "sama/plus" sebagai pemisah.

### Beranda (`components/tab-beranda.tsx`)
- **"Sisa Napas Hari Ini"** (Safe-to-Spend): pakai `dynamicDailyBudget` (SUMBER SAMA dengan budget card → tidak bertabrakan). Hijau = aman, kuning = rem.
- Kalimat dinamis berbasis **streak hari** (`milestoneMessage`).
- Chip total: "X/100 lencana" + "N hari" streak. Lonceng notifikasi (`NotificationBell`).

### Profil (`components/tab-profil.tsx`)
- Kartu **Streak & 5 Nyawa** + total streak (`streakStatus` di stats.ts).
- **Etalase Trofi** (`components/trophy-case.tsx`): list collapsible scrollable, filter Semua/Terbuka/Terkunci, tiap baris bisa dibuka → cara dapat + tanggal didapat + progress bar.
- **Buku Panduan** (`components/user-guide.tsx`): modal accordion, section pertama "Kenapa SakuKilat?" (keunggulan), lalu semua fitur.
- **Laporan PDF** (`lib/report.ts`): cetak laporan bulanan via `window.print()` (nol dependency, offline).
- **Mode Demo** (`lib/demo.ts`): isi data contoh kaya (75 hari tx, 7 saku, 2 goal, budget 3jt), cadangkan data asli, pulihkan saat keluar.

### Achievement "Century Project" (`lib/achievements.ts`)
- **Tepat 100 badge**, distribusi: Streak 12, Volume 15, Anggaran 20, Zen 18, Lore/EasterEgg 35.
- Tiap badge punya `trigger` (ON_TX_SUBMIT/ON_APP_MOUNT/ON_ROUTE_CHANGE/ON_CRON_MIDNIGHT), `howTo`, `copy` (dopamin), `tier`.
- Derived dari data → auto-unlock termasuk setelah impor. Unlock timestamp disimpan di `sakukilat:v2:badge-unlocks`.
- Counter event: voice/edit/undo/guide/photo/tabs/rekap-days/budget-set/tren-seen/goal-deadline.
- Sebagian badge historis (Hemat Trilogi, Survivor Tanggal Tua, dll) pakai flag `sakukilat:v2:ach-*` yang BELUM di-set oleh cron (butuh Fase 6).

### Analisis Keuangan (`lib/stats.ts` → `periodInsight` + `components/analysis-card.tsx`)
- Toggle Mingguan/Bulanan di Rekapan→Tren. Delta vs periode lalu, kategori & hari terboros, takeaways naratif.

### Onboarding (`components/onboarding-tour.tsx`)
- Versi 9. Slide diperbaiki: target `data-tour` benar (`streak-card`, `notif-bell`, `guide-button`). Highlight pilih elemen yang terlihat (atasi anchor ganda desktop/mobile).

### BUG KRITIS yang sudah diperbaiki
- `loadPersistedState` di `lib/store.tsx` dulu menghapus SEMUA key `sakukilat:` tak dikenal tiap reload → achievement ke-reset. Ditambah `PRESERVED_KEY_PREFIXES` untuk mempertahankan counter/flag/badge.

---

## 4. Dokumen yang Dihasilkan
- `C:\Users\HYPE AMD\Downloads\VIBE CODING\docs\Panduan-Lengkap-SakuKilat.docx` (keunggulan + cara pakai + 100 achievement & cara dapat).
- `C:\Users\HYPE AMD\Downloads\VIBE CODING\docs\SakuKilat-100-Achievements.docx` (tabel teknis).
- Generator: `scripts/gen_panduan_lengkap_docx.py` & `scripts/gen_achievements_docx.py` (butuh python-docx; sudah terpasang). NB: skrip menulis ke `docs/` dalam proyek; file final dipindah manual ke folder induk VIBE CODING\docs.

---

## 5. FASE 6 — SUDAH DIKERJAKAN (build lulus, belum masuk APK)
Spec lengkap: `.kiro/specs/notifikasi-hp-dan-cron/` (requirements + design + tasks, semua 14 task selesai).

### Notifikasi HP asli (`@capacitor/local-notifications@8.2.0`)
- `lib/notifications.ts` — wrapper defensif: `loadNotifPrefs/saveNotifPrefs`,
  `isNativeRuntime`, `getPermission/requestPermission`, `applyDailyReminder/cancelDailyReminder`.
  Akses plugin via **dynamic import** dalam guard native → aman di web (no-op rapi), tak merusak static export.
- UI `components/notification-settings.tsx` (toggle + pemilih jam) disisipkan di tab Profil.
  Default jam 20:00, prefs di `sakukilat:v2:notif-prefs`. Di web tampil keterangan "aktif penuh di APK".
- `AndroidManifest.xml`: izin `POST_NOTIFICATIONS` ditambah. `capacitor.config.ts`: blok `LocalNotifications` (iconColor saja).

### Cron tengah malam (rollover harian, lokal-first)
- `lib/historical-achievements.ts` — **fungsi murni** `evaluateHistoricalFlags` + `needsRollover` + `dayKey`.
  Set flag `sakukilat:v2:ach-*` untuk: tutup-aman, under50, under25, surplus, noskip, puasa, weekend-hemat, survivor.
  Anti false-positive (data kosong → []), budget-gating, monoton/idempoten, totalitas (tak melempar).
- `lib/cron.ts` — `runDailyRollover()` + hook `useDailyRollover()` (dipanggil di `app/page.tsx` AppShell).
  Trigger: mount + timer tengah malam + `visibilitychange`. Tanggal terakhir di `sakukilat:v2:last-rollover`.
- `lib/store.tsx`: `PRESERVED_KEY_PREFIXES` ditambah `notif-prefs` & `last-rollover` (tidak ke-wipe saat reload).

### Verifikasi
- Skrip `scripts/verify-historical.mjs` menguji 7 Correctness Properties → SEMUA PASS.
  Jalankan: `npx --no-install tsc lib/historical-achievements.ts --module esnext --target es2020 --moduleResolution bundler --skipLibCheck --outDir scripts/.verify-build` lalu `node scripts/verify-historical.mjs`.
  (`scripts/.verify-build/` di-gitignore.)
- `pnpm build` (static export) LULUS, tanpa type error.

## 5b. YANG BELUM DIKERJAKAN
1. **Rebuild APK** dengan `update-apk.ps1` — semua perubahan Fase 6 baru ada di web, belum masuk APK.
   Uji di perangkat: izin notifikasi muncul, pengingat harian tampil di status bar, badge historis auto-unlock.
2. Catatan badge historis tambahan yang belum dihitung otomatis (mis. zen30, frugal, napas, dingin, antifomo,
   hemat-trio, master, anti-bocor, week-green) sengaja DIBIARKAN terkunci (anti false-positive). Bisa ditambah
   ke `evaluateHistoricalFlags` bila diinginkan, dengan dataset uji di `verify-historical.mjs`.
3. Soal "error" lama: ternyata bukan error fatal — hanya React hydration warning akibat ekstensi browser
   (atribut `bis_register`/`__processed_`). Aman diabaikan; coba incognito/matikan ekstensi bila ingin bersih.

---

## 6. Cara Update APK
Jalankan dari folder proyek: `powershell -ExecutionPolicy Bypass -File update-apk.ps1`
(otomatis: build → cap sync android → gradlew assembleDebug → salin jadi `SakuKilat.apk`).
JANGAN ubah appId `com.sakukilat.app`. Data user aman selama package name sama.

---

## 7. Prinsip Kerja yang Disepakati User
- App harus tetap RINGAN (lokal-first). Hindari dependency berat.
- Jujur saat parser/fitur punya keterbatasan, jangan "gagal diam-diam".
- Tiap perubahan: jalankan `pnpm build` untuk QC + verifikasi logika lewat eksekusi nyata bila perlu.
- User suka diberi plus-minus & saran sebelum eksekusi fitur besar.
