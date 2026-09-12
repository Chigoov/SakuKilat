import type { Transaction } from './mock-data'

function rupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(n).replace(/\s+/g, ' ')
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isMoneyMove(t: Transaction): boolean {
  return t.kind === 'transfer' || t.kind === 'saving'
}

function monthBounds(ref: Date): { start: Date; end: Date } {
  return {
    start: new Date(ref.getFullYear(), ref.getMonth(), 1),
    end: new Date(ref.getFullYear(), ref.getMonth() + 1, 1),
  }
}

// -- Monthly totals (current calendar month) -----------------------------------
export function monthlyTotals(transactions: Transaction[], ref = new Date()) {
  const { start, end } = monthBounds(ref)
  const inMonth = transactions.filter(t => t.date >= start && t.date < end && !isMoneyMove(t))
  const income = inMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = inMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { income, expense, balance: income - expense }
}

export function rangeTotals(transactions: Transaction[], start: Date, end: Date) {
  let income = 0
  let expense = 0

  for (const transaction of transactions) {
    if (isMoneyMove(transaction) || transaction.date < start || transaction.date >= end) continue
    if (transaction.type === 'income') income += transaction.amount
    else expense += transaction.amount
  }

  return { income, expense, balance: income - expense }
}

// -- Category breakdown for the donut (expenses only, current month) ------------
export interface CategorySlice {
  category: string
  total: number
  pct: number
}
export function categoryBreakdown(
  transactions: Transaction[],
  ref = new Date(),
  type: 'expense' | 'income' = 'expense'
): CategorySlice[] {
  const { start, end } = monthBounds(ref)
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (isMoneyMove(t) || t.type !== type || t.date < start || t.date >= end) continue
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0)
  return Array.from(map.entries())
    .map(([category, val]) => ({ category, total: val, pct: total ? val / total : 0 }))
    .sort((a, b) => b.total - a.total)
}

