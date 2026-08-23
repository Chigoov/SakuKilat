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

## 8. Sesi Revisi v1.0.6 (23-24 Agustus 2026) — SELESAI & TERUJI NYATA

### A. Isu yang Diperbaiki (9 Isu):
1. **ISSUE-01 (Kritis)**: `lib/amount.ts` — Fix parsing `1.5k` yang sebelumnya terbaca Rp 15.000 menjadi Rp 1.500 (perluas pengecualian regex suffix `k|rb|ribu|jt|juta|m|miliar|milyar`).
2. **ISSUE-02 (Kritis)**: `lib/parser.ts` — Fix kalkulasi desimal polos `2.50` yang sebelumnya terbaca Rp 25.000 menjadi Rp 3 (ganti mode `plain` dengan logika deterministik).
3. **ISSUE-03 (Sedang)**: `lib/store.tsx` — Prefix key `'sakukilat:v2:badge-unlock'` agar antrean trofi (`badge-unlock-queue`) tidak terhapus saat booting.
4. **ISSUE-04 (Minor)**: `lib/parser.ts` — Hilangkan false warning pada angka ribuan bertitik `2.000` (auto-fix via ISSUE-02).
5. **ISSUE-05 (Tinggi)**: `lib/parser.ts` — Tambahkan filter `NOISE_WORDS` untuk menyaring kata keterangan bahasa Indonesia sehari-hari (`di`, `sama`, `barusan`, dll) sehingga tidak mengotori klasifikasi kategori SmartInput.
6. **ISSUE-06 (Tinggi - UX)**: `components/manual-entry-form.tsx` — Perbarui `WalletGrid` agar menampilkan sisa saldo di bawah nama saku.
7. **ISSUE-07 (Tinggi - UX)**: `app/page.tsx` — SmartInput hanya di-render pada Tab Beranda, menyisakan ~130px ruang layar tambahan yang lebih lega untuk Tab Rekapan dan Tab Saku.
8. **ISSUE-08 (Sedang - UX)**: `components/manual-entry-form.tsx` — Perbesar area sentuh tombol kategori menjadi `min-h-[44px]` dan ikon `w-4 h-4`.
9. **ISSUE-09 (Sedang - UX)**: Form nominal dipastikan menggunakan `inputMode="decimal"` konsisten.
10. **FITUR BARU (v1.0.6)**: `components/patch-notes-modal.tsx` — Modal Catat Rilis (Patch Notes) interaktif untuk melihat histori pembaruan per versi langsung di aplikasi.

### B. Standar Deployment & Android Packaging (Fokus Edisi Publik):
- **Target Deploy Utama**: **Edisi Publik (`com.sakukilat.app.v2`)**.
- **Signing Keystore**: Wajib menggunakan `sakukilat-release.jks` & `android/keystore.properties` (SHA-256: `13dccbbd787224435ad6ac5330fd96c5de30a5f703ee87689b46bf21991a90a4`).
- **Skrip Build Otomatis**: `powershell -ExecutionPolicy Bypass -File scripts/update-apk.ps1` (menghasilkan single file `SakuKilat.apk`).
- **Hasil Uji Perangkat Fisik**: Terbukti berhasil di-install/di-update langsung di HP pengguna tanpa error bentrok paket dan seluruh data lama pengguna tetap aman utuh.

---

## 9. ROADMAP SPRINT: UI/UX, ERGONOMI & SUB KATEGORI (v1.0.7)

> **Fokus Utama**: Utilitas Tinggi (*High Utility*), Kecepatan Catat Kilat (~1.5 detik), Ergonomi Satu Jempol (*One-Thumb Friendly*), dan Analisis Mendalam Sub Kategori.

### 📋 Rencana Pembagian Sesi Kerja:

#### 🚀 Sesi 1: Peningkatan Kecepatan & Ergonomi Form Catat Manual & Edit Transaksi
- [ ] **Item 1.1**: Pasang **Quick Amount Chips** (`+10rb`, `+20rb`, `+50rb`, `+100rb`, `+500rb`, `Hapus`) di bawah input nominal agar bisa menambah angka instan tanpa buka keyboard.
- [ ] **Item 1.2**: Pasang **Quick Date Selector** (`[ Hari Ini ]`, `[ Kemarin ]`, `[ Kalender ]`) untuk mempercepat pencatatan transaksi susulan.
- [ ] **Item 1.3**: Bersihkan teks nominal yang ikut masuk ke field keterangan saat form manual dibuka dari SmartInput (membersihkan deskripsi otomatis).
- [ ] **Item 1.4**: Ubah sistem edit/revisi transaksi di Riwayat dari *inline accordion yang melar di tengah list* menjadi **Dedicated Bottom Sheet Edit Modal** yang fokus, rapi, dan keyboard-friendly.

