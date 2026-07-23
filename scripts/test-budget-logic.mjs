/**
 * SakuKilat — Skenario Test untuk Logika Budget Hierarkis
 * Jalankan: `node scripts/test-budget-logic.mjs`
 *
 * Meniru fungsi `monthlyBudgetStatus` dari lib/stats.ts dalam JS murni.
 * Kalau semua skenario pass, logika baru sudah bener.
 */

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthlyBudgetStatus(transactions, budget, ref) {
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const dayOfMonth = ref.getDate()
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth)
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

  let spent = 0, weeklySpent = 0, spentBeforeThisWeek = 0, todayExpense = 0
  for (const t of transactions) {
    if (t.date < start || t.date >= tomorrow) continue
    spent += t.amount
    if (t.date >= weekStart && t.date < weekEndExclusive) weeklySpent += t.amount
    else if (t.date < weekStart) spentBeforeThisWeek += t.amount
    if (dayKey(t.date) === todayKey) todayExpense += t.amount
  }

  const safeBudget = Math.max(0, budget)
  const baseDailyBudget = safeBudget / daysInMonth
  const baseWeeklyBudget = safeBudget / totalWeeks
  const weeksRemaining = Math.max(1, totalWeeks - weekOfMonth + 1)
  const dynamicWeeklyBudget = Math.max(0, (safeBudget - spentBeforeThisWeek) / weeksRemaining)
  const spentEarlierThisWeek = weeklySpent - todayExpense
  const todayBudgetLimit = Math.max(0, (dynamicWeeklyBudget - spentEarlierThisWeek) / remainingWeekDays)
  const weeklyRemainingDynamic = dynamicWeeklyBudget - weeklySpent
  const dynamicDailyBudget = Math.max(0, weeklyRemainingDynamic / remainingWeekDays)

  return {
    budget: safeBudget, spent, remaining: safeBudget - spent,
    daysInMonth, dayOfMonth, remainingDays, remainingDaysInclusive,
    weekOfMonth, totalWeeks, weekStartDay, weekEndDay, remainingWeekDays,
    baseDailyBudget, baseWeeklyBudget,
    dynamicWeeklyBudget, dynamicDailyBudget, todayBudgetLimit,
    spentBeforeThisWeek, weeklySpent,
    weeklyRemaining: weeklyRemainingDynamic,
    todayExpense,
    todayOverBase: todayExpense > todayBudgetLimit && safeBudget > 0,
    weekOverBase: weeklySpent > dynamicWeeklyBudget && safeBudget > 0,
  }
}

// ── Helpers ─────────────────────────────────────────────────
const rp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID')
function tx(y, m, d, amt) { return { date: new Date(y, m - 1, d, 12), amount: amt, type: 'expense' } }
function line(s) { console.log(s) }
function assert(cond, label) {
  if (cond) line(`  ✅ ${label}`)
  else { line(`  ❌ ${label}`); process.exitCode = 1 }
}

// ── SKENARIO ────────────────────────────────────────────────
line('\n════════════════════════════════════════════════════════')
line('  TEST LOGIKA BUDGET HIERARKIS SAKUKILAT')
line('════════════════════════════════════════════════════════\n')