export function rangeCategoryBreakdown(
  transactions: Transaction[],
  start: Date,
  end: Date,
  type: 'expense' | 'income' = 'expense'
): CategorySlice[] {
  const map = new Map<string, number>()
  for (const transaction of transactions) {
    if (
      isMoneyMove(transaction) ||
      transaction.type !== type ||
      transaction.date < start ||
      transaction.date >= end
    ) continue
    map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.amount)
  }

  const total = Array.from(map.values()).reduce((sum, value) => sum + value, 0)
  return Array.from(map.entries())
    .map(([category, value]) => ({
      category,
      total: value,
      pct: total > 0 ? value / total : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

// -- Perbandingan pengeluaran per kategori vs bulan sebelumnya --------------------
export interface CategoryComparison {
  category: string
  current: number // total bulan yang dipilih
  previous: number // total bulan sebelumnya
  avgPrev: number // rata-rata beberapa bulan sebelumnya
  deltaVsPrev: number | null // fraksi perubahan vs bulan lalu; null = kategori baru
}

/** Membandingkan total per kategori pada bulan `ref` dengan bulan sebelumnya
 *  dan rata-rata `prevMonths` bulan terakhir. Dipakai di Rekapan untuk melihat
 *  kategori mana yang naik/turun dibanding bulan-bulan sebelumnya. */
export function categoryMonthlyComparison(
  transactions: Transaction[],
  ref = new Date(),
  type: 'expense' | 'income' = 'expense',
  prevMonths = 3,
): CategoryComparison[] {
  const curStart = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const curEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
  const prevStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
  const histStart = new Date(ref.getFullYear(), ref.getMonth() - prevMonths, 1)

  const cur = new Map<string, number>()
  const prev = new Map<string, number>()
  const hist = new Map<string, number>()

  for (const t of transactions) {
    if (isMoneyMove(t) || t.type !== type) continue
    if (t.date >= curStart && t.date < curEnd) cur.set(t.category, (cur.get(t.category) ?? 0) + t.amount)
    if (t.date >= prevStart && t.date < curStart) prev.set(t.category, (prev.get(t.category) ?? 0) + t.amount)
    if (t.date >= histStart && t.date < curStart) hist.set(t.category, (hist.get(t.category) ?? 0) + t.amount)
  }

  const categories = new Set<string>([...cur.keys(), ...prev.keys()])
  const rows: CategoryComparison[] = []
  for (const category of categories) {
    const current = cur.get(category) ?? 0
    const previous = prev.get(category) ?? 0
    const avgPrev = (hist.get(category) ?? 0) / prevMonths
    const deltaVsPrev = previous > 0 ? (current - previous) / previous : (current > 0 ? null : 0)
    rows.push({ category, current, previous, avgPrev, deltaVsPrev })
  }
  return rows.sort((a, b) => b.current - a.current)
}

// -- Per-day aggregates for the calendar heatmap --------------------------------
export interface DayAgg {
  expense: number
  income: number
  count: number
}
export function dailyAggregates(transactions: Transaction[]): Map<string, DayAgg> {
  const map = new Map<string, DayAgg>()
  for (const t of transactions) {
    const key = dayKey(t.date)
    const cur = map.get(key) ?? { expense: 0, income: 0, count: 0 }
    if (!isMoneyMove(t)) {
      if (t.type === 'expense') cur.expense += t.amount
      else cur.income += t.amount
    }
    cur.count += 1
    map.set(key, cur)
  }
  return map
}

export function transactionsForDay(transactions: Transaction[], key: string): Transaction[] {
  return transactions
    .filter(t => dayKey(t.date) === key)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

export function transactionsForRange(
  transactions: Transaction[],
  start: Date,
  end: Date,
  filters?: {
    type?: 'expense' | 'income'
    category?: string
    includeMoneyMoves?: boolean
  },
): Transaction[] {
  const includeMoneyMoves = filters?.includeMoneyMoves === true
  return transactions
    .filter((transaction) => {
      if (!includeMoneyMoves && isMoneyMove(transaction)) return false
      if (transaction.date < start || transaction.date >= end) return false
      if (filters?.type && transaction.type !== filters.type) return false
      if (filters?.category && transaction.category !== filters.category) return false
      return true
    })
    .sort((left, right) => right.date.getTime() - left.date.getTime())
}

export interface SubcategorySlice {
  label: string
  total: number
  count: number
}

export function subcategoryBreakdownForRange(
  transactions: Transaction[],
  start: Date,
  end: Date,
  category: string,
  type: 'expense' | 'income' = 'expense',
): SubcategorySlice[] {
  const bucket = new Map<string, SubcategorySlice>()
  for (const transaction of transactions) {
    if (
      isMoneyMove(transaction) ||
      transaction.type !== type ||
      transaction.category !== category ||
      transaction.date < start ||
      transaction.date >= end
    ) continue

    const label = transaction.subcategory?.trim() || 'Tanpa sub'
    const current = bucket.get(label) ?? { label, total: 0, count: 0 }
    current.total += transaction.amount
    current.count += 1
    bucket.set(label, current)
  }

  return Array.from(bucket.values()).sort((left, right) => right.total - left.total)
}

// -- Trend series for charts ----------------------------------------------------
export type TrendRange = '7d' | '30d' | '1y'

export interface TrendPoint {
  label: string
  expense: number
  income: number
}

const MS_DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function trendSeriesForPeriod(transactions: Transaction[], start: Date, end: Date): TrendPoint[] {
  const from = startOfDay(start)
  const until = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
  if (until <= from) return []

  const days = Math.ceil((until.getTime() - from.getTime()) / MS_DAY)
  const groupMonthly = days > 62
  const formatter = groupMonthly
    ? new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' })
    : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
  const keyedPoints: Array<TrendPoint & { key: string }> = []

  if (groupMonthly) {
    for (
      let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      cursor < until;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      keyedPoints.push({ key: monthKey(cursor), label: formatter.format(cursor), expense: 0, income: 0 })
    }
  } else {
    for (let i = 0; i < days; i++) {
      const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
      keyedPoints.push({ key: dayKey(cursor), label: formatter.format(cursor), expense: 0, income: 0 })
    }
  }

  const pointByKey = new Map(keyedPoints.map(point => [point.key, point]))
  for (const t of transactions) {
    if (isMoneyMove(t) || t.date < from || t.date >= until) continue
    const point = pointByKey.get(groupMonthly ? monthKey(t.date) : dayKey(t.date))
    if (!point) continue
    if (t.type === 'expense') point.expense += t.amount
    else point.income += t.amount
  }

  return keyedPoints.map(({ key, ...point }) => point)
}

export function trendSeries(transactions: Transaction[], range: TrendRange): TrendPoint[] {
  const now = new Date()

  if (range === '1y') {
    // 12 months
    const points: TrendPoint[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const label = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d)
      let expense = 0, income = 0
      for (const t of transactions) {
        if (!isMoneyMove(t) && t.date >= d && t.date < next) {
          if (t.type === 'expense') expense += t.amount
          else income += t.amount
        }
      }
      points.push({ label, expense, income })
    }
    return points
  }

  const days = range === '7d' ? 7 : 30
  const points: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = dayKey(d)
    const label =
      range === '7d'
        ? new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(d)
        : new Intl.DateTimeFormat('id-ID', { day: 'numeric' }).format(d)
    let expense = 0, income = 0
    for (const t of transactions) {
      if (!isMoneyMove(t) && dayKey(t.date) === key) {
        if (t.type === 'expense') expense += t.amount
        else income += t.amount
      }
    }
    points.push({ label, expense, income })
  }
  return points
}

// -- Supportive insight: which category improved most week-over-week ------------
export function topSavedCategory(transactions: Transaction[]): string | null {
  const now = new Date()
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13)

  const sumByCat = (from: Date, to: Date) => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (isMoneyMove(t) || t.type !== 'expense') continue
      if (t.date >= from && t.date < to) m.set(t.category, (m.get(t.category) ?? 0) + t.amount)
    }
    return m
  }

  const thisWeek = sumByCat(weekStart, new Date(now.getTime() + 86_400_000))
  const prevWeek = sumByCat(prevStart, weekStart)

  let best: string | null = null
  let bestDrop = 0
  for (const [cat, prev] of prevWeek.entries()) {
    const cur = thisWeek.get(cat) ?? 0
    const drop = prev - cur
    if (drop > bestDrop) {
      bestDrop = drop
      best = cat
    }
  }
  return best
}

