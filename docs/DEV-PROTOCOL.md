# 🛡️ Protokol Pengembangan & Aturan Kerja — SakuKilat (AI Assistant)

Dokumen ini adalah aturan kerja tetap, SOP operasional, dan pedoman mutlak yang disepakati bersama. Semua sesi kerja dan AI asisten berikutnya **WAJIB** membaca dan mematuhi dokumen ini.

---

## 1. 🎯 Prinsip Kerja Utama

1. **Strict Scope (Hanya Ubah yang Diminta)**:
   - **HANYA** mengubah bagian/file/fitur yang secara eksplisit diperintahkan oleh pengguna.
   - **Dilarang keras** melakukan inisiatif perubahan besar, refactoring liar, atau merombak styling/font yang sudah disepakati.
   - Jika ada hal yang berpotensi memengaruhi bagian lain atau memerlukan keputusan arsitektur, **WAJIB tanyakan dan minta persetujuan pengguna terlebih dahulu**.

2. **Prosedur Backup & Rollback (Sebelum Eksekusi)**:
   - Setiap kali akan mengeksekusi revisi dari pengguna, wajib memastikan adanya titik cadangan (*backup checkpoint / git commit / branch*) agar kapan pun bisa di-*rollback* dengan instan jika terjadi masalah.

3. **Alur Deployment & Penyerahan Hasil (Fokus Edisi Publik Tunggal)**:
   - **Target Deploy Tunggal**: Setiap build dan deployment Android **WAJIB selalu fokus ke Edisi Publik (`com.sakukilat.app.v2`)**. TIDAK ADA edisi personal/terpisah.
   - **Signing Key Resmi**: Wajib selalu menggunakan release keystore resmi (`android/keystore.properties` & `android/app/sakukilat-release.jks`) agar sertifikat SHA-256 (`13dccbbd787224435ad6ac5330fd96c5de30a5f703ee87689b46bf21991a90a4`) selalu konsisten dan dapat di-update tanpa bentrok di perangkat user.
   - Revisi diuji terlebih dahulu secara internal (`pnpm build` & test logika).
   - Menunjukkan hasil perubahan kepada pengguna untuk diperiksa.
   - **Setelah pengguna menyatakan "OKE"**:
     1. Naikkan nomor versi aplikasi di `package.json` dan `android/app/build.gradle` (versionCode & versionName).
     2. Eksekusi build web & packaging mobile (`powershell -ExecutionPolicy Bypass -File scripts/update-apk.ps1`).
     3. Serahkan file hasil build terbaru (**`SakuKilat.apk`**) langsung ke pengguna.

---

## 2. 🚫 ATURAN MUTLAK UI/UX (DILARANG UBAH TANPA INSTRUKSI USER)

Aturan-aturan berikut merupakan keputusan desain final yang telah disetujui pengguna dan **DILARANG DIRUBAH** oleh asisten AI berikutnya:

1. **Nominal Angka Harus Utuh (DILARANG DISINGKAT / TERPOTONG)**:
   - Dilarang mengganti `formatIDR` menjadi `formatIDRCompact` (misal: dilarang menampilkan "Rp 1,2jt", harus selalu "Rp 1.225.500").
   - Dilarang menambahkan `text-ellipsis` / `overflow-hidden` yang menyebabkan angka nominal terpotong menjadi titik-titik (`Rp 1.225....`).
   - Semua angka keuangan wajib ditampilkan secara **lengkap dan utuh**.

2. **Dilarang Merombak Ukuran Font & Layout yang Sudah Pas**:
   - Jangan sembarangan mengubah ukuran font (`text-sm`, `text-base`, `text-lg`, dll.), padding container, atau struktur tata letak yang sudah diuji dan dipaskan pada layar HP fisik pengguna.

3. **Non-Breaking Space Rupiah (`\u00a0`)**:
   - Fungsi `formatIDR` di `lib/parser.ts` wajib menggunakan spasi non-breaking (`\u00a0`) antara "Rp" dan digit angka. Ini mutlak agar "Rp" dan angka tidak pernah terpisah baris di perangkat mana pun.

4. **Pilihan Sub Kategori Harus Menurun (Flex Wrap)**:
   - Menu pemilihan subkategori di Form Catat Manual dan Modal Edit Transaksi harus selalu berderet menurun (`flex-wrap`), **BUKAN** carousel geser ke kanan / horizontal scroll (`overflow-x-auto`). Semua subkategori harus langsung terlihat tanpa perlu swipe ke kanan.

5. **Area Aman Notch / Status Bar Layar (Safe Area Inset)**:
   - Root container wajib menyertakan kelas `.safe-top` dengan `padding-top: max(env(safe-area-inset-top, 0px), 28px)` di mobile (`< 768px`) agar konten atas (kartu streak nyawa, judul header) tidak pernah menembus kamera punch hole / notch / status bar HP.

6. **Dedicated Bottom-Sheet Edit Modal**:
   - Menu edit/revisi transaksi di Riwayat selalu menggunakan dedicated Bottom Sheet Modal (`components/edit-transaction-modal.tsx`), bukan accordion inline yang melar di tengah list.

7. **Quick Amount Chips & Quick Date**:
   - Tombol nominal cepat (`+10rb`, `+20rb`, `+50rb`, `+100rb`, `+500rb`, `Hapus`) dan tombol tanggal cepat (`Hari Ini`, `Kemarin`) di form manual dan edit modal harus selalu dipertahankan.

8. **Tab Saku & Profil**:
   - Form "Tambah Saku Baru" harus tetap dalam bentuk collapsible `[ + Tambah Saku Baru ]`.
   - Tombol aksi cepat `[ Transfer / Pindah Saldo ]` harus tetap tersedia.
   - Kartu "Bulan Ini" di Tab Profil menggunakan format 2 tingkat (Saldo Bersih di atas, Masuk & Keluar di bawah dalam 2 kolom) agar angka tidak pernah terpotong.

---

## 3. ⛔ Guardrails Keamanan & Integritas Data

- **Zero Data Loss**: Menjamin struktur penyimpanan lokal (`localStorage` & `@capacitor/preferences`) tidak rusak agar data pengguna lama tidak ter-reset.
- **Natural Language Parser**: Menjaga logika input pintar bahasa Indonesia di `lib/parser.ts` tetap akurat tanpa regresi.
- **Clean Encoding**: Bebas karakter rusak / mojibake.
- **No Unapproved Destructive Actions**: Tidak menghapus fungsi/file tanpa instruksi eksplisit.

