// SakuKilat - Analytics Functions
// Reconstructed from APK reverse engineering

import type { Transaction } from '@/types';
import { dayKey, monthKey } from './format';

function isTransfer(t: Transaction): boolean {
  return t.kind === 'transfer' || t.kind === 'saving';
}

function getMonthRange(date: Date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

const ROAST_MESSAGES = [
  'Budget bulan ini sudah wafat. Dompetmu minta cuti dulu.',
  'Keuanganmu barusan melakukan parkour tanpa helm.',
  'Sisa bulan masih panjang, tapi budget sudah pulang duluan.',
  'Ini bukan bocor halus lagi, ini keran finansial kebuka penuh.',
];

function shiftDay(date: Date, days = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function periodAggregate(transactions: Transaction[], start: Date, end: Date) {
  let income = 0, expense = 0, count = 0;
  const byCat = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const tx of transactions) {
    if (isTransfer(tx) || tx.date < start || tx.date >= end) continue;
    count++;
    if (tx.type === 'income') {
      income += tx.amount;
    } else {
      expense += tx.amount;
      byCat.set(tx.category, (byCat.get(tx.category) ?? 0) + tx.amount);
      byDay.set(dayKey(tx.date), (byDay.get(dayKey(tx.date)) ?? 0) + tx.amount);
    }
  }
  return { income, expense, count, byCat, byDay };
}

export function categoryBreakdown(transactions: Transaction[], date = new Date(), type: 'expense' | 'income' = 'expense') {
  const { start, end } = getMonthRange(date);
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (isTransfer(tx) || tx.type !== type || tx.date < start || tx.date >= end) continue;
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([category, total_amount]) => ({ category, total: total_amount, pct: total ? total_amount / total : 0 }))
    .sort((a, b) => b.total - a.total);
}

export function dailyAggregates(transactions: Transaction[]) {
  const map = new Map<string, { expense: number; income: number; count: number }>();
  for (const tx of transactions) {
    const key = dayKey(tx.date);
    const agg = map.get(key) ?? { expense: 0, income: 0, count: 0 };
    if (!isTransfer(tx)) {
      if (tx.type === 'expense') agg.expense += tx.amount;
      else agg.income += tx.amount;
    }
    agg.count++;
    map.set(key, agg);
  }
  return map;
}

export function monthlyBudgetStatus(transactions: Transaction[], budget: number, date = new Date()) {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayOfMonth = date.getDate();
  const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const todayKey = dayKey(date);
  const weekOfMonth = Math.min(4, Math.floor((dayOfMonth - 1) / 7) + 1);
  const weekStartDay = (weekOfMonth - 1) * 7 + 1;
  const weekEndDay = weekOfMonth === 4 ? daysInMonth : Math.min(daysInMonth, weekStartDay + 6);
  const weekStart = new Date(date.getFullYear(), date.getMonth(), weekStartDay);
  const weekEnd = new Date(date.getFullYear(), date.getMonth(), weekEndDay + 1);
  const remainingWeekDays = Math.max(1, weekEndDay - dayOfMonth + 1);

  let spent = 0, weeklySpent = 0, todayExpense = 0;
  for (const tx of transactions) {
    if (isTransfer(tx) || tx.type !== 'expense' || tx.date < monthStart || tx.date >= nextDay) continue;
    spent += tx.amount;
    if (tx.date >= weekStart && tx.date < weekEnd) weeklySpent += tx.amount;
    if (dayKey(tx.date) === todayKey) todayExpense += tx.amount;
  }

  const safeBudget = Math.max(0, budget);
  const remaining = safeBudget - spent;
  const baseDailyBudget = safeBudget / daysInMonth;
  const baseWeeklyBudget = safeBudget / 4;
  const weeklyRemaining = baseWeeklyBudget - weeklySpent;
  const dynamicDailyBudget = Math.max(0, weeklyRemaining / remainingWeekDays);
  const isOverBudget = spent > safeBudget && safeBudget > 0;
  const roastIdx = safeBudget > 0 ? Math.min(ROAST_MESSAGES.length - 1, Math.floor((spent / safeBudget - 1) * 4)) : 0;

  return {
    budget: safeBudget,
    spent,
    remaining,
    daysInMonth,
    dayOfMonth,
    remainingDays,
    weekOfMonth,
    totalWeeks: 4,
    weekStartDay,
    weekEndDay,
    remainingWeekDays,
    baseDailyBudget,
    baseWeeklyBudget,
    dynamicDailyBudget,
    weeklySpent,
    weeklyRemaining,
    todayExpense,
    todayOverBase: todayExpense > baseDailyBudget && safeBudget > 0,
    weekOverBase: weeklySpent > baseWeeklyBudget && safeBudget > 0,
    pctUsed: safeBudget > 0 ? spent / safeBudget : 0,
    pctWeekUsed: baseWeeklyBudget > 0 ? weeklySpent / baseWeeklyBudget : 0,
    roast: isOverBudget ? ROAST_MESSAGES[roastIdx] : null,
  };
}