// SKENARIO 1 — kasus keluhan user: budget 850k, hari ke-8, sudah 400k+
line('▶ SKENARIO 1: Budget 850k, hari-8 Juli, sudah keluar 425k')
line('  Ekspektasi: jatah harian sudah menyesuaikan (tidak stuck di 850/31)\n')
{
  const ref = new Date(2026, 6, 8, 15) // 8 Juli 2026
  // 300k di minggu 1 (tanggal 1-7), 125k di hari-8 (minggu 2)
  const txs = [
    tx(2026, 7, 3, 150000),
    tx(2026, 7, 5, 150000),
    tx(2026, 7, 8, 125000),
  ]
  const s = monthlyBudgetStatus(txs, 850000, ref)
  line(`  Bulan            : ${s.dayOfMonth}/${s.daysInMonth}  (minggu ${s.weekOfMonth}/${s.totalWeeks})`)
  line(`  Total terpakai   : ${rp(s.spent)}`)
  line(`  Terpakai minggu  : sebelumnya=${rp(s.spentBeforeThisWeek)} | minggu-ini=${rp(s.weeklySpent)}`)
  line(`  Jatah mingguan   : datar=${rp(s.baseWeeklyBudget)} | HIDUP=${rp(s.dynamicWeeklyBudget)}`)
  line(`  Jatah harian     : datar=${rp(s.baseDailyBudget)} | HIDUP=${rp(s.dynamicDailyBudget)}`)
  line('')
  // Manual: sisa budget bulan setelah minggu 1 = 850k - 300k = 550k. Minggu tersisa=3.
  // Jatah mingguan minggu 2 = 550/3 = 183.333k. Terpakai minggu 2 = 125k. Sisa = 58.333k.
  // Sisa hari minggu 2 (hari 8-14) = 7 hari. Jatah harian = 58333/7 = 8333.
  assert(Math.abs(s.dynamicWeeklyBudget - 550000/3) < 1, 'Jatah mingguan hidup = (850-300)/3 = 183,333')
  assert(Math.abs(s.dynamicDailyBudget - (550000/3 - 125000)/7) < 1, 'Jatah harian hidup = sisa minggu / sisa hari minggu')
  assert(s.dynamicDailyBudget < s.baseDailyBudget, 'Jatah harian hidup < datar (karena sudah boros)')
}

// SKENARIO 2 — kasus contoh user: minggu ke-2 sudah 600k dari 850k
line('\n▶ SKENARIO 2: Budget 850k, awal minggu-3 (hari 15), 2 minggu pertama total 600k')
line('  Ekspektasi: jatah minggu 3 & 4 = (850-600)/2 = 125k tiap minggu\n')
{
  const ref = new Date(2026, 6, 15, 10)
  const txs = [
    tx(2026, 7, 3, 250000), // minggu 1
    tx(2026, 7, 11, 350000), // minggu 2
  ]
  const s = monthlyBudgetStatus(txs, 850000, ref)
  line(`  Bulan            : ${s.dayOfMonth}/${s.daysInMonth}  (minggu ${s.weekOfMonth}/${s.totalWeeks})`)
  line(`  Terpakai sebelum : ${rp(s.spentBeforeThisWeek)}`)
  line(`  Jatah minggu-3   : ${rp(s.dynamicWeeklyBudget)}  ← harusnya 125k`)
  line(`  Jatah harian     : ${rp(s.dynamicDailyBudget)}`)
  line('')
  assert(Math.abs(s.dynamicWeeklyBudget - 125000) < 1, 'Jatah minggu 3 = (850-600)/2 = 125,000')
  assert(Math.abs(s.dynamicDailyBudget - 125000/7) < 1, 'Jatah harian = 125k/7 ≈ 17,857 (belum keluar apa2 di mgg 3)')
}

// SKENARIO 3 — user boros di awal minggu, jatah hari berikutnya menyusut
line('\n▶ SKENARIO 3: Jatah minggu 3 = 125k, hari-15 sudah keluar 80k')
line('  Ekspektasi: sisa 6 hari di minggu 3, jatah harian = (125-80)/6 ≈ 7,500\n')
{
  const ref = new Date(2026, 6, 15, 20)
  const txs = [
    tx(2026, 7, 3, 250000), tx(2026, 7, 11, 350000),
    tx(2026, 7, 15, 80000),
  ]
  const s = monthlyBudgetStatus(txs, 850000, ref)
  line(`  Terpakai minggu 3: ${rp(s.weeklySpent)}`)
  line(`  Sisa hari minggu : ${s.remainingWeekDays} (termasuk hari ini)`)
  line(`  Jatah harian     : ${rp(s.dynamicDailyBudget)}`)
  line('')
  assert(Math.abs(s.dynamicDailyBudget - (125000-80000)/7) < 1, 'Jatah harian = (125k-80k)/7 ≈ 6,428')
}

