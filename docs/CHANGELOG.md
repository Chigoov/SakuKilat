# SakuKilat — Changelog

Catatan perubahan aplikasi SakuKilat. Setiap perubahan yang memengaruhi fitur, perilaku, UI/UX, data, build, keamanan, atau dependency dicatat di bagian `Unreleased` terlebih dahulu.

Ketika nomor versi dinaikkan, bagian `Unreleased` harus difinalisasi menjadi versi tersebut dan catatan yang sama harus dimasukkan ke menu **Profil → Catatan Rilis (Patch Notes)** di dalam aplikasi.

## Unreleased

### Dokumentasi dan Patch Notes

- Menetapkan `docs/CHANGELOG.md` sebagai arsip perubahan yang disimpan bersama source code.
- Menjadikan menu **Profil → Catatan Rilis (Patch Notes)** sebagai tampilan riwayat versi untuk pengguna aplikasi.
- Menyelaraskan label versi pada modal Patch Notes, menu Profil, dan Buku Panduan dengan versi aplikasi pada `package.json`.

## v1.0.7 — 24 Agustus 2026

### Fitur dan UX

- Dedicated edit bottom-sheet modal untuk revisi transaksi.
- Quick Amount Chips dan Quick Date pada form manual serta modal revisi.
- Preset subkategori dan pengenalan subkategori melalui Smart Input.
- Accordion drilldown subkategori pada Tab Rekapan.
- Badge visual untuk membedakan jenis saku.

## v1.0.6 — 24 Agustus 2026

### Perbaikan

- Memperbaiki akurasi input singkatan nominal seperti `1.5k`.
- Memperbaiki kalkulasi desimal dan angka bertitik.
- Menyaring kata keterangan sehari-hari pada Smart Input.
- Menampilkan saldo pada pemilih saku.
- Mengoptimalkan ruang layar Tab Rekapan dan Tab Saku.
- Memperbesar target sentuh tombol kategori.
- Memperbaiki antrean notifikasi trofi.

## v1.0.5 — 15 Agustus 2026

### Perbaikan

- Memperbaiki kalkulasi ringkasan kategori pemasukan.
- Menyinkronkan struktur saku dan transaksi agar tidak meninggalkan transaksi yatim.

## v1.0.4 — 2 Agustus 2026

### Fitur

- Menambahkan pratinjau laporan PDF sebelum cetak.
- Menambahkan ekspor data CSV yang dapat difilter.

## v1.0.0 — v1.0.3 — Juli 2026

### Rilis Perdana

- Smart Quick Input 100% offline.
- Sistem lencana pencapaian dan streak.
- Budget harian dan keamanan PIN lokal.