export interface BudgetStatus {
  budget: number
  spent: number
  remaining: number
  daysInMonth: number
  dayOfMonth: number
  /** Sisa hari SETELAH hari ini (tidak menghitung hari ini). Untuk display "Sisa X hari lagi". */
  remainingDays: number
  /** Sisa hari termasuk hari ini (dipakai untuk pembagi jatah, karena hari ini masih berjalan). */
  remainingDaysInclusive: number
  weekOfMonth: number
  totalWeeks: number
  weekStartDay: number
  weekEndDay: number
  /** Sisa hari di minggu berjalan (termasuk hari ini). Pembagi jatah harian. */
  remainingWeekDays: number
  /** Alokasi datar: budget dibagi rata jumlah hari sebulan (referensi awal). */
  baseDailyBudget: number
  /** Alokasi datar: budget dibagi rata jumlah minggu (referensi awal). */
  baseWeeklyBudget: number
  /** Jatah mingguan HIDUP untuk minggu berjalan, di-recompute dari sisa budget bulan
   *  dibagi jumlah minggu yang tersisa (termasuk minggu berjalan). */
  dynamicWeeklyBudget: number
  /** Jatah harian HIDUP untuk hari ini, dihitung dari sisa jatah minggu berjalan
   *  dibagi hari tersisa di minggu itu (termasuk hari ini). */
  dynamicDailyBudget: number
  /** Batas awal jatah harian SEBELUM pengeluaran hari ini dihitung.
   *  Rumusnya: (dynamicWeeklyBudget - pengeluaran_di_minggu_ini_KECUALI_hari_ini) / sisa_hari_minggu.
   *  Field ini yang dipakai untuk menentukan `todayOverBase` -- supaya hari ini tidak
   *  dianggap "boros" karena rumus dibagi sebelum hari ini sendiri berjalan.
   *  Kalau nilainya = X dan hari ini keluar <= X -> masih aman. */
  todayBudgetLimit: number
  /** Total pengeluaran di minggu-minggu SEBELUM minggu berjalan (data historis mingguan). */
  spentBeforeThisWeek: number
  weeklySpent: number
  weeklyRemaining: number
  todayExpense: number
  todayOverBase: boolean
  weekOverBase: boolean
  pctUsed: number
  pctWeekUsed: number
  roast: string | null
}

const BUDGET_ROASTS = [
  'Budget bulan ini sudah wafat. Dompetmu minta cuti dulu.',
  'Keuanganmu barusan melakukan parkour tanpa helm.',
  'Sisa bulan masih panjang, tapi budget sudah pulang duluan.',
  'Ini bukan bocor halus lagi, ini keran finansial kebuka penuh.',
]

/**
 * Status budget bulan berjalan dengan logika HIERARKIS DINAMIS.
 *
 * Hierarki: budget_bulan -> jatah_mingguan (dinamis) -> jatah_harian (dinamis).
 *
 * ------------------------------------------------------------
 *  1. `dynamicWeeklyBudget` (jatah minggu berjalan)
 *     = (budget_bulan - pengeluaran_di_minggu_sebelumnya) / minggu_yang_tersisa
 *     Jadi kalau minggu 1-2 sudah boros, jatah minggu 3-4 otomatis mengecil.
 *
 *  2. `dynamicDailyBudget` (jatah hari ini)
 *     = (dynamicWeeklyBudget - pengeluaran_minggu_ini) / sisa_hari_minggu_ini
 *     Jadi patokan HARIAN mengikuti sisa jatah MINGGUAN, bukan bulanan langsung.
 *     Kalau di minggu ini sudah kelewat batas, jatah harian sisa hari di minggu
 *     itu di-clamp ke 0 (dan warning aktif).
 *
 *  Kalau angka jadi negatif (defisit), di-clamp ke 0 supaya UI tidak nampilkan
 *  angka aneh. Minggu berikutnya nanti otomatis re-compute dari sisa budget
 *  yang tersisa (bisa nol kalau sudah kelewat bulanan).
 * ------------------------------------------------------------
 */
