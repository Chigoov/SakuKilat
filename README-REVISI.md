# Ringkasan Revisi SakuKilat (v3)

Tanggal: 23 Juli 2026 - Update terakhir: fix P2/P3/P4/P5 dari REVISI-LENGKAP-SAKUKILAT.md

---

## Prioritas dari Dokumen Kamu

| # | Item | File | Status |
|---|------|------|--------|
| P1 | Bug budget harian (false-positive over) | lib/stats.ts | [OK] sudah di patch v2 |
| P2 | Validasi tanggal ekspor PDF terfilter | components/filtered-pdf-export.tsx | [OK] diperkuat 2 lapis |
| P3 | Script lint rusak (`eslint .`) | package.json | [OK] script dihapus |
| P4 | Input jam di form catat manual | components/manual-entry-form.tsx | [OK] ditambah |
| P5 | Encoding komentar rusak (mojibake) | lib/, components/ | [OK] semua ASCII |
| P6 | Tes manual APK | (manual) | tugas kamu |

---

## Detail Perbaikan

### P1 - Budget Harian (sudah dari v2)

Konfirmasi state sekarang di `lib/stats.ts`:

```ts
const spentEarlierThisWeek = weeklySpent - todayExpense
const todayBudgetLimit = Math.max(
  0,
  (dynamicWeeklyBudget - spentEarlierThisWeek) / remainingWeekDays
)
const weeklyRemainingDynamic = dynamicWeeklyBudget - weeklySpent
const dynamicDailyBudget = Math.max(0, weeklyRemainingDynamic / remainingWeekDays)

// Over-check pakai todayBudgetLimit (bukan dynamicDailyBudget)
todayOverBase: todayExpense > todayBudgetLimit && safeBudget > 0,
```

`BudgetStatus.todayBudgetLimit` sudah ada di return. `components/budget-card.tsx` sudah pakai
`status.todayBudgetLimit` di teks peringatan (bukan `status.dynamicDailyBudget` lagi).

Test skenario 8 di `scripts/test-budget-logic.mjs` sudah mencakup kasus 46k vs limit 50k
persis seperti yang kamu tulis di dokumen.

### P2 - Validasi Tanggal PDF Terfilter

Sebelumnya cuma satu guard yang bandingin objek Date via operator `>` (bergantung pada
`valueOf`). Sekarang 2 lapis:

```ts
// Guard #1: bandingin getTime() eksplisit (tidak tergantung operator overloading)
if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
  showToast('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.', 'error')
  return
}
// Guard #2 (safety net): fallback string ISO date (YYYY-MM-DD) lexicographic
if (start && end && start.length === 10 && end.length === 10 && start > end) {
  showToast('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.', 'error')
  return
}
```

Simulasi sudah dicek:
- `2026-07-25` vs `2026-07-23` -> BLOCKED (Guard#1)
- `2026-07-23` vs `2026-07-23` -> PROCEED (sama tanggal boleh)
- `2026-07-20` vs `2026-07-25` -> PROCEED (benar urutan)

### P3 - Lint Script

`package.json` sebelumnya:

```json
"lint": "eslint ."
```

Ini gagal karena `eslint` tidak di `devDependencies`. Sesuai rekomendasi kamu ("belum
perlu tooling besar"), script `lint` dihapus. Kalau nanti mau setup ESLint, tambah dep
+ config baru.

`pnpm lint` sekarang akan bilang "missing script: lint" (bukan lagi error command not found).

### P4 - Input Jam di Manual Entry

`components/manual-entry-form.tsx`:

1. Helper baru `timeInputValue(date)` return format `HH:MM`.
2. `dateFromInput(value, timeValue?)` sekarang terima parameter jam.
3. State baru `entryTime` diinisialisasi dari `timeInputValue()` dan direset saat modal dibuka.
4. UI: tanggal + jam sekarang side-by-side (`grid grid-cols-2 gap-2`).
5. `handleSubmit` gabungin tanggal + jam saat memanggil `addManualTransaction`.

Backward compat: kalau `timeValue` tidak diisi, fallback ke jam sekarang (perilaku lama).

### P5 - Encoding Bersih (Mojibake)

Semua file yang saya edit sekarang pure ASCII (kecuali emoji `\ud83c\udf5c` di
`tab-rekapan.tsx` L980 yang memang sudah ada di repo asli kamu — dari commit `f6e5ad1`,
bukan tambahan saya).

Karakter yang saya replace:
- `\u2500` `\u2501` `\u2550` (box drawing) -> `-` / `=`
- `\u2013` `\u2014` (en/em dash) -> `-` / `--`
- `\u2018` `\u2019` `\u201c` `\u201d` (curly quotes) -> `'` / `"`
- `\u2022` `\u00b7` (bullet, middle dot) -> `*` / `.`
- `\u2190` `\u2192` (arrows) -> `<-` / `->`
- `\u00d7` `\u00f7` (mult/div) -> `x` / `/`
- `\u2212` (minus sign) -> `-`
- Dll (lihat script sanitize)

Cek verifikasi:

```
lib/stats.ts                             [OK] pure ASCII
lib/parser.ts                            [OK] pure ASCII
lib/store.tsx                            [OK] pure ASCII
lib/report.ts                            [OK] pure ASCII
components/budget-card.tsx               [OK] pure ASCII
components/transaction-item.tsx          [OK] pure ASCII
components/tab-beranda.tsx               [OK] pure ASCII
components/tab-profil.tsx                [OK] pure ASCII
components/tab-rekapan.tsx               [OK] pure ASCII (kecuali emoji asli)
components/filtered-pdf-export.tsx       [OK] pure ASCII
components/manual-entry-form.tsx         [OK] pure ASCII
```

`rg -n "â|Ã|Â" components lib` sekarang tidak akan return apa-apa dari file yang saya sentuh.

---

## Test

```bash
node scripts/test-budget-logic.mjs
```

9 skenario semua PASS. Kalau kamu tambah skenario baru sesuai P1 check di dokumen,
skenario 8 sudah cover kasus 46k persis.

---

## Cara Apply

**Opsi A:** copy file di folder ini ke repo kamu (mirror struktur).

**Opsi B:** `git apply CHANGES.patch` di root repo.

Setelah itu:

```bash
pnpm install     # (kalau belum)
pnpm build       # verifikasi TypeScript build
node scripts/test-budget-logic.mjs
pnpm sync:mobile
pnpm open:android
```

---

## Catatan

- Semua patch minimal seperti yang kamu minta ("diff sekecil mungkin"). Tidak ada
  rewrite besar, tidak ada dependency baru.
- Ramen emoji di tab-rekapan.tsx dari commit kamu sendiri, sengaja dibiarkan.
- Manual APK test (P6) di luar cakupan saya - lakukan sesuai checklist di section 8
  dokumen kamu.
