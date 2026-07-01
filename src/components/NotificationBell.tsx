'use client';

import { useState, useEffect, useMemo } from 'react';
import { Bell, X, Flame, Wallet, Target, TrendingDown } from 'lucide-react';
import { useTransactionData, useBudgetStore, useWalletStore } from '@/store/StoreProvider';
import { streakStatus, monthlyBudgetStatus } from '@/lib/analytics';
import { formatIDR } from '@/lib/format';
import { getNotifPrefs, type NotifPrefs } from '@/lib/notifications';
import { loadRecurring, getPendingRecurring } from '@/lib/recurring';

interface NotificationBellProps {
  onOpenRecurring: () => void;
}

export function NotificationBell({ onOpenRecurring }: NotificationBellProps) {
  const { transactions } = useTransactionData();
  const { monthlyBudget } = useBudgetStore();
  const { wallets } = useWalletStore();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);

  useEffect(() => { setPrefs(getNotifPrefs()); }, []);

  const streak = useMemo(() => streakStatus(transactions), [transactions]);
  const budget = useMemo(() => monthlyBudgetStatus(transactions, monthlyBudget), [transactions, monthlyBudget]);
  const pendingRecurring = useMemo(() => getPendingRecurring(), []);
  const recurringCount = useMemo(() => loadRecurring().filter(r => r.active).length, []);

  const alerts: { icon: typeof Flame; color: string; bg: string; title: string; body: string }[] = [];

  // Streak alert
  if (streak.lives <= 2 && streak.current > 0) {
    alerts.push({
      icon: Flame,
      color: 'text-[var(--sk-amber)]',
      bg: 'bg-[var(--sk-amber-dim)]',
      title: 'Streak Hampir Putus!',
      body: `Sisa ${streak.lives} nyawa. Catat hari ini untuk amankan streak ${streak.current} hari.`,
    });
  }

  // Budget alert
  if (monthlyBudget > 0 && budget.pctUsed > 0.85) {
    alerts.push({
      icon: TrendingDown,
      color: 'text-[var(--sk-red)]',
      bg: 'bg-[var(--sk-red-dim)]',
      title: 'Budget Menipis',
      body: `Terpakai ${Math.round(budget.pctUsed * 100)}% dari budget. Sisa ${formatIDR(budget.remaining)}.`,
    });
  }

  // Negative wallet alert
  const negativeWallets = wallets.filter((w) => w.balance < 0);
  if (negativeWallets.length > 0) {
    alerts.push({
      icon: Wallet,
      color: 'text-[var(--sk-red)]',
      bg: 'bg-[var(--sk-red-dim)]',
      title: 'Saku Minus',
      body: `${negativeWallets.length} saku bersaldo negatif: ${negativeWallets.map((w) => w.label).join(', ')}.`,
    });
  }

  // Pending recurring
  if (pendingRecurring.length > 0) {
    alerts.push({
      icon: Target,
      color: 'text-[var(--sk-cyan)]',
      bg: 'bg-[var(--sk-cyan-dim)]',
      title: 'Transaksi Berulang Tertunda',
      body: `${pendingRecurring.length} transaksi berulang akan tercatat hari ini.`,
    });
  }

  const alertCount = alerts.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-9 h-9 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-cyan)] transition-colors"
        aria-label="Notifikasi"
      >
        <Bell className="w-4 h-4" />
        {alertCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--sk-red)] text-white text-[9px] font-bold flex items-center justify-center">
            {alertCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 sk-backdrop" />
          <div
            className="absolute top-14 right-4 w-72 max-w-[90vw] rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-xl overflow-hidden animate-scale-in safe-top"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--sk-border)]">
              <Bell className="w-4 h-4 text-[var(--sk-cyan)]" />
              <h3 className="text-sm font-semibold text-[var(--sk-text)]">Notifikasi</h3>
              <button onClick={() => setOpen(false)} className="ml-auto text-[var(--sk-text-dim)]" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-8 h-8 text-[var(--sk-text-dim)] mx-auto mb-2" />
                  <p className="text-xs text-[var(--sk-text-dim)]">Tidak ada notifikasi. Semua aman!</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--sk-border)]">
                  {alerts.map((alert, i) => {
                    const Icon = alert.icon;
                    return (
                      <div key={i} className="flex items-start gap-2.5 px-4 py-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.bg}`}>
                          <Icon className={`w-4 h-4 ${alert.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--sk-text)]">{alert.title}</p>
                          <p className="text-[10px] text-[var(--sk-text-muted)] mt-0.5 leading-relaxed">{alert.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recurring link */}
              {recurringCount > 0 && (
                <button onClick={() => { setOpen(false); onOpenRecurring(); }} className="w-full px-4 py-3 border-t border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-cyan)] flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Kelola transaksi berulang ({recurringCount})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