export function monthlyBudgetStatus(
  transactions: Transaction[],
  budget: number,
  ref = new Date()
): BudgetStatus {
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const dayOfMonth = ref.getDate()
  // "Sisa hari lagi" untuk display = tidak menghitung hari ini
  // (biar `dayOfMonth + remainingDays === daysInMonth`, tidak lagi = daysInMonth + 1)
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth)
  // Sisa hari INKLUSIF (untuk pembagian jatah, karena hari ini masih berjalan)
  const remainingDaysInclusive = Math.max(1, daysInMonth - dayOfMonth + 1)

  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const tomorrow = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
  const todayKey = dayKey(ref)
  const totalWeeks = 4
  const weekOfMonth = Math.min(totalWeeks, Math.floor((dayOfMonth - 1) / 7) + 1)
  const weekStartDay = (weekOfMonth - 1) * 7 + 1
  const weekEndDay = weekOfMonth === totalWeeks ? daysInMonth : Math.min(daysInMonth, weekStartDay + 6)
  const weekStart = new Date(ref.getFullYear(), ref.getMonth(), weekStartDay)
  const weekEndExclusive = new Date(ref.getFullYear(), ref.getMonth(), weekEndDay + 1)
  const remainingWeekDays = Math.max(1, weekEndDay - dayOfMonth + 1)

  let spent = 0
  let weeklySpent = 0
  let spentBeforeThisWeek = 0
  let todayExpense = 0

  for (const t of transactions) {
    if (isMoneyMove(t) || t.type !== 'expense' || t.date < start || t.date >= tomorrow) continue
    spent += t.amount
    if (t.date >= weekStart && t.date < weekEndExclusive) {
      weeklySpent += t.amount
    } else if (t.date < weekStart) {
      // Minggu-minggu sebelumnya (sudah selesai)
      spentBeforeThisWeek += t.amount
    }
    if (dayKey(t.date) === todayKey) todayExpense += t.amount
  }

  const safeBudget = Math.max(0, budget)
  const remaining = safeBudget - spent
  const baseDailyBudget = safeBudget / daysInMonth
  const baseWeeklyBudget = safeBudget / totalWeeks

  // -- HIERARCHICAL DYNAMIC BUDGETS --------------------------------
  // Jatah mingguan HIDUP = sisa budget bulan (setelah pengeluaran di minggu-minggu
  // yang sudah selesai) / minggu yang tersisa (termasuk minggu berjalan).
  const weeksRemaining = Math.max(1, totalWeeks - weekOfMonth + 1)
  const dynamicWeeklyBudget = Math.max(0, (safeBudget - spentBeforeThisWeek) / weeksRemaining)

  // [!]  Dua konsep yang HARUS dipisahkan:
  //
  //  A. `todayBudgetLimit` -- BATAS AWAL hari ini SEBELUM pengeluaran hari ini
  //     dihitung. Ini adalah "kuota hari ini" saat kamu bangun tidur.
  //     Formula: (sisa jatah minggu YANG TERPAKAI SEBELUM HARI INI) / hari-tersisa-minggu.
  //     Field ini yang benar untuk membandingkan `todayExpense > limit` -> over-base.
  //     Kalau kita pakai `dynamicDailyBudget` (sudah dikurangi todayExpense sendiri),
  //     hari ini bisa dianggap over terlalu cepat.
  //
  //  B. `dynamicDailyBudget` -- SISA jatah harian setelah pengeluaran hari ini.
  //     Ini "batas aman kamu ke depan sampai minggu ini selesai".
  //     Dipakai untuk display info hint, BUKAN untuk cek over-base.
  const spentEarlierThisWeek = weeklySpent - todayExpense
  const todayBudgetLimit = Math.max(
    0,
    (dynamicWeeklyBudget - spentEarlierThisWeek) / remainingWeekDays
  )

  // Jatah harian HIDUP = sisa jatah mingguan (setelah pengeluaran minggu ini) /
  // sisa hari di minggu ini (termasuk hari ini).
  const weeklyRemainingDynamic = dynamicWeeklyBudget - weeklySpent
  const dynamicDailyBudget = Math.max(0, weeklyRemainingDynamic / remainingWeekDays)

  // Untuk backward compat + display: weeklyRemaining pakai baseline mingguan yang
  // di-recompute dinamis juga (bukan `baseWeeklyBudget` mati).
  const weeklyRemaining = weeklyRemainingDynamic

  const overBudget = spent > safeBudget && safeBudget > 0
  const roastIndex = safeBudget > 0 ? Math.min(BUDGET_ROASTS.length - 1, Math.floor((spent / safeBudget - 1) * 4)) : 0

  return {
    budget: safeBudget,
    spent,
    remaining,
    daysInMonth,
    dayOfMonth,
    remainingDays,
    remainingDaysInclusive,
    weekOfMonth,
    totalWeeks,
    weekStartDay,
    weekEndDay,
    remainingWeekDays,
    baseDailyBudget,
    baseWeeklyBudget,
    dynamicWeeklyBudget,
    dynamicDailyBudget,
    todayBudgetLimit,
    spentBeforeThisWeek,
    weeklySpent,
    weeklyRemaining,
    todayExpense,
    // Patokan "kelewat harian" pakai BATAS AWAL hari ini (todayBudgetLimit),
    // BUKAN dynamicDailyBudget yang sudah dikurangi pengeluaran hari ini sendiri.
    // Kalau pakai dynamicDailyBudget, hari ini bisa auto-flag "boros" begitu ada
    // pengeluaran, padahal masih di bawah batas awal harian.
    todayOverBase: todayExpense > todayBudgetLimit && safeBudget > 0,
    // Patokan "kelewat mingguan" pakai jatah mingguan HIDUP
    weekOverBase: weeklySpent > dynamicWeeklyBudget && safeBudget > 0,
    pctUsed: safeBudget > 0 ? spent / safeBudget : 0,
    pctWeekUsed: dynamicWeeklyBudget > 0 ? weeklySpent / dynamicWeeklyBudget : 0,
    roast: overBudget ? BUDGET_ROASTS[roastIndex] : null,
  }
}

