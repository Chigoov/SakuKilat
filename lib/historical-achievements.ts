/**
 * SakuKilat — Evaluator Flag Historis (FUNGSI MURNI)
 * --------------------------------------------------------------------------
 * Modul ini SENGAJA murni: tidak menyentuh `window`, tidak memanggil
 * `Date.now()` internal — `now` selalu di-inject lewat input. Tujuannya supaya
 * logika auto-unlock badge `ON_CRON_MIDNIGHT` bisa diuji deterministik (lihat
 * scripts/verify-historical) dan dipakai ulang di Node maupun browser.
 *
 * Output `evaluateHistoricalFlags` adalah daftar FULL key localStorage
 * (mis. 'sakukilat:v2:ach-tutup-aman') yang SEHARUSNYA menyala. Pemanggil
 * (lib/cron.ts) hanya menyalakan flag (setFlag), tidak pernah mematikan —
 * sehingga sifat monoton/idempoten dijaga di lapisan persistensi.
 *
 * Prinsip "jangan gagal diam-diam" + anti false-positive:
 * - Data kosong → kembalikan [] (tidak ada flag).
 * - Kondisi "tanpa pengeluaran" (noskip/puasa/weekend-hemat/survivor) hanya
 *   dihitung untuk hari yang berada DALAM rentang data aktual pengguna
 *   (>= transaksi paling awal, < awal hari ini). Pengguna baru tidak otomatis
 *   dapat badge hanya karena belum ada data.
 * - Totalitas: tidak pernah melempar untuk input ekstrem (dibungkus try/catch).
 */

import type { Transaction } from './mock-data'

// ── Prefix kunci localStorage (selaras lib/achievements.ts) ───────────────────
const ACH_PREFIX = 'sakukilat:v2:'
function achKey(name: string): string {
  return ACH_PREFIX + name
}

export interface HistoricalInput {
  transactions: Transaction[]
  monthlyBudget: number
  zenMode: boolean
  now: Date
}

const MS_PER_DAY = 86_400_000
// Batas aman penelusuran hari mundur agar tanggal ekstrem (mis. transaksi
// bertanggal jauh di masa lampau) tidak memicu loop berlebihan. Flag bulanan
// tidak terpengaruh batas ini karena diagregasi langsung dari transaksi.
const MAX_LOOKBACK_DAYS = 4000
const SURVIVOR_THRESHOLD = 20_000

// ── Helper murni ──────────────────────────────────────────────────────────────
/** Sama semantik dengan `dayKeyOf` di lib/achievements.ts (bulan 0-based). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Keputusan rollover murni: true bila belum pernah, atau beda hari kalender. */
export function needsRollover(lastDateKey: string | null, now: Date): boolean {
  if (lastDateKey == null) return true
  try {
    return lastDateKey !== dayKey(now)
  } catch {
    return true
  }
}

