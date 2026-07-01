'use client';

import { useMemo, useState, useEffect } from 'react';
import { Wallet, Flame, Target, BookOpen, Repeat } from 'lucide-react';
import { useTransactionData, useBudgetStore, useWalletStore, usePreferenceStore } from '@/store/StoreProvider';
import { monthlyBudgetStatus, streakStatus, monthlyTotals } from '@/lib/analytics';
import { formatIDR } from '@/lib/format';
import { TransactionList } from '@/components/TransactionList';
import { NotificationBell } from '@/components/NotificationBell';
import { GuideBook } from '@/components/GuideBook';
import { RecurringManager } from '@/components/RecurringManager';
import { setFlag, GUIDE_OPENED_KEY } from '@/lib/badges';

export function TabBeranda() {
  const { transactions } = useTransactionData();
  const { monthlyBudget } = useBudgetStore();
  const { totalStored } = useWalletStore();
  const { zenMode } = usePreferenceStore();
  const [showGuide, setShowGuide] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  const budget = useMemo(() => monthlyBudgetStatus(transactions, monthlyBudget), [transactions, monthlyBudget]);
  const streak = useMemo(() => streakStatus(transactions), [transactions]);
  const totals = useMemo(() => monthlyTotals(transactions), [transactions]);

  const pctUsed = Math.round(budget.pctUsed * 100);

  return (
    <div className="px-4 pt-4 space-y-2.5 max-w-2xl mx-auto">
      {/* Header with notification bell */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--sk-text)]">Beranda</h1>
          <p className="text-xs text-[var(--sk-text-dim)] mt-0.5">
            {new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowRecurring(true); }}
            className="w-9 h-9 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-cyan)] transition-colors"
            aria-label="Transaksi berulang"
          >
            <Repeat className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setFlag(GUIDE_OPENED_KEY); setShowGuide(true); }}
            className="w-9 h-9 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-cyan)] transition-colors"
            aria-label="Buku panduan"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <NotificationBell onOpenRecurring={() => setShowRecurring(true)} />
        </div>
      </div>

      {/* Total stored */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3">
        <div className="flex items-center gap-2 mb-0.5">
          <Wallet className="w-3.5 h-3.5 text-[var(--sk-cyan)]" />
          <span className="text-[11px] text-[var(--sk-text-muted)] font-medium">Total Saldo</span>
        </div>
        <p className="text-xl font-bold text-[var(--sk-text)] tabular-nums">
          {zenMode ? '••••••' : formatIDR(totalStored)}
        </p>
        <div className="flex gap-3 mt-1 text-[11px]">
          <div>
            <span className="text-[var(--sk-text-dim)]">Masuk </span>
            <span className="text-[var(--sk-green)] font-semibold tabular-nums">{zenMode ? '•••' : formatIDR(totals.income)}</span>
          </div>
          <div>
            <span className="text-[var(--sk-text-dim)]">Keluar </span>
            <span className="text-[var(--sk-red)] font-semibold tabular-nums">{zenMode ? '•••' : formatIDR(totals.expense)}</span>
          </div>
        </div>
      </div>

      {/* Budget card */}
      {monthlyBudget > 0 && (
        <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[var(--sk-text-muted)] font-medium">Budget Bulan Ini</span>
            <span className={`text-[11px] font-semibold tabular-nums ${pctUsed > 100 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text-muted)]'}`}>{pctUsed}%</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--sk-surface-2)] overflow-hidden mb-1.5">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${pctUsed > 100 ? 'bg-[var(--sk-red)]' : pctUsed > 75 ? 'bg-[var(--sk-amber)]' : 'bg-[var(--sk-cyan)]'}`}
              style={{ width: `${Math.min(100, pctUsed)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--sk-text-dim)] tabular-nums">
            <span>{zenMode ? '•••' : formatIDR(budget.spent)} terpakai</span>
            <span>{zenMode ? '•••' : formatIDR(budget.remaining)} sisa</span>
          </div>
          {budget.roast && <p className="text-[10px] text-[var(--sk-amber)] mt-1 italic">{budget.roast}</p>}
          <div className="flex gap-3 mt-1 text-[10px] text-[var(--sk-text-dim)]">
            <span>Jatah harian: <span className="text-[var(--sk-text-muted)] font-semibold tabular-nums">{zenMode ? '•••' : formatIDR(Math.round(budget.dynamicDailyBudget))}</span></span>
          </div>
        </div>
      )}

      {/* Streak card */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3">
        <div className="flex items-center gap-2 mb-0.5">
          <Flame className="w-3.5 h-3.5 text-[var(--sk-amber)]" />
          <span className="text-[11px] text-[var(--sk-text-muted)] font-medium">Streak</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-[var(--sk-text)] tabular-nums">{streak.current}</span>
          <span className="text-[11px] text-[var(--sk-text-dim)]">hari beruntun</span>
          {streak.longest > streak.current && (
            <span className="text-[10px] text-[var(--sk-text-dim)] ml-auto">Rekor: {streak.longest} hari</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          {Array.from({ length: streak.maxLives }).map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < streak.lives ? 'bg-[var(--sk-amber)]' : 'bg-[var(--sk-surface-3)]'}`} />
          ))}
          <span className="text-[10px] text-[var(--sk-text-dim)] ml-1">{streak.lives}/{streak.maxLives} nyawa</span>
          {!streak.loggedToday && (
            <span className="text-[10px] text-[var(--sk-amber)] ml-auto">Catat hari ini!</span>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <h2 className="text-xs font-semibold text-[var(--sk-text)] mb-1.5">Transaksi Terbaru</h2>
        <TransactionList transactions={transactions} limit={10} zenMode={zenMode} />
      </div>

      {/* Overlays */}
      {showGuide && <GuideBook onClose={() => setShowGuide(false)} />}
      {showRecurring && <RecurringManager onClose={() => setShowRecurring(false)} />}
    </div>
  );
}