// -- Streak & "Nyawa" (Duolingo-style) -----------------------------------------
export interface StreakStatus {
  /** Hari beruntun mencatat, dihitung mundur dari hari ini (atau kemarin). */
  current: number
  /** Rekor streak terpanjang sepanjang sejarah transaksi. */
  longest: number
  /** Total hari unik user pernah mencatat transaksi. */
  totalDaysLogged: number
  /** Nyawa tersisa (0-5). Berkurang sesuai hari absen beruntun terbaru. */
  lives: number
  /** Jumlah nyawa maksimum. */
  maxLives: number
  /** True jika hari ini sudah mencatat. */
  loggedToday: boolean
}

const MAX_LIVES = 5

function startOfLocalDay(date: Date, offset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

/**
 * Hitung status streak & nyawa dari daftar transaksi.
 *
 * Aturan nyawa (toleran, biar user tidak kapok):
 *  - Mulai 5 nyawa penuh.
 *  - Streak dihitung dari hari ini; kalau hari ini belum catat tapi kemarin
 *    catat, streak masih dianggap hidup (hari ini belum "hangus").
 *  - Setiap hari absen beruntun TERAKHIR (gap sejak catatan terakhir) memecah
 *    satu nyawa. Lewat 5 hari absen -> semua nyawa pecah (streak benar-benar 0).
 */
export function streakStatus(transactions: Transaction[], ref = new Date()): StreakStatus {
  const dayKeys = new Set(transactions.map(t => dayKey(t.date)))
  const today = startOfLocalDay(ref)
  const todayKey = dayKey(today)
  const loggedToday = dayKeys.has(todayKey)

  // Hitung streak beruntun: mulai dari hari ini (kalau sudah catat) atau
  // kemarin (kalau hari ini belum, tapi streak belum dianggap putus).
  let anchorOffset = loggedToday ? 0 : (dayKeys.has(dayKey(startOfLocalDay(ref, -1))) ? -1 : null)
  let current = 0
  if (anchorOffset !== null) {
    for (let offset = anchorOffset; offset > anchorOffset - 400; offset--) {
      if (dayKeys.has(dayKey(startOfLocalDay(ref, offset)))) current += 1
      else break
    }
  }

  // Hari absen beruntun sejak catatan terakhir -> menentukan nyawa yang pecah.
  // User baru (belum pernah catat) mulai dengan nyawa penuh, bukan 0.
  let daysSinceLast = 0
  if (dayKeys.size === 0) {
    daysSinceLast = 0
  } else if (!loggedToday) {
    for (let offset = -1; offset > -400; offset--) {
      if (dayKeys.has(dayKey(startOfLocalDay(ref, offset)))) break
      daysSinceLast += 1
    }
  }
  const lives = Math.max(0, MAX_LIVES - daysSinceLast)

  // Rekor terpanjang & total hari unik.
  const sortedKeys = Array.from(dayKeys).sort()
  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const key of sortedKeys) {
    const [y, m, d] = key.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    if (prev && (cur.getTime() - prev.getTime()) === 86_400_000) {
      run += 1
    } else {
      run = 1
    }
    if (run > longest) longest = run
    prev = cur
  }

  return {
    current,
    longest: Math.max(longest, current),
    totalDaysLogged: dayKeys.size,
    lives,
    maxLives: MAX_LIVES,
    loggedToday,
  }
}

