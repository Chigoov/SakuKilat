# 📋 DAFTAR PERBAIKAN, BUG, & ROADMAP SESI REVISI — SAKUKILAT

> **Dokumen Resmi Spesifikasi Revisi, Rincian Isu, Solusi Kode, & Jadwal Sesi**  
> **Status:** ✅ SESI 1-4 SELESAI DIEKSEKUSI — Menunggu QA Build (Sesi 5)  
> **Target Platform:** Mobile Android (Capacitor Native) & Web (Next.js)  

---

## 📑 DAFTAR ISI
1. [Prinsip & Protokol Pengerjaan](#1-prinsip--protokol-pengerjaan)
2. [Rincian Lengkap Masalah, Bukti Bug, & Solusi Kode (Before vs After)](#2-rincian-lengkap-masalah-bukti-bug--solusi-kode)
   - [ISSUE-01: Salah Hitung Nominal 1.5k Menjadi 15.000 di Input Form](#issue-01-salah-hitung-nominal-15k-menjadi-15000-di-input-form-kritis)
   - [ISSUE-02: Salah Hitung Desimal Polos 2.50 Menjadi 25.000 pada Parser](#issue-02-salah-hitung-desimal-polos-250-menjadi-25000-pada-parser-kritis)
   - [ISSUE-03: Antrean Notifikasi Trofi Baru Terhapus Otomatis Saat Booting](#issue-03-antrean-notifikasi-trofi-baru-terhapus-otomatis-saat-booting-sedang)
   - [ISSUE-04: False Warning pada Input Angka Ribuan Standar 2.000](#issue-04-false-warning-pada-input-angka-ribuan-standar-2000-minor)
   - [ISSUE-05: Parser NLP Gagal Total pada Kalimat Keterangan Sehari-hari](#issue-05-parser-nlp-gagal-total-pada-kalimat-keterangan-sehari-hari-tinggi)
   - [ISSUE-06: Saldo & Ikon Saku Tidak Terlihat di Form Catat Manual HP](#issue-06-saldo--ikon-saku-tidak-terlihat-di-form-catat-manual-hp-tinggi---ux-mobile)
   - [ISSUE-07: Pemborosan Ruang Layar oleh SmartInput di Tab Rekapan & Saku](#issue-07-pemborosan-ruang-layar-oleh-smartinput-di-tab-rekapan--saku-tinggi---ux-mobile)
   - [ISSUE-08: Target Sentuh Tombol Kategori Sempit & Badge Saku Redup](#issue-08-target-sentuh-tombol-kategori-sempit--badge-saku-redup-sedang---ux-mobile)
   - [ISSUE-09: Keyboard Virtual Huruf QWERTY Muncul di Kolom Angka](#issue-09-keyboard-virtual-huruf-qwerty-muncul-di-kolom-angka-sedang---ux-mobile)
3. [Pembagian Sesi Kerja Revisi (Sprint Sessions)](#3-pembagian-sesi-kerja-revisi-sprint-sessions)
   - [Sesi 1: Perbaikan Bug Logika & Kalkulasi Kritis (Core Engine Fixes)](#sesi-1-perbaikan-bug-logika--kalkulasi-kritis-core-engine-fixes)
   - [Sesi 2: Peningkatan Cerdas Parser NLP Bahasa Indonesia (NLP Enhancement)](#sesi-2-peningkatan-cerdas-parser-nlp-bahasa-indonesia-nlp-enhancement)
   - [Sesi 3: Peningkatan UI Pemilih Saku, Kategori, & Ergonomi Form (Mobile UX)](#sesi-3-peningkatan-ui-pemilih-saku-kategori--ergonomi-form-mobile-ux)
   - [Sesi 4: Optimalisasi Tata Letak & Layar Mobile (Viewport Cleanup)](#sesi-4-optimalisasi-tata-letak--layar-mobile-viewport-cleanup)
   - [Sesi 5: QA Penuh, Uji Interaktif, & Build APK Release Terbaru (Packaging)](#sesi-5-qa-penuh-uji-interaktif--build-apk-release-terbaru-packaging)

---

## 1. PRINSIP & PROTOKOL PENGERJAAN
Sesuai kesepakatan di **[DEV-PROTOCOL.md](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/docs/DEV-PROTOCOL.md)**:
1. **Tidak Ada Eksekusi Tanpa Izin**: Seluruh rencana didokumentasikan dalam teks terlebih dahulu.
2. **Scope Ketat**: Hanya mengubah baris yang berkaitan langsung dengan isu yang disepakati.
3. **Backup Rollback Wajib**: Sebelum baris kode diubah, dibuat git backup checkpoint.
4. **Deploy Otomatis Setelah Disetujui**: Begitu Anda menyatakan "OKE", versi dinaikkan, aplikasi dikompilasi, dan file **`SakuKilat.apk`** siap didistribusikan.

---

## 2. RINCIAN LENGKAP MASALAH, BUKTI BUG, & SOLUSI KODE

---

### ISSUE-01: Salah Hitung Nominal `1.5k` Menjadi `15.000` di Input Form (KRITIS)
- **Komponen / File**: [lib/amount.ts](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/lib/amount.ts#L42-L62) — Fungsi `parseAmountInput()`
- **Urgensi**: 🔴 **KRITIS** (Menghasilkan salah hitung uang 10x lipat pada data pengguna).
- **Penjelasan Masalah**:
  Saat pengguna mengetik `1.5k` (maksudnya 1.500 rupiah) pada form catat manual, kode baris 48:
  ```ts
  const compact = normalized.includes('.') && !normalized.includes(',') && !/(jt|juta)$/.test(normalized)
    ? normalized.replace(/\./g, '')
    : normalized
  ```
  menganggap titik tersebut adalah pemisah ribuan karena tidak berakhiran `jt/juta`. Titik dihapus sehingga `1.5k` menjadi `15k`. Lalu dikalikan 1.000 menjadi **Rp 15.000**.
- **Hasil Pengujian**:
  - `parseAmountInput('1,5k')` (koma) ➡️ Rp 1.500 (Benar)
  - `parseAmountInput('1.5k')` (titik) ➡️ Rp 15.000 (💥 **SALAH**)
  - `parseAmountInput('2.5rb')` (titik) ➡️ Rp 25.000 (💥 **SALAH**)
- **Rancangan Solusi Kode**:
  ```ts
  // Perbaiki regex pengecualian agar mencakup k, rb, ribu, jt, juta, m, miliar
  const compact = normalized.includes('.') && !normalized.includes(',') && !/(k|rb|ribu|jt|juta|m|miliar|milyar)$/.test(normalized)
    ? normalized.replace(/\./g, '')
    : normalized
  ```

---

### ISSUE-02: Salah Hitung Desimal Polos `2.50` Menjadi `25.000` pada Parser (KRITIS)
- **Komponen / File**: [lib/parser.ts](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/lib/parser.ts#L320-L345) — Fungsi `normalizeNumberString()`
- **Urgensi**: 🔴 **KRITIS** (Kalkulasi desimal salah ribuan kali lipat).
- **Penjelasan Masalah**:
  Pada mode `plain`, terdapat logika baris 323:
  ```ts
  return compactValue < 1_000 ? compactValue * 100 : compactValue
  ```
  Jika pengguna mengetik angka desimal `2.50` atau `5.00`, titik dibuang menjadi `250` dan `500`. Karena nilainya < 1.000, dikalikan 100 sehingga menjadi **Rp 25.000** dan **Rp 50.000**. Serta angka `18,500.50` ter-parse menjadi **Rp 1.850.050**.
- **Rancangan Solusi Kode**:
  Hapus pengali 100 yang tidak aman tersebut dan gunakan logika deterministik:
  - 1 titik/koma diikuti persis 3 digit = ribuan (mis. `18.500` -> `18500`).
  - 1 titik/koma diikuti 1-2 digit = desimal murni (mis. `2.50` -> `2.5` -> bulat `3`).
  - Format kompleks ribuan + desimal (`18.500,50` atau `18,500.50`) -> dipisahkan dengan benar.

---

### ISSUE-03: Antrean Notifikasi Trofi Baru Terhapus Otomatis Saat Booting (SEDANG)
- **Komponen / File**: [lib/store.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/lib/store.tsx#L255) vs [lib/achievements.ts](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/lib/achievements.ts#L72)
- **Urgensi**: 🟠 **SEDANG** (Hilangnya efek perayaan trofi baru bagi user).
- **Penjelasan Masalah**:
  Saat aplikasi memuat data (`loadPersistedState()`), sistem membersihkan kunci `localStorage` yang tidak dikenal.
  `PRESERVED_KEY_PREFIXES` hanya mencantumkan `'sakukilat:v2:badge-unlocks'`. Kunci antrean perayaan trofi `'sakukilat:v2:badge-unlock-queue'` tidak cocok dengan prefix tersebut, sehingga **antrean trofi dihapus sebelum sempat ditampilkan popupnya**.
- **Rancangan Solusi Kode**:
  Ubah prefix di `lib/store.tsx` baris 255 menjadi:
  ```ts
  'sakukilat:v2:badge-unlock', // mencakup badge-unlocks dan badge-unlock-queue
  ```

---

### ISSUE-04: False Warning pada Input Angka Ribuan Standar `2.000` (MINOR)
- **Komponen / File**: [lib/parser.ts](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/lib/parser.ts#L430-L435) — Fungsi `amountWarning()`
- **Urgensi**: 🟡 **MINOR** (Pesan peringatan kuning yang membingungkan user).
- **Penjelasan Masalah**:
  Input `"parkir 2.000"` memicu pesan: *"Nominal belum jelas. Pakai format seperti Rp25.000 atau 25k"*, padahal `2.000` adalah penulisan ribuan standar Indonesia.
- **Rancangan Solusi Kode**:
  Perbaiki guard condition agar format nominal bertitik tidak memicu warning palsu jika nilainya sudah >= 1.000.

---

### ISSUE-05: Parser NLP Gagal Total pada Kalimat Keterangan Sehari-hari (TINGGI)
- **Komponen / File**: [lib/parser.ts](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/lib/parser.ts)
- **Urgensi**: 🟠 **TINGGI** (Kenyamanan fitur utama smart input).
- **Penjelasan Masalah**:
  Kalimat percakapan natural sehari-hari seperti:
  - *"beli bensin 50rb di spbu pertamina"*
  - *"makan bakso 25rb sama teman"*
  - *"bayar wifi indihome 350k barusan"*
  saat ini menghasilkan **`null` (gagal ter-parse)** karena token kata tambahan (`"di"`, `"spbu"`, `"sama"`, `"teman"`, `"barusan"`) menurunkan confidence score hingga ditolak.
- **Rancangan Solusi Kode**:
  Tambahkan pembersih token keterangan (*Stopwords Filter*) sebelum proses klasifikasi kategori:
  ```ts
  const NOISE_WORDS = new Set([
    'di', 'ke', 'dari', 'pada', 'buat', 'untuk', 'sama', 'bareng',
    'barusan', 'tadi', 'kemarin', 'lalu', 'sebesar', 'seharga', 'senilai'
  ])
  ```

---

### ISSUE-06: Saldo & Ikon Saku Tidak Terlihat di Form Catat Manual HP (TINGGI - UX MOBILE)
- **Komponen / File**: [components/manual-entry-form.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/components/manual-entry-form.tsx#L516-L552) — Komponen `WalletGrid`
- **Urgensi**: 🔴 **TINGGI (UX)** (Sangat mengganggu di smartphone).
- **Penjelasan Masalah**:
  Tombol pemilihan saku hanya menampilkan teks nama polos (*"BCA"*, *"Tunai"*). Info saldo hanya diletakkan di atribut `title` yang hanya muncul saat hover mouse di PC dan **tidak bisa dilihat di layar sentuh HP**.
- **Rancangan Solusi Kode**:
  Perbarui tampilan tombol `WalletGrid`:
  ```tsx
  <button key={wallet.id} className="...">
    <div className="flex items-center gap-1.5">
      <WalletIcon type={wallet.type} className="w-3.5 h-3.5" />
      <span className="font-semibold">{wallet.label}</span>
    </div>
    <span className="text-[10px] text-[var(--sk-text-dim)]">
      {formatIDRCompact(wallet.balance)}
    </span>
  </button>
  ```

---

### ISSUE-07: Pemborosan Ruang Layar oleh SmartInput di Tab Rekapan & Saku (TINGGI - UX MOBILE)
- **Komponen / File**: [app/page.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/app/page.tsx#L276-L285)
- **Urgensi**: 🔴 **TINGGI (UX)** (Tampilan grafik & tabel terpotong di HP).
- **Penjelasan Masalah**:
  Bilah *Smart Quick Input* menempel secara *fixed* di atas navigasi bawah pada **semua tab** (memakan ruang ~130px di bawah). Di tab Rekapan dan Saku, pengguna kesulitan melihat grafik donat / tren bulanan karena ruang tampilan menjadi sempit.
- **Rancangan Solusi Kode**:
  Render bilah *Smart Quick Input* secara bersyarat:
  ```tsx
  {activeTab === 'beranda' && (
    <div className="fixed bottom-[62px] left-3 right-3 z-30 ...">
      <SmartInput ... />
    </div>
  )}
  ```
  Dan sesuaikan padding bottom `main` pada tab lain menjadi lebih ramping (`pb-[80px]` alih-alih `pb-[182px]`).

---

### ISSUE-08: Target Sentuh Tombol Kategori Sempit & Badge Saku Redup (SEDANG - UX MOBILE)
- **Komponen / File**: [components/manual-entry-form.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/components/manual-entry-form.tsx) & [components/transaction-item.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/components/transaction-item.tsx)
- **Urgensi**: 🟠 **SEDANG (UX)** (Kenyamanan sentuhan jempol & keterbacaan).
- **Penjelasan Masalah**:
  Ikon tombol kategori berukuran `14px` (`w-3.5 h-3.5`) dengan padding sempit, rawan salah sentuh di HP. Pada daftar riwayat transaksi, teks metode pembayaran abu-abu redup sulit dibaca di luar ruangan.
- **Rancangan Solusi Kode**:
  Perbesar ukuran padding dan ikon tombol kategori menjadi `w-4 h-4` (min touch target 44px) dan bungkus nama dompet di riwayat transaksi dalam badge mini yang kontras.

---

### ISSUE-09: Keyboard Virtual Huruf QWERTY Muncul di Kolom Angka (SEDANG - UX MOBILE)
- **Komponen / File**: [components/goal-tracker.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/components/goal-tracker.tsx), [components/tab-saku.tsx](file:///c:/Users/HYPE%20AMD/Downloads/SAKU%20KILAT%20DATA%20BASE/components/tab-saku.tsx)
- **Urgensi**: 🟡 **SEDANG (UX)** (Kenyamanan pengetikan angka di HP).
- **Penjelasan Masalah**:
  Form modal Goal tabungan dan edit saldo masih menggunakan input teks biasa tanpa `inputMode`, sehingga memunculkan keyboard huruf QWERTY di Android.
- **Rancangan Solusi Kode**:
  Tambahkan `inputMode="decimal"` atau `inputMode="numeric"` pada seluruh elemen input angka.

---

## 3. PEMBAGIAN SESI KERJA REVISI (SPRINT SESSIONS)

Berikut pembagian jadwal pengerjaan bertahap:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ SESI 1: Core Bug Fixes (Hitung Nominal 1.5k, Desimal, & Kunci Trofi)    │
├────────────────────────────────────────────────────────────────────────┤
│ SESI 2: NLP Parser Intelligence (Filter Kata Keterangan Sehari-hari)   │
├────────────────────────────────────────────────────────────────────────┤
│ SESI 3: Form Ergonomics (Saldo & Ikon di WalletGrid, Target Sentuh)    │
├────────────────────────────────────────────────────────────────────────┤
│ SESI 4: Viewport Optimization (Legakan Layar Tab Rekapan & Saku HP)    │
├────────────────────────────────────────────────────────────────────────┤
│ SESI 5: QA Testing, Bump Version v1.0.6, & Build SakuKilat.apk         │
└────────────────────────────────────────────────────────────────────────┘
```

### 🚀 Sesi 1: Perbaikan Bug Logika & Kalkulasi Kritis (Core Engine Fixes)
- [x] **Item 1.1**: Perbaiki `parseAmountInput` di `lib/amount.ts` (fix `1.5k` → 1.500).
- [x] **Item 1.2**: Perbaiki `normalizeNumberString` di `lib/parser.ts` (fix `2.50` & `18,500.50`).
- [x] **Item 1.3**: Perbaiki key antrean perayaan trofi di `lib/store.tsx` (`badge-unlock`).
- [x] **Item 1.4**: Hilangkan false warning `2.000` di `lib/parser.ts`. *(auto-fix via 1.2)*
- [x] **Item 1.5**: Jalankan pengujian otomatis unit test `test-budget-logic.mjs` & parser suite. ✅ ALL PASS

### 🚀 Sesi 2: Peningkatan Cerdas Parser NLP Bahasa Indonesia (NLP Enhancement)
- [x] **Item 2.1**: Terapkan filter kata keterangan (*"di spbu"*, *"sama teman"*, *"barusan"*).
- [x] **Item 2.2**: Dukung pencocokan nama dompet custom berspasi (*"Bank Jago"*). *(sudah ada di preprocessTokens)*
- [x] **Item 2.3**: Verifikasi dengan 30+ variasi kalimat transaksi bahasa Indonesia.

### 🚀 Sesi 3: Peningkatan UI Pemilih Saku, Kategori, & Ergonomi Form (Mobile UX)
- [x] **Item 3.1**: Tampilkan **Nama Saku + Sisa Saldo** di `WalletGrid` form manual.
- [x] **Item 3.2**: Perbesar target sentuhan tombol kategori (min-h-[44px], ikon w-4 h-4).
- [x] **Item 3.3**: Perjelas badge nama dompet di riwayat transaksi.
- [x] **Item 3.4**: Pasang `inputMode="decimal"` konsisten di seluruh form nominal. *(sudah ada di tab-saku & goal-tracker)*

### 🚀 Sesi 4: Optimalisasi Tata Letak & Layar Mobile (Viewport Cleanup)
- [x] **Item 4.1**: Atur SmartInput hanya muncul di Tab Beranda; sembunyikan di Rekapan & Saku.
- [x] **Item 4.2**: Rapikan padding bawah agar grafik Recharts dan kartu rekening tampil utuh & luas di HP.

> **Status:** ✅ SELESAI PENUH — Rilis v1.0.6 (Publik) Sukses Terpasang di Perangkat
> **Target Platform:** Mobile Android (Capacitor Native) & Web (Next.js)  

---

### 🚀 Sesi 5: QA Penuh, Uji Interaktif, & Build APK Release Terbaru (Packaging)
- [x] **Item 5.1**: Jalankan `pnpm test` dan `pnpm build` (TypeScript check & Static export). ✅ ALL PASS
- [x] **Item 5.2**: Uji interaktif langsung di browser mobile viewport 412x915. ✅ ALL PASS
- [x] **Item 5.3**: Tunjukkan hasil akhir kepada pengguna untuk konfirmasi "OKE". ✅ DIKONFIRMASI USER
- [x] **Item 5.4**: Naikkan versi ke `v1.0.6` (versionCode: 12) dan jalankan `scripts/update-apk.ps1`. ✅
- [x] **Item 5.5**: Tanda tangani dengan keystore resmi (`sakukilat-release.jks`) & verifikasi sukses update di HP pengguna. ✅

---

## 🎯 ROADMAP SPRINT BARU: UI/UX, ERGONOMI & SUB KATEGORI (v1.0.7)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ROADMAP SPRINT UI/UX & SUB KATEGORI (v1.0.7)                           │
├────────────────────────────────────────────────────────────────────────┤
│ SESI 1: Quick Amount Chips (+10rb s.d. +500rb) & Quick Date Form       │
│ SESI 2: Arsitektur UI Sub Kategori (Horizontal Pills + Preset + NLP)   │
│ SESI 3: Optimasi Donut Chart & Bottom Padding Tab Beranda              │
│ SESI 4: Drilldown Sub Kategori & Visual Badge Saku di Tab Rekapan      │
│ SESI 5: Perapian Tab Saku (Collapsible Tambah) & Profil Inline Edit    │
│ SESI 6: Final QA, Bump Version v1.0.7 (vc: 13), Build Single APK       │
└────────────────────────────────────────────────────────────────────────┘
```

### 🚀 Sesi 1: Peningkatan Kecepatan & Ergonomi Form Catat Manual & Edit Transaksi
- [ ] **Item 1.1**: Pasang **Quick Amount Chips** (`+10rb`, `+20rb`, `+50rb`, `+100rb`, `+500rb`, `Hapus`) di bawah input nominal agar bisa menambah angka instan tanpa buka keyboard.
- [ ] **Item 1.2**: Pasang **Quick Date Selector** (`[ Hari Ini ]`, `[ Kemarin ]`, `[ Kalender ]`) untuk mempercepat pencatatan transaksi susulan.
- [ ] **Item 1.3**: Bersihkan teks nominal yang ikut masuk ke field keterangan saat form manual dibuka dari SmartInput (membersihkan deskripsi otomatis).
- [ ] **Item 1.4**: Ubah sistem edit/revisi transaksi di Riwayat dari *inline accordion yang melar di tengah list* menjadi **Dedicated Bottom Sheet Edit Modal** yang fokus, rapi, dan keyboard-friendly.

### 🚀 Sesi 2: Arsitektur UI Sub Kategori Lengkap & Smart NLP
- [ ] **Item 2.1**: Ubah UI Sub Kategori di Form Manual menjadi **Horizontal Pill Carousel** (swipeable, touch target 38px, ketinggian modal terkunci rapi tidak melar).
- [ ] **Item 2.2**: Tambahkan tombol **`+ Sub Baru`** langsung di dalam baris pill form manual (*inline instant creation*).
- [ ] **Item 2.3**: Sediakan **Preset Sub Kategori Cerdas Bawaan** untuk kategori umum (*Makanan: Makan Siang, Kopi/Snack, Belanja Dapur; Transportasi: Bensin, Parkir, Ojol; Tagihan: Listrik, WiFi, Pulsa; Belanja: Bulanan, Pakaian, Gadget*).
- [ ] **Item 2.4**: Integrasikan Smart Input NLP agar otomatis memetakan kata kunci ke subkategori yang sesuai (*"kopi 20k" ➔ Sub: Kopi/Snack*).

### 🚀 Sesi 3: Optimasi Dashboard Beranda & One-Thumb Zone
- [ ] **Item 3.1**: Optimasi proporsi Donut Chart (~160px diameter) dan letakkan indikator **% Budget / Status Saldo** di tengah lingkaran donut.
- [ ] **Item 3.2**: Tambahkan padding bawah `pb-32` pada container Tab Beranda agar transaksi terbawah terlihat 100% utuh tanpa tertimpa bar input.
- [ ] **Item 3.3**: Perbesar tombol Catat Manual di bilah Smart Input menjadi min-w-[40px] dengan ikon pensil/plus yang lebih kontras.

### 🚀 Sesi 4: Analisis Sub Kategori & Visual Saku di Tab Rekapan
- [ ] **Item 4.1**: Tambahkan fitur **Drilldown Accordion Sub Kategori** di Tab Rekapan Bulanan (klik kategori induk ➔ buka rincian subkategori + persentase pengeluaran).
- [ ] **Item 4.2**: Tambahkan **Badge Warna Khas Metode Pembayaran** di riwayat transaksi (🔵 Bank: Biru, 🟢 E-Wallet: Toska/Hijau, 🟡 Cash: Amber/Emas).
- [ ] **Item 4.3**: Ringkaskan header filter waktu & filter tipe transaksi menjadi sticky bar yang hemat ruang.

### 🚀 Sesi 5: Perapian Tab Saku & Profil
- [ ] **Item 5.1**: Jadikan form "Tambah Saku Baru" sebagai tombol collapsible `[ + Tambah Saku Baru ]` agar daftar rekening langsung terlihat di baris teratas.
- [ ] **Item 5.2**: Tambahkan tombol aksi cepat **`[ Transfer / Pindah Saldo ]`** di samping kartu total saldo tersimpan.
- [ ] **Item 5.3**: Rampingkan kolom edit nama profil menjadi modal/inline edit pada kartu avatar atas agar menu Panduan & Backup naik ke atas.

### 🚀 Sesi 6: QA Penuh, Interactive Mobile Review & Release APK v1.0.7
- [ ] **Item 6.1**: Jalankan static export `pnpm build` & unit test logika.
- [ ] **Item 6.2**: Uji interaktif di browser mobile viewport 412x915.
- [ ] **Item 6.3**: Naikkan versi ke `v1.0.7` (versionCode: 13) dan build file final `SakuKilat.apk`.

---

*Dokumen ini tersimpan di: `docs/DAFTAR-REVISI-DAN-ROADMAP.md` & `docs/SESSION-NOTES.md`.*