/** Transaksi "nyata" = bukan pemindahan antar-saku/penyimpanan. */
function isRealTx(t: Transaction): boolean {
  return t.kind !== 'transfer' && t.kind !== 'saving'
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

function safeAmount(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Indeks bulan absolut untuk perbandingan urutan (tahun*12 + bulan). */
function monthIndexOf(year: number, month: number): number {
  return year * 12 + month
}

/**
 * Evaluasi seluruh kondisi historis dari data transaksi + budget + now.
 * Mengembalikan daftar FULL key flag yang seharusnya menyala.
 */
export function evaluateHistoricalFlags(input: HistoricalInput): string[] {
  try {
    const flags = new Set<string>()
    const now = input?.now
    if (!isValidDate(now)) return []

    // Saring transaksi valid (tanggal benar) — defensif terhadap data parsial.
    const txs = Array.isArray(input.transactions)
      ? input.transactions.filter((t) => t && isValidDate(t.date))
      : []
    if (txs.length === 0) return []

    const budget = Number.isFinite(input.monthlyBudget) ? input.monthlyBudget : 0
    const realTxs = txs.filter(isRealTx)

    // ── 1) Agregasi bulanan (income/expense) dari transaksi nyata ─────────────
    // key bulan: `${tahun}-${bulan}` (bulan 0-based).
    const monthAgg = new Map<string, { income: number; expense: number }>()
    for (const t of realTxs) {
      const mk = `${t.date.getFullYear()}-${t.date.getMonth()}`
      const agg = monthAgg.get(mk) ?? { income: 0, expense: 0 }
      const amt = safeAmount(t.amount)
      if (t.type === 'expense') agg.expense += amt
      else if (t.type === 'income') agg.income += amt
      monthAgg.set(mk, agg)
    }

    const nowMonthIdx = monthIndexOf(now.getFullYear(), now.getMonth())
    const isElapsedMonth = (mk: string): boolean => {
      const parts = mk.split('-').map(Number)
      const y = parts[0]
      const m = parts[1]
      if (!Number.isFinite(y) || !Number.isFinite(m)) return false
      return monthIndexOf(y, m) < nowMonthIdx
    }

    // ── 2) Flag berbasis budget (hanya bila budget > 0) ───────────────────────
    // Butuh bulan yang SUDAH LEWAT (sebelum bulan now) dengan total pengeluaran
    // di bawah ambang tertentu.
    if (budget > 0) {
      for (const [mk, agg] of monthAgg) {
        if (!isElapsedMonth(mk)) continue
        if (agg.expense < budget) flags.add(achKey('ach-tutup-aman'))
        if (agg.expense < budget * 0.5) flags.add(achKey('ach-under50'))
        if (agg.expense < budget * 0.25) flags.add(achKey('ach-under25'))
      }
    }

    // ── 3) Surplus: bulan mana pun (termasuk berjalan) income > expense & income>0
    for (const agg of monthAgg.values()) {
      if (agg.income > 0 && agg.income > agg.expense) {
        flags.add(achKey('ach-surplus'))
        break
      }
    }

    // ── 4) Agregasi harian + rentang data aktual ──────────────────────────────
    // expenseByDay: total pengeluaran nyata per hari.
    // nonExpenseActivityDays: hari yang punya aktivitas non-pengeluaran
    //   (income/transfer/saving) — menandakan app dipakai hari itu.
    const expenseByDay = new Map<string, number>()
    const nonExpenseActivityDays = new Set<string>()
    let earliestMs = Number.POSITIVE_INFINITY
    for (const t of txs) {
      const dStart = new Date(t.date.getFullYear(), t.date.getMonth(), t.date.getDate()).getTime()
      if (dStart < earliestMs) earliestMs = dStart
      const dk = dayKey(t.date)
      if (isRealTx(t) && t.type === 'expense') {
        expenseByDay.set(dk, (expenseByDay.get(dk) ?? 0) + safeAmount(t.amount))
      } else {
        nonExpenseActivityDays.add(dk)
      }
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTodayMs = startOfToday.getTime()

    // Mulai penelusuran dari hari paling awal data, dibatasi lookback maksimum.
    const minAllowedMs = startOfTodayMs - MAX_LOOKBACK_DAYS * MS_PER_DAY
    let cursorMs = Math.max(earliestMs, minAllowedMs)

    // ── 5) Flag berbasis hari (noskip / puasa / weekend-hemat) ────────────────
    // Hanya menelusuri hari yang sudah lewat (< awal hari ini) DAN dalam rentang
    // data, supaya akun kosong/baru tidak pernah memicu flag ini.
    if (Number.isFinite(cursorMs) && cursorMs < startOfTodayMs) {
      const cur = new Date(cursorMs)
      cur.setHours(0, 0, 0, 0)
      let consecutiveZero = 0
      let prevWasZeroSaturday = false
      while (cur.getTime() < startOfTodayMs) {
        const dk = dayKey(cur)
        const exp = expenseByDay.get(dk) ?? 0
        const zeroExpense = exp === 0

        // noskip: hari lewat tanpa pengeluaran TAPI ada aktivitas non-pengeluaran.
        if (zeroExpense && nonExpenseActivityDays.has(dk)) {
          flags.add(achKey('ach-noskip'))
        }

        // puasa: 3 hari beruntun tanpa pengeluaran (dalam rentang data).
        if (zeroExpense) consecutiveZero += 1
        else consecutiveZero = 0
        if (consecutiveZero >= 3) flags.add(achKey('ach-puasa'))

        // weekend-hemat: pasangan Sabtu(6)+Minggu(0) berurutan, keduanya tanpa
        // pengeluaran. Karena iterasi harian berurutan, Minggu pasti didahului
        // Sabtu bila keduanya dalam rentang.
        const dow = cur.getDay()
        if (dow === 6) {
          prevWasZeroSaturday = zeroExpense
        } else if (dow === 0) {
          if (prevWasZeroSaturday && zeroExpense) flags.add(achKey('ach-weekend-hemat'))
          prevWasZeroSaturday = false
        } else {
          prevWasZeroSaturday = false
        }

        cur.setDate(cur.getDate() + 1)
      }
    }

    // ── 6) Survivor tanggal tua: ada bulan dengan tgl 20–25 yang setiap harinya
    // pengeluaran < Rp20.000, dan keenam hari itu berada dalam rentang data.
    for (const mk of monthAgg.keys()) {
      const parts = mk.split('-').map(Number)
      const y = parts[0]
      const m = parts[1]
      if (!Number.isFinite(y) || !Number.isFinite(m)) continue
      let allOk = true
      for (let day = 20; day <= 25; day++) {
        const d = new Date(y, m, day)
        const ms = d.getTime()
        // Hari harus dalam rentang data aktual (>= awal data, < awal hari ini).
        if (ms < earliestMs || ms >= startOfTodayMs) { allOk = false; break }
        const exp = expenseByDay.get(dayKey(d)) ?? 0
        if (!(exp < SURVIVOR_THRESHOLD)) { allOk = false; break }
      }
      if (allOk) { flags.add(achKey('ach-survivor')); break }
    }

    return [...flags]
  } catch {
    // Totalitas: input ekstrem tidak boleh menjatuhkan boot/rollover.
    return []
  }
}