// -- Analisis Keuangan Mingguan & Bulanan --------------------------------------
export interface PeriodInsight {
  scope: 'minggu' | 'bulan'
  label: string
  income: number
  expense: number
  net: number
  avgPerDay: number
  txCount: number
  topCategory: { category: string; total: number; pct: number } | null
  busiestDay: { key: string; total: number } | null
  /** Perubahan pengeluaran vs periode sebelumnya, dalam persen (null jika tak ada data lalu). */
  deltaPct: number | null
  /** Kalimat insight ramah untuk ditampilkan. */
  takeaways: string[]
}

function rangeExpenseIncome(transactions: Transaction[], start: Date, end: Date) {
  let income = 0, expense = 0, count = 0
  const byCat = new Map<string, number>()
  const byDay = new Map<string, number>()
  for (const t of transactions) {
    if (isMoneyMove(t) || t.date < start || t.date >= end) continue
    count += 1
    if (t.type === 'income') income += t.amount
    else {
      expense += t.amount
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount)
      const dk = dayKey(t.date)
      byDay.set(dk, (byDay.get(dk) ?? 0) + t.amount)
    }
  }
  return { income, expense, count, byCat, byDay }
}

/**
 * Analisis satu periode (minggu/bulan berjalan) + perbandingan ke periode lalu,
 * lalu rangkai jadi kalimat insight yang mudah dipahami.
 */
export function periodInsight(
  transactions: Transaction[],
  scope: 'minggu' | 'bulan',
  ref = new Date(),
): PeriodInsight {
  let curStart: Date, curEnd: Date, prevStart: Date, prevEnd: Date, spanDays: number, label: string

  if (scope === 'minggu') {
    const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
    curStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
    curEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    prevStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)
    prevEnd = curStart
    spanDays = 7
    label = '7 hari terakhir'
  } else {
    curStart = new Date(ref.getFullYear(), ref.getMonth(), 1)
    curEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    prevStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    prevEnd = curStart
    spanDays = Math.max(1, ref.getDate())
    label = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(ref)
  }

  const cur = rangeExpenseIncome(transactions, curStart, curEnd)
  const prev = rangeExpenseIncome(transactions, prevStart, prevEnd)

  const expenseTotal = cur.expense
  const catEntries = [...cur.byCat.entries()].sort((a, b) => b[1] - a[1])
  const topCategory = catEntries.length > 0
    ? { category: catEntries[0][0], total: catEntries[0][1], pct: expenseTotal > 0 ? catEntries[0][1] / expenseTotal : 0 }
    : null
  const dayEntries = [...cur.byDay.entries()].sort((a, b) => b[1] - a[1])
  const busiestDay = dayEntries.length > 0 ? { key: dayEntries[0][0], total: dayEntries[0][1] } : null
  const deltaPct = prev.expense > 0 ? Math.round(((cur.expense - prev.expense) / prev.expense) * 100) : null
  const avgPerDay = Math.round(cur.expense / spanDays)

  const takeaways: string[] = []
  if (cur.count === 0) {
    takeaways.push(`Belum ada transaksi di ${scope} ini. Mulai catat untuk lihat analisisnya.`)
  } else {
    if (deltaPct !== null) {
      if (deltaPct < 0) takeaways.push(`Pengeluaran turun ${Math.abs(deltaPct)}% dibanding ${scope} lalu. Mantap, lebih hemat!`)
      else if (deltaPct > 0) takeaways.push(`Pengeluaran naik ${deltaPct}% dibanding ${scope} lalu. Cek lagi pos yang membengkak.`)
      else takeaways.push(`Pengeluaran setara dengan ${scope} lalu. Stabil.`)
    }
    takeaways.push(`Rata-rata pengeluaran ${rupiah(avgPerDay)} per hari.`)
    if (cur.income > 0) {
      takeaways.push(cur.income - cur.expense >= 0
        ? `Surplus ${rupiah(cur.income - cur.expense)} -- pemasukan menutup pengeluaran.`
        : `Defisit ${rupiah(cur.expense - cur.income)} -- pengeluaran melebihi pemasukan.`)
    }
  }

  return {
    scope, label,
    income: cur.income, expense: cur.expense, net: cur.income - cur.expense,
    avgPerDay, txCount: cur.count, topCategory, busiestDay, deltaPct, takeaways,
  }
}

// -- Filter universal untuk riwayat transaksi -----------------------------------
export interface TransactionFilter {
  /** Tanggal mulai (inklusif). */
  startDate?: Date
  /** Tanggal akhir (eksklusif). */
  endDate?: Date
  /** 'expense' atau 'income'. */
  type?: 'expense' | 'income'
  /** Category id (exact match). */
  category?: string
  /** Nominal minimum. */
  amountMin?: number
  /** Nominal maksimum. */
  amountMax?: number
  /** Kata kunci pencarian — match ke description, subcategory, atau note. */
  keyword?: string
  /** Jika true, termasuk transfer/saving; default false. */
  includeMoneyMoves?: boolean
}