export function monthlyTotals(transactions: Transaction[], date = new Date()) {
  const { start, end } = getMonthRange(date);
  const filtered = transactions.filter((t) => t.date >= start && t.date < end && !isTransfer(t));
  const income = filtered.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const expense = filtered.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  return { income, expense, balance: income - expense };
}

export function periodInsight(transactions: Transaction[], period: 'minggu' | 'bulan', date = new Date()) {
  let currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date, days: number, label: string;

  if (period === 'minggu') {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    currentStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    currentEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    prevStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13);
    prevEnd = currentStart;
    days = 7;
    label = '7 hari terakhir';
  } else {
    currentStart = new Date(date.getFullYear(), date.getMonth(), 1);
    currentEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    prevStart = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    prevEnd = currentStart;
    days = Math.max(1, date.getDate());
    label = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date);
  }

  const current = periodAggregate(transactions, currentStart, currentEnd);
  const previous = periodAggregate(transactions, prevStart, prevEnd);
  const sortedCats = [...current.byCat.entries()].sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCats.length > 0 ? { category: sortedCats[0][0], total: sortedCats[0][1], pct: current.expense > 0 ? sortedCats[0][1] / current.expense : 0 } : null;
  const sortedDays = [...current.byDay.entries()].sort((a, b) => b[1] - a[1]);
  const busiestDay = sortedDays.length > 0 ? { key: sortedDays[0][0], total: sortedDays[0][1] } : null;
  const deltaPct = previous.expense > 0 ? Math.round((current.expense - previous.expense) / previous.expense * 100) : null;
  const avgPerDay = Math.round(current.expense / days);
  const takeaways: string[] = [];

  if (current.count === 0) {
    takeaways.push(`Belum ada transaksi di ${period} ini. Mulai catat untuk lihat analisisnya.`);
  } else {
    if (deltaPct !== null) {
      if (deltaPct < 0) takeaways.push(`Pengeluaran turun ${Math.abs(deltaPct)}% dibanding ${period} lalu. Mantap, lebih hemat!`);
      else if (deltaPct > 0) takeaways.push(`Pengeluaran naik ${deltaPct}% dibanding ${period} lalu. Cek lagi pos yang membengkak.`);
      else takeaways.push(`Pengeluaran setara dengan ${period} lalu. Stabil.`);
    }
    takeaways.push(`Rata-rata pengeluaran ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(avgPerDay)} per hari.`);
    if (current.income > 0) {
      takeaways.push(current.income - current.expense >= 0
        ? `Surplus ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(current.income - current.expense)} — pemasukan menutup pengeluaran.`
        : `Defisit ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(current.expense - current.income)} — pengeluaran melebihi pemasukan.`);
    }
  }

  return { scope: period, label, income: current.income, expense: current.expense, net: current.income - current.expense, avgPerDay, txCount: current.count, topCategory, busiestDay, deltaPct, takeaways };
}

