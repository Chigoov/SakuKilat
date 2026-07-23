function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tx(y, m, d, amt) {
  return { date: new Date(y, m - 1, d, 12), amount: amt, type: 'expense' }
}

function status(transactions, budget, ref) {
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const dayOfMonth = ref.getDate()
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

  let weeklySpent = 0
  let spentBeforeThisWeek = 0
  let todayExpense = 0
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < start || t.date >= tomorrow) continue
    if (t.date >= weekStart && t.date < weekEndExclusive) weeklySpent += t.amount
    else if (t.date < weekStart) spentBeforeThisWeek += t.amount
    if (dayKey(t.date) === todayKey) todayExpense += t.amount
  }

  const safeBudget = Math.max(0, budget)
  const weeksRemaining = Math.max(1, totalWeeks - weekOfMonth + 1)
  const dynamicWeeklyBudget = Math.max(0, (safeBudget - spentBeforeThisWeek) / weeksRemaining)
  const spentEarlierThisWeek = weeklySpent - todayExpense
  const todayBudgetLimit = Math.max(0, (dynamicWeeklyBudget - spentEarlierThisWeek) / remainingWeekDays)
  const dynamicDailyBudget = Math.max(0, (dynamicWeeklyBudget - weeklySpent) / remainingWeekDays)

  return {
    dynamicWeeklyBudget,
    dynamicDailyBudget,
    todayBudgetLimit,
    todayExpense,
    todayOverBase: todayExpense > todayBudgetLimit && safeBudget > 0,
  }
}

const s = status([
  tx(2026, 7, 1, 400000),
  tx(2026, 7, 23, 46000),
], 850000, new Date(2026, 6, 23, 12))

console.log(JSON.stringify(s, null, 2))
console.assert(Math.abs(s.todayBudgetLimit - 50000) < 1, 'todayBudgetLimit harus 50k')
console.assert(Math.abs(s.dynamicDailyBudget - 44888.88888888889) < 1, 'dynamicDailyBudget tetap sisa/hari lanjut')
console.assert(s.todayOverBase === false, '46k tidak boleh dianggap lewat dari batas 50k')