export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter,
): Transaction[] {
  const keywordLower = filter.keyword?.trim().toLowerCase() || ''

  return transactions.filter((t) => {
    if (!filter.includeMoneyMoves && isMoneyMove(t)) return false
    if (filter.startDate && t.date < filter.startDate) return false
    if (filter.endDate && t.date >= filter.endDate) return false
    if (filter.type && t.type !== filter.type) return false
    if (filter.category && t.category !== filter.category) return false
    if (filter.amountMin != null && t.amount < filter.amountMin) return false
    if (filter.amountMax != null && t.amount > filter.amountMax) return false
    if (keywordLower) {
      const haystack = [
        t.description,
        t.subcategory ?? '',
        t.note ?? '',
        t.category,
        t.paymentMethod ?? '',
        String(t.amount),
      ].join(' ').toLowerCase()
      if (!haystack.includes(keywordLower)) return false
    }
    return true
  }).sort((a, b) => b.date.getTime() - a.date.getTime())
}

// -- Ringkasan Cashflow Pintar --------------------------------------------------
export interface CashflowSummary {
  /** Periode label. */
  periodLabel: string
  income: number
  expense: number
  net: number
  /** Rata-rata pengeluaran per hari sejauh ini bulan ini. */
  avgDailyExpense: number
  /** Estimasi pengeluaran akhir bulan berdasarkan burn rate saat ini. */
  projectedMonthExpense: number
  /** Estimasi saldo bersih akhir bulan. */
  projectedMonthNet: number
  /** Rasio tabungan = (income - expense) / income; null jika income = 0. */
  savingsRatio: number | null
  /** Burn rate = expense / income; null jika income = 0. */
  burnRate: number | null
  /** Jumlah hari yang sudah terlewat di bulan ini. */
  daysElapsed: number
  /** Total hari di bulan ini. */
  daysInMonth: number
  /** Peringatan teks (null jika aman). */
  warnings: string[]
}

export function cashflowSummary(
  transactions: Transaction[],
  ref = new Date(),
): CashflowSummary {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const daysElapsed = Math.max(1, ref.getDate())
  const periodLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(ref)

  let income = 0
  let expense = 0

  for (const t of transactions) {
    if (isMoneyMove(t) || t.date < start || t.date >= end) continue
    if (t.type === 'income') income += t.amount
    else expense += t.amount
  }

  const net = income - expense
  const avgDailyExpense = expense / daysElapsed
  const projectedMonthExpense = Math.round(avgDailyExpense * daysInMonth)
  const projectedMonthNet = income - projectedMonthExpense
  const savingsRatio = income > 0 ? (income - expense) / income : null
  const burnRate = income > 0 ? expense / income : null

  const warnings: string[] = []
  if (burnRate !== null && burnRate > 1) {
    warnings.push(`Pengeluaran sudah melebihi pemasukan (${Math.round(burnRate * 100)}%).`)
  }
  if (projectedMonthNet < 0 && income > 0) {
    warnings.push(`Estimasi akhir bulan defisit ${rupiah(Math.abs(projectedMonthNet))}.`)
  }
  if (savingsRatio !== null && savingsRatio < 0.1 && savingsRatio >= 0) {
    warnings.push('Rasio tabungan rendah (< 10%). Coba kurangi pengeluaran non-esensial.')
  }
  if (daysElapsed <= 10 && expense > income * 0.5 && income > 0) {
    warnings.push('Baru 10 hari tapi sudah keluar > 50% pemasukan. Hati-hati boros!')
  }

  return {
    periodLabel,
    income,
    expense,
    net,
    avgDailyExpense,
    projectedMonthExpense,
    projectedMonthNet,
    savingsRatio,
    burnRate,
    daysElapsed,
    daysInMonth,
    warnings,
  }
}

// -- Insight Otomatis Sederhana -------------------------------------------------
export interface AutoInsight {
  emoji: string
  text: string
  type: 'positive' | 'negative' | 'neutral'
}