#### 🚀 Sesi 2: Arsitektur UI Sub Kategori Lengkap & Smart NLP
- [ ] **Item 2.1**: Ubah UI Sub Kategori di Form Manual menjadi **Horizontal Pill Carousel** (swipeable, touch target 38px, ketinggian modal terkunci rapi tidak melar).
- [ ] **Item 2.2**: Tambahkan tombol **`+ Sub Baru`** langsung di dalam baris pill form manual (*inline instant creation*).
- [ ] **Item 2.3**: Sediakan **Preset Sub Kategori Cerdas Bawaan** untuk kategori umum (*Makanan: Makan Siang, Kopi/Snack, Belanja Dapur; Transportasi: Bensin, Parkir, Ojol; Tagihan: Listrik, WiFi, Pulsa; Belanja: Bulanan, Pakaian, Gadget*).
- [ ] **Item 2.4**: Integrasikan Smart Input NLP agar otomatis memetakan kata kunci ke subkategori yang sesuai (*"kopi 20k" ➔ Sub: Kopi/Snack*).

#### 🚀 Sesi 3: Optimasi Dashboard Beranda & One-Thumb Zone
- [ ] **Item 3.1**: Optimasi proporsi Donut Chart (~160px diameter) dan letakkan indikator **% Budget / Status Saldo** di tengah lingkaran donut.
- [ ] **Item 3.2**: Tambahkan padding bawah `pb-32` pada container Tab Beranda agar transaksi terbawah terlihat 100% utuh tanpa tertimpa bar input.
- [ ] **Item 3.3**: Perbesar tombol Catat Manual di bilah Smart Input menjadi min-w-[40px] dengan ikon pensil/plus yang lebih kontras.

#### 🚀 Sesi 4: Analisis Sub Kategori & Visual Saku di Tab Rekapan
- [ ] **Item 4.1**: Tambahkan fitur **Drilldown Accordion Sub Kategori** di Tab Rekapan Bulanan (klik kategori induk ➔ buka rincian subkategori + persentase pengeluaran).
- [ ] **Item 4.2**: Tambahkan **Badge Warna Khas Metode Pembayaran** di riwayat transaksi (🔵 Bank: Biru, 🟢 E-Wallet: Toska/Hijau, 🟡 Cash: Amber/Emas).
- [ ] **Item 4.3**: Ringkaskan header filter waktu & filter tipe transaksi menjadi sticky bar yang hemat ruang.

#### 🚀 Sesi 5: Perapian Tab Saku & Profil
- [ ] **Item 5.1**: Jadikan form "Tambah Saku Baru" sebagai tombol collapsible `[ + Tambah Saku Baru ]` agar daftar rekening langsung terlihat di baris teratas.
- [ ] **Item 5.2**: Tambahkan tombol aksi cepat **`[ Transfer / Pindah Saldo ]`** di samping kartu total saldo tersimpan.
- [ ] **Item 5.3**: Rampingkan kolom edit nama profil menjadi modal/inline edit pada kartu avatar atas agar menu Panduan & Backup naik ke atas.

#### 🚀 Sesi 6: QA Penuh, Interactive Mobile Review & Release APK v1.0.7
- [ ] **Item 6.1**: Jalankan static export `pnpm build` & unit test logika.
- [ ] **Item 6.2**: Uji interaktif di browser mobile viewport 412x915.
- [ ] **Item 6.3**: Naikkan versi ke `v1.0.7` (versionCode: 13) dan build file final `SakuKilat.apk`.

---

## 10. Prinsip Kerja yang Disepakati User (Updated)
- **Fokus Tunggal Publik**: Seluruh build dan deployment ke depan dipusatkan pada Edisi Publik (`com.sakukilat.app.v2`).
- **Strict Scope**: Hanya ubah yang diminta, backup checkpoint wajib dibuat sebelum perubahan tiap sesi.
- **Zero Data Loss**: Struktur penyimpanan lokal dipertahankan dan signing certificate tidak boleh berubah.