export function streakStatus(transactions: Transaction[], date = new Date()) {
  const loggedDays = new Set(transactions.map((t) => dayKey(t.date)));
  const todayKey = dayKey(shiftDay(date));
  const loggedToday = loggedDays.has(todayKey);
  const yesterdayKey = dayKey(shiftDay(date, -1));
  const hasYesterday = loggedDays.has(yesterdayKey);

  let current = 0;
  if (loggedToday) {
    for (let d = 0; d < 400; d++) {
      if (loggedDays.has(dayKey(shiftDay(date, d)))) current++;
      else break;
    }
  } else if (hasYesterday) {
    for (let d = -1; d > -400; d--) {
      if (loggedDays.has(dayKey(shiftDay(date, d)))) current++;
      else break;
    }
  }

  // Gap days (for lives calculation)
  let gapDays = 0;
  if (loggedDays.size === 0) gapDays = 0;
  else if (!loggedToday) {
    for (let d = -1; d > -400 && !loggedDays.has(dayKey(shiftDay(date, d))); d--) gapDays++;
  }

  const lives = Math.max(0, 5 - gapDays);
  const sortedDays = Array.from(loggedDays).sort();
  let longest = 0, streak = 0;
  let prev: Date | null = null;
  for (const d of sortedDays) {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    if (prev && dt.getTime() - prev.getTime() === 86400000) streak++;
    else streak = 1;
    if (streak > longest) longest = streak;
    prev = dt;
  }

  return { current, longest: Math.max(longest, current), totalDaysLogged: loggedDays.size, lives, maxLives: 5, loggedToday };
}

export function topSavedCategory(transactions: Transaction[]): string | null {
  const now = new Date();
  const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
  const thisWeekEnd = new Date(now.getTime() + 86400000);

  const getCatTotals = (start: Date, end: Date) => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (isTransfer(tx) || tx.type !== 'expense' || tx.date < start || tx.date >= end) continue;
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
    }
    return map;
  };

  const thisWeek = getCatTotals(thisWeekStart, thisWeekEnd);
  const lastWeek = getCatTotals(lastWeekStart, thisWeekStart);
  let bestCat: string | null = null;
  let maxSaving = 0;
  for (const [cat, lastAmount] of lastWeek.entries()) {
    const saving = lastAmount - (thisWeek.get(cat) ?? 0);
    if (saving > maxSaving) { maxSaving = saving; bestCat = cat; }
  }
  return bestCat;
}

export function transactionsForDay(transactions: Transaction[], day: string): Transaction[] {
  return transactions.filter((t) => dayKey(t.date) === day).sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function trendSeries(transactions: Transaction[], range: '7d' | '30d' | '1y') {
  const now = new Date();
  if (range === '1y') {
    const result: { label: string; expense: number; income: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(start);
      let expense = 0, income = 0;
      for (const tx of transactions) {
        if (isTransfer(tx) || tx.date < start || tx.date >= end) continue;
        if (tx.type === 'expense') expense += tx.amount;
        else income += tx.amount;
      }
      result.push({ label, expense, income });
    }
    return result;
  }

  const days = range === '7d' ? 7 : 30;
  const result: { label: string; expense: number; income: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(date);
    const label = range === '7d'
      ? new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date)
      : new Intl.DateTimeFormat('id-ID', { day: 'numeric' }).format(date);
    let expense = 0, income = 0;
    for (const tx of transactions) {
      if (isTransfer(tx) || dayKey(tx.date) !== key) continue;
      if (tx.type === 'expense') expense += tx.amount;
      else income += tx.amount;
    }
    result.push({ label, expense, income });
  }
  return result;
}

export function trendSeriesForPeriod(transactions: Transaction[], start: Date, end: Date) {
  const periodStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const periodEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  if (periodEnd <= periodStart) return [];
  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000);
  const isLong = totalDays > 62;
  const formatter = isLong
    ? new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' })
    : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

  const result: { key: string; label: string; expense: number; income: number }[] = [];
  if (isLong) {
    for (let d = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1); d < periodEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      result.push({ key: monthKey(d), label: formatter.format(d), expense: 0, income: 0 });
    }
  } else {
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + i);
      result.push({ key: dayKey(d), label: formatter.format(d), expense: 0, income: 0 });
    }
  }

  const keyMap = new Map(result.map((r) => [r.key, r]));
  for (const tx of transactions) {
    if (isTransfer(tx) || tx.date < periodStart || tx.date >= periodEnd) continue;
    const key = isLong ? monthKey(tx.date) : dayKey(tx.date);
    const entry = keyMap.get(key);
    if (entry) {
      if (tx.type === 'expense') entry.expense += tx.amount;
      else entry.income += tx.amount;
    }
  }
  return result.map(({ key, ...rest }) => rest);
}