export function generateInsights(
  transactions: Transaction[],
  ref = new Date(),
): AutoInsight[] {
  const insights: AutoInsight[] = []
  const cf = cashflowSummary(transactions, ref)

  // 1. Surplus / Defisit bulan ini
  if (cf.income > 0 && cf.net > 0) {
    insights.push({
      emoji: '💰',
      text: `Surplus ${rupiah(cf.net)} bulan ini. Pertahankan!`,
      type: 'positive',
    })
  } else if (cf.income > 0 && cf.net < 0) {
    insights.push({
      emoji: '🔴',
      text: `Defisit ${rupiah(Math.abs(cf.net))}. Pengeluaran melebihi pemasukan.`,
      type: 'negative',
    })
  }

  // 2. Rasio tabungan
  if (cf.savingsRatio !== null && cf.savingsRatio >= 0.2) {
    insights.push({
      emoji: '🎯',
      text: `Rasio tabungan ${Math.round(cf.savingsRatio * 100)}%. Bagus, di atas 20%!`,
      type: 'positive',
    })
  }

  // 3. Proyeksi akhir bulan
  if (cf.income > 0 && cf.projectedMonthNet < 0 && cf.daysElapsed <= 20) {
    insights.push({
      emoji: '⚠️',
      text: `Jika terus begini, estimasi akhir bulan defisit ${rupiah(Math.abs(cf.projectedMonthNet))}.`,
      type: 'negative',
    })
  }

  // 4. Kategori terbesar bulan ini
  const topCat = categoryBreakdown(transactions, ref, 'expense')
  if (topCat.length > 0 && topCat[0].pct > 0.35) {
    insights.push({
      emoji: '📊',
      text: `${Math.round(topCat[0].pct * 100)}% pengeluaran ke satu kategori. Cek apakah bisa ditekan.`,
      type: 'neutral',
    })
  }

  // 5. Perbandingan dengan bulan lalu
  const prevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
  const prevEnd = new Date(ref.getFullYear(), ref.getMonth(), 1)
  let prevExpense = 0
  for (const t of transactions) {
    if (isMoneyMove(t) || t.type !== 'expense' || t.date < prevMonth || t.date >= prevEnd) continue
    prevExpense += t.amount
  }
  if (prevExpense > 0) {
    const pctChange = Math.round(((cf.expense - prevExpense) / prevExpense) * 100)
    if (pctChange < -10) {
      insights.push({
        emoji: '📉',
        text: `Pengeluaran turun ${Math.abs(pctChange)}% dari bulan lalu. Mantap!`,
        type: 'positive',
      })
    } else if (pctChange > 20) {
      insights.push({
        emoji: '📈',
        text: `Pengeluaran naik ${pctChange}% dari bulan lalu. Pantau terus.`,
        type: 'negative',
      })
    }
  }

  // 6. Hari tanpa transaksi (streak miss)
  const todayStr = dayKey(ref)
  const yesterdayStr = dayKey(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 1))
  const dayBefore = dayKey(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 2))
  const txDays = new Set(transactions.map(t => dayKey(t.date)))
  if (txDays.has(todayStr)) {
    insights.push({
      emoji: '✅',
      text: 'Sudah mencatat hari ini. Konsistensi adalah kunci!',
      type: 'positive',
    })
  } else if (!txDays.has(todayStr) && !txDays.has(yesterdayStr) && !txDays.has(dayBefore)) {
    insights.push({
      emoji: '🔔',
      text: 'Sudah 2+ hari belum catat. Yuk jangan lupa!',
      type: 'neutral',
    })
  }

  return insights.slice(0, 4) // Maksimal 4 insight
}

// -- Perbandingan Kategori Tahunan -----------------------------------------------
export interface CategoryYearlyComparisonRow {
  category: string
  total: number
  pct: number
  prevYearTotal: number
  changeAmount: number
  changePct: number | null
}

export function categoryYearlyComparison(
  transactions: Transaction[],
  year: number,
  type: 'expense' | 'income' = 'expense',
): CategoryYearlyComparisonRow[] {
  const curStart = new Date(year, 0, 1)
  const curEnd = new Date(year + 1, 0, 1)
  const prevStart = new Date(year - 1, 0, 1)
  const prevEnd = curStart

  const cur = new Map<string, number>()
  const prev = new Map<string, number>()

  for (const t of transactions) {
    if (isMoneyMove(t) || t.type !== type) continue
    if (t.date >= curStart && t.date < curEnd) {
      cur.set(t.category, (cur.get(t.category) ?? 0) + t.amount)
    }
    if (t.date >= prevStart && t.date < prevEnd) {
      prev.set(t.category, (prev.get(t.category) ?? 0) + t.amount)
    }
  }

  const grandTotal = Array.from(cur.values()).reduce((s, v) => s + v, 0)
  const categories = new Set([...cur.keys(), ...prev.keys()])
  const rows: CategoryYearlyComparisonRow[] = []

  for (const category of categories) {
    const total = cur.get(category) ?? 0
    const prevTotal = prev.get(category) ?? 0
    const changeAmount = total - prevTotal
    const changePct = prevTotal > 0 ? (changeAmount / prevTotal) : (total > 0 ? null : 0)
    rows.push({
      category,
      total,
      pct: grandTotal > 0 ? total / grandTotal : 0,
      prevYearTotal: prevTotal,
      changeAmount,
      changePct,
    })
  }

  return rows.sort((a, b) => b.total - a.total)
}