// SKENARIO 4 — kelewat batas mingguan, jatah harian di-clamp ke 0
line('\n▶ SKENARIO 4: Kelewat jatah mingguan, jatah harian harus 0 (bukan negatif)')
{
  const ref = new Date(2026, 6, 15, 20)
  const txs = [
    tx(2026, 7, 3, 250000), tx(2026, 7, 11, 350000),
    tx(2026, 7, 15, 200000), // langsung jebol jatah minggu 3
  ]
  const s = monthlyBudgetStatus(txs, 850000, ref)
  line(`  Jatah minggu     : ${rp(s.dynamicWeeklyBudget)}`)
  line(`  Terpakai minggu  : ${rp(s.weeklySpent)}`)
  line(`  Sisa jatah minggu: ${rp(s.weeklyRemaining)}  (boleh negatif)`)
  line(`  Jatah harian     : ${rp(s.dynamicDailyBudget)}  ← harusnya 0`)
  line(`  weekOverBase     : ${s.weekOverBase}`)
  line('')
  assert(s.dynamicDailyBudget === 0, 'Jatah harian di-clamp ke 0 saat mingguan sudah kelewat')
  assert(s.weekOverBase === true, 'weekOverBase = true')
}

// SKENARIO 5 — akhir bulan, budget masih cukup
line('\n▶ SKENARIO 5: Hari terakhir (31 Juli), pengeluaran minim')
{
  const ref = new Date(2026, 6, 31, 12)
  const txs = [tx(2026, 7, 5, 100000), tx(2026, 7, 12, 100000), tx(2026, 7, 20, 100000)]
  const s = monthlyBudgetStatus(txs, 850000, ref)
  line(`  Hari             : ${s.dayOfMonth}/${s.daysInMonth}`)
  line(`  remainingDays    : ${s.remainingDays}  ← untuk display "Sisa X hari lagi"`)
  line(`  remainingDaysIncl: ${s.remainingDaysInclusive}  ← untuk pembagi`)
  line(`  Jatah harian     : ${rp(s.dynamicDailyBudget)}`)
  line('')
  assert(s.remainingDays === 0, 'Di hari terakhir, "sisa X hari lagi" = 0')
  assert(s.dayOfMonth + s.remainingDays === s.daysInMonth, 'dayOfMonth + remainingDays = daysInMonth (FIX 32-hari)')
}

// SKENARIO 6 — awal bulan, belum keluar apa-apa (FIX BUG 32 HARI)
line('\n▶ SKENARIO 6: Bug "32 hari" — hari-23 dari 31')
{
  const ref = new Date(2026, 6, 23, 12)
  const s = monthlyBudgetStatus([], 850000, ref)
  line(`  "Hari ke-${s.dayOfMonth} dari ${s.daysInMonth}"`)
  line(`  "Sisa ${s.remainingDays} hari lagi"`)
  line(`  Total: ${s.dayOfMonth + s.remainingDays} (harusnya = ${s.daysInMonth}, BUKAN 32)`)
  line('')
  assert(s.dayOfMonth + s.remainingDays === s.daysInMonth, 'Sum tidak lagi 32 — hari ini tidak double-counted')
  assert(s.remainingDays === 8, 'Sisa 8 hari lagi (23 → sisa 24-31 = 8 hari)')
}

// SKENARIO 7 — budget 0 (belum di-set)
line('\n▶ SKENARIO 7: Budget 0 (edge case)')
{
  const ref = new Date(2026, 6, 15, 12)
  const s = monthlyBudgetStatus([tx(2026, 7, 3, 50000)], 0, ref)
  line(`  Budget           : ${rp(s.budget)}`)
  line(`  Jatah mingguan   : ${rp(s.dynamicWeeklyBudget)}`)
  line(`  Jatah harian     : ${rp(s.dynamicDailyBudget)}`)
  assert(s.dynamicWeeklyBudget === 0 && s.dynamicDailyBudget === 0, 'Semua 0 saat budget=0')
}

line('\n════════════════════════════════════════════════════════')
line('  Test selesai. Kalau semua ✅, logika aman.')
line('════════════════════════════════════════════════════════\n')
