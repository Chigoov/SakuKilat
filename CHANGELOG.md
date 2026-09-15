# Changelog SakuKilat

Semua perubahan penting pada proyek SakuKilat dicatat di dalam dokumen ini.
Format ini mengikuti prinsip [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan mematuhi [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-14 (versionCode: 16)

### Added
- **Single Source of Truth (SSoT) Buku Besar**: Formula matematis absolut `wallet.currentBalance === openingBalance + sum(ledger impacts)` yang menjamin saldo dompet selalu sinkron dengan mutasi riil buku besar.
- **Mekanisme Self-Healing Rekonsiliasi**: Pendeteksian dan koreksi saldo melenceng secara otomatis saat inisialisasi dan transaksi tanpa memanipulasi mutasi masa lalu.
- **Pengerasan Kriptografis App-Lock PIN**: Peningkatan algoritma penyimpanan passcode dari raw SHA-256 menjadi Salted PBKDF2 dengan salt kriptografis unik acak per-pengguna dan 100.000 iterasi.
- **Verifikasi Kriptografis WebAuthn**: Validasi autentikasi biometrik melalui verifikasi signature dan challenge kriptografis asersi WebAuthn secara ketat.
- **Penyimpanan Atomik & Deteksi Kuota Penuh**: Pola penulisan atomik (write-then-replace) pada penyimpanan lokal yang dilengkapi deteksi kegagalan kuota storage dan notifikasi toast kepada pengguna.
- **Deep Schema Validation**: Validasi skema mendalam saat memuat persisted state atau bundled state dengan pemangkasan aman (safe pruning) pada node yang korup tanpa memicu crash aplikasi.
- **Input Gating Multi-Transaksi**: Analisis cerdas pada Smart Input yang mendeteksi masukan jamak (multi-transaction) dan menyediakan dialog konfirmasi pemecahan transaksi.
- **Penegakan 25 Invarian Sistem**: Suite Property-Based Testing (`tests/pbt-25-invariants.test.ts`) berbasis `fast-check` dengan ribuan iterasi untuk memverifikasi 25 invarian integritas sistem secara formal.
- **Pengujian Kasus Ekstrem & Batas**: Verifikasi presisi integer moneter hingga Rp10.000.000.000 (sepuluh miliar rupiah), penanganan kabisat 29 Februari, pergantian akhir bulan, dan ketahanan payload catatan 1.000+ karakter.

### Changed
- **Menaikkan Versi Aplikasi**: Bump versi proyek menjadi `1.1.0` pada `package.json` dan aplikasi.
- **Menaikkan Versi Android**: Bump `versionCode` dari 15 ke 16 dan `versionName` menjadi `"1.1.0"` pada `android/app/build.gradle`.
- **Sinkronisasi Dua Arah Dompet & Metode Pembayaran**: Penambahan atau penghapusan dompet tersinkronisasi dua arah dengan `customPayments` tanpa rekursi atau perulangan kreasi mutual (*mutual creation loop*).
- **Paritas Validasi `updateWallet`**: Menyelaraskan seluruh aturan validasi saldo, tipe, dan nama pada saat pembaruan dompet agar identik dengan aturan pembuatan dompet baru.
- **Penanganan Tanggal 31 pada Bulan Pendek**: Mengganti rollover diam-diam pada Smart Input dengan penyesuaian (*clamping*) ke hari terakhir bulan terkait (misal: 31 Feb menjadi 28/29 Feb, 31 Apr menjadi 30 Apr).
- **Format Catatan Rilis**: Memperbarui riwayat versi pada modal Catatan Rilis (`PatchNotesModal`) dengan entri rilis akbar v1.1.0 berstatus aktif (`isLatest: true`).

### Fixed
- **Pencegahan Kebangkitan Dompet (Anti-Resurrection)**: Memperbaiki `ensureWallet()` agar tidak membangkitkan kembali dompet yang telah dihapus atau diarsipkan saat pemrosesan transaksi atau lookup.
- **Penghapusan Dompet Non-Destruktif**: Menjaga transaksi masa lalu tetap utuh saat dompet dihapus dengan mempertahankan label nama dompet dan menyematkan penanda `deleted: true`.
- **Sanitasi Nilai Moneter**: Menolak dan membersihkan nilai `NaN`, `Infinity`, desimal sen, atau tipe non-numerik pada form manual, mutasi transfer, dan pengaturan anggaran.
- **Validasi Nilai Anggaran Non-Negatif**: Menolak nilai negatif pada `setMonthlyBudget()` dan memastikan jatah budget harian selalu berupa integer non-negatif.
- **Imunitas Error Tanggal Runtime**: Melindungi pemanggilan `.toISOString()` dari string atau objek tanggal tidak valid sehingga kebal dari runtime exception `RangeError: Invalid time value`.
- **Persistensi Preferensi Notifikasi**: Mengatasi reset preferensi notifikasi pengguna ke nilai default saat aplikasi dimuat ulang.
- **Penghapusan Kategori Aman**: Menjaga label nama kategori historis pada transaksi lama saat kategori kustom dihapus dari sistem.
- **Perlindungan Mutasi Metadata Kategori**: Mencegah perubahan tipe kategori yang dapat mengacaukan klasifikasi transaksi di masa lampau.
- **Deduplikasi Kategori Aman**: Memperbarui seluruh referensi ID kategori pada transaksi lama saat dilakukan penggabungan atau deduplikasi kategori.
- **Pelindung Atomic Undo & Double-Undo**: Mencegah race condition kalkulasi delta inversi pada aksi Undo beruntun atau cepat dengan pengecekan sekuensial terproteksi.
- **Blokir Transfer Dompet Identik**: Menolak transaksi pemindahan dana jika dompet asal dan dompet tujuan yang dipilih adalah entitas yang sama.

### Security
- Menegakkan pemindaian keamanan data pribadi dan finansial SK-001 dengan hasil 100% lulus dan 0 kebocoran data.
- Mengamankan passcode App-Lock dengan derivasi kunci PBKDF2 (100.000 iterasi) yang tahan terhadap serangan kamus dan *rainbow table*.
- Menolak asersi autentikasi biometrik WebAuthn tanpa validasi signature kriptografis yang sah.
- Menerapkan mekanisme rate limiting bertingkat untuk proteksi brute-force PIN.

---

## [1.0.9] - 2026-09-14 (versionCode: 15)

### Added
- Navigasi berlayar (Stacking Layer Surface / BottomSheet) independen pada Tab Saku untuk seluruh submenu (Kelola Saku, Pindah Saldo, Kategori & Subkategori, dan Inbox Review) terintegrasi sistem tombol kembali LIFO (`pushBackLayer`).
- Kolom input "Catatan (opsional)" eksplisit dan langsung terlihat di alur form utama `ManualEntryForm` untuk tipe transaksi Pengeluaran, Pemasukan, dan Transfer antar-saku.
- Modul "Wawasan & Analisis Lengkap" (Cashflow Predictor, Skor Finansial, Target Tabungan, Analisis Berkala) di Tab Rencana sebagai instrumen perencanaan berkala terpadu.
- Helper format rupiah kalender adaptif ringkas (`formatIDRCalendarCompact`) di `lib/parser.ts` untuk menampilkan nominal harian pada sel grid sempit mobile tanpa elipsis.
- Guard proteksi rekonsiliasi saldo pada saku tanpa mutasi transaksi di bulan berjalan (`ReconciliationModal`) dengan banner peringatan informatif.
- Entri rilis resmi v1.0.9 pada dialog Catatan Rilis (`PatchNotesModal`) yang merangkum paket pembaruan submenu berlayar dan perbaikan bug antarmuka.
- Tampilan versi aktif aplikasi `v1.0.9` di footer Tab Profil dan pembaruan badge `v1.0.9 BARU` pada menu Catatan Rilis.

### Changed
- Menggantikan pola *accordion sprawl* inline pada Tab Saku dengan Menu Tile / Card Launcher ringkas dengan touch target >= 44×44 px.
- Menata ulang layout kartu riwayat transaksi (`TransactionItem`) dengan memposisikan tanggal dan waktu pencatatan persis di bawah label kategori/deskripsi pengeluaran dalam baris tersendiri.
- Menggantikan styling `truncate` pada sel kalender di Tab Rekapan dengan `whitespace-nowrap tabular-nums` yang menjamin seluruh angka rupiah harian terbaca utuh tanpa elipsis (`...`).
- Merelokasi modul analitik sekunder dari Tab Beranda ke Tab Rencana untuk menjaga Beranda tetap ringkas, cepat, dan fokus pada pencatatan harian.
- Menaikkan `versionCode` dari 14 ke 15 pada konfigurasi Gradle Android (`android/app/build.gradle`) untuk menjamin instalasi update mulus di Android.
- Menaikkan versi aplikasi menjadi `1.0.9` pada konfigurasi proyek `package.json`.
- Menjadikan rilis `v1.0.9` sebagai status `isLatest: true` dan default terbuka (expanded) pada modal Catatan Rilis.

### Fixed
- Mengatasi masalah *accordion sprawl* memanjang vertikal hingga >2.500 px di Tab Saku saat submenu dibuka secara inline.
- Mengatasi field catatan tersembunyi di balik accordion sekunder dan ketidaksediaan input catatan pada transaksi transfer.
- Mengatasi pemotongan nominal rupiah (`+1.5...` / `-250...`) pada sel kalender bulanan mobile 390px.
- Mengatasi celah pencatatan rekonsiliasi semu pada dompet/saku pasif yang tidak memiliki transaksi di bulan berjalan.
- Mengatasi desakan badge kategori, subkategori, split, dan dompet pada baris tanggal transaksi di menu Rekapan.

### Security
- Menegakkan pemindaian keamanan data pribadi SK-001 dengan 0 kebocoran data terdeteksi.
- Melindungi keutuhan riwayat mutasi keuangan selama proses rekonsiliasi saldo melalui pencatatan koreksi non-destruktif.

---

## [1.0.8] - 2026-09-14 (versionCode: 14)

### Added
- Kontrol tanggal dan waktu transaksi langsung terlihat pada area utama form Catat Manual (`ManualEntryForm`) dengan label aksesibilitas terhubung `<label htmlFor="sk-manual-entry-date">`.
- Tombol pintas cepat "Hari Ini" dan "Kemarin" pada form Catat Manual dan Modal Edit Transaksi.
- Safeguard konfirmasi dua langkah inline pada tombol Hapus kartu saku ("Hapus?" dan "Batal") dengan timeout otomatis 4 detik.
- Progressive disclosure section "Wawasan & Analisis Lengkap" pada Beranda untuk mengelompokkan widget analitik sekunder (Cashflow, Insights, Goals, dan Analisis Berkala).
- Guard numerik ketat pada `generateWidgetSnapshot` terhadap nilai `remainingAmount` non-angka, `NaN`, atau `Infinity`.

### Changed
- Menaikkan `versionCode` dari 13 ke 14 pada konfigurasi Gradle Android (`android/app/build.gradle`) untuk mendukung pembaruan tanpa downgrade.
- Menaikkan `versionName` dan versi proyek menjadi `1.0.8` di `package.json` dan aplikasi.
- Memperbesar target sentuh tombol aksi kartu saku (Rekonsiliasi, Edit, Hapus) dari 28×28 px menjadi 40×40 px (`w-10 h-10 min-w-[40px] min-h-[40px]`).
- Memperbesar tombol aksi transfer dan simpan pada `MoneyMovePanel` menjadi tinggi 44 px (`h-11`).
- Merampingkan vertical height floating dock Smart Input pada mobile dari ~108 px menjadi 66 px.
- Menata ulang tata letak Beranda dan MonthHeroChart sehingga `BudgetCard` (termasuk Jatah/hari dan Sisa hari) 100% terlihat di atas floating Smart Input tanpa tumpang tindih pada viewport mobile 390×844 px.
- Menghilangkan CSS `whitespace-nowrap` pada header tanggal Beranda, menggantikannya dengan `flex flex-wrap` responsif bebas horizontal overflow.

### Fixed
- Menghilangkan tumpang tindih geometris antara kartu Budget dan floating Smart Input pada viewport 390×844 px (margin aman >60 px).
- Memperbaiki pengujian Playwright `scripts/test-live-ux.py` agar secara ketat mewajibkan `split_editor_visible === true` pada saat pengujian split transaksi di modal edit.
- Menjaga accordion "Detail Tambahan" pada Catat Manual murni untuk subkategori belanja dan catatan opsional.

---

## [1.0.7] - 2026-08-24 (versionCode: 13)

### Added
- Fitur Balanced Split Transactions (Fase P11): validator pembagian belanja multi-kategori dengan penjagaan invariant selisih nominal.
- Komponen editor baris split interaktif (`SplitTransactionEditor`).
- Distribusi pelaporan split per kategori di Tab Rekapan.
- Manual Net Worth & Debt Tracking (Fase P10).
- Monthly Financial Close / Tutup Buku Bulanan (Fase P9).
- Local Categorization Rules & Inbox Review (Fase P8).
- Goal Planner Enhancement dengan proyeksi kontribusi dan status kesehatan (Fase P7).
- Wallet Balance Reconciliation dengan log audit non-destruktif (Fase P6).
- Bill & Subscription Center (Fase P5).
- Android Native Home Screen Widgets Small, Medium, Large via RemoteViews (Fase P4).
- Tab Saku 4 Section Collapsible dan subkategori berbasis `flex-wrap` (Fase P3).
- Compact Payment Method Selector dengan ranking frekuensi + resensi (Fase P2).
- Format tanggal-waktu akurat tanpa drift zona waktu dan nominal rupiah penuh (Fase P1).
- Property-Based Testing Harness (`fast-check`) dengan 31 Correctness Properties (Fase P0).
