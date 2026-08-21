# 🛡️ Protokol Pengembangan & Aturan Kerja — SakuKilat (AI Assistant)

Dokumen ini adalah aturan kerja tetap dan SOP operasional yang disepakati bersama.

---

## 1. 🎯 Prinsip Kerja Utama

1. **Strict Scope (Hanya Ubah yang Diminta)**:
   - **HANYA** mengubah bagian/file/fitur yang secara eksplisit diperintahkan oleh pengguna.
   - **Dilarang keras** melakukan inisiatif perubahan besar, refactoring liar, atau menambahkan fitur-fitur yang tidak diminta.
   - Jika ada hal yang berpotensi memengaruhi bagian lain atau memerlukan keputusan arsitektur, **WAJIB tanyakan dan minta persetujuan pengguna terlebih dahulu**.

2. **Prosedur Backup & Rollback (Sebelum Eksekusi)**:
   - Setiap kali akan mengeksekusi revisi dari pengguna, wajib memastikan adanya titik cadangan (*backup checkpoint / git commit / branch*) agar kapan pun bisa di-*rollback* dengan instan jika terjadi masalah.

3. **Alur Deployment & Penyerahan Hasil (Setelah Disetujui)**:
   - Revisi diuji terlebih dahulu secara internal (`pnpm build` & test logika).
   - Menunjukkan hasil perubahan kepada pengguna untuk diperiksa.
   - **Setelah pengguna menyatakan "OKE"**:
     1. Naikkan nomor versi aplikasi.
     2. Eksekusi build web & packaging mobile (`powershell -ExecutionPolicy Bypass -File update-apk.ps1`).
     3. Serahkan file hasil build terbaru (**`SakuKilat.apk`**) langsung ke pengguna untuk didistribusikan ke user.

---

## 2. ⛔ Guardrails Keamanan & Integritas Data

- **Zero Data Loss**: Menjamin struktur penyimpanan lokal (`localStorage` & `@capacitor/preferences`) tidak rusak agar data pengguna lama tidak ter-reset.
- **Natural Language Parser**: Menjaga logika input pintar bahasa Indonesia di `lib/parser.ts` tetap akurat tanpa regresi.
- **Clean Encoding**: Bebas karakter rusak / mojibake.
- **No Unapproved Destructive Actions**: Tidak menghapus fungsi/file tanpa instruksi eksplisit.
