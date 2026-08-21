# ⚡ SakuKilat — Personal Finance Tracker

Aplikasi pencatat keuangan pribadi modern, cepat, dan *offline-first* dengan Natural Language Processing (NLP) khusus Bahasa Indonesia. Dibangun menggunakan Next.js 16, React 19, Tailwind CSS v4, dan dikemas menjadi aplikasi Android Native menggunakan Capacitor 8.

---

## 📁 Struktur Direktori Proyek

```text
├── android/          # Native Android project wrapper (Capacitor & Gradle)
├── app/              # Next.js App Router (Layout & Pages)
├── components/       # Komponen UI React (Beranda, Saku, Rekapan, Profil, dll.)
├── docs/             # 📚 Dokumentasi, Panduan, & Protokol Pengembangan
│   ├── BUILD-ANDROID.md      # Panduan build APK/AAB Android
│   ├── DEV-PROTOCOL.md       # Protokol kerja, SOP, & batasan revisi
│   ├── README-REVISI.md      # Riwayat & catatan perbaikan/revisi
│   └── SESSION-NOTES.md      # Catatan sesi & arsitektur proyek
├── lib/              # Modul logika (NLP Parser, Local Store, Stats, Cron)
├── public/           # Aset statis & ikon aplikasi
├── scripts/          # 🛠️ Skrip Otomasi, Build, & Test Suite
│   ├── update-apk.ps1        # Otomasi 1-klik build Next.js + Capacitor APK
│   ├── pindah-workspace.ps1  # Skrip utilitas pemindahan workspace
│   └── test-budget-logic.mjs # Unit test logika dynamic budgeting
├── capacitor.config.ts # Konfigurasi Capacitor Android (App ID, Splash, Notifikasi)
├── next.config.mjs     # Konfigurasi Next.js (Static export untuk Android)
└── package.json        # Dependensi & script perintah kerja
```

---

## 🚀 Perintah Utama (Quick Start)

### 1. Mode Development (Web)
```bash
pnpm dev
```
Akses di browser pada: `http://localhost:3000`

### 2. Jalankan Pengujian Logika (Test Suite)
```bash
pnpm test
```

### 3. Build & Bungkus APK Android Otomatis
```bash
pnpm build:apk
```
*Atau jalankan skrip PowerShell langsung:*
```powershell
powershell -ExecutionPolicy Bypass -File scripts/update-apk.ps1
```
Hasil file akhir **`SakuKilat.apk`** akan langsung tersedia di folder root proyek.

---

## 🔒 Prinsip Penyimpanan Data
SakuKilat menyimpan seluruh data pengguna (transaksi, dompet, budget, kategori, goal) secara **lokal** di perangkat (`localStorage` pada web / `@capacitor/preferences` pada Android). Aplikasi berjalan 100% offline tanpa login dan tanpa cloud database eksternal.

Fitur cadangan dan ekspor data tersedia di tab **Profil** (Ekspor PDF, CSV, dan JSON Backup).
