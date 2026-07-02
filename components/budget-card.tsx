'use client'

import { Gauge } from 'lucide-react'
import { useBudgetStore, useTransactionData } from '@/lib/store'
import { monthlyBudgetStatus } from '@/lib/stats'
import { formatIDR, formatIDRCompact } from '@/lib/parser'
import { cn } from '@/lib/utils'

export function BudgetCard() {
  const { monthlyBudget } = useBudgetStore()
  const { transactions } = useTransactionData()
  const status = monthlyBudgetStatus(transactions, monthlyBudget)
  const pct = Math.min(100, Math.round(status.pctUsed * 100))
  const weekPct = Math.min(100, Math.round(status.pctWeekUsed * 100))
  const openBudgetSettings = () => {
    window.dispatchEvent(new CustomEvent('sakukilat:navigate', { detail: { tab: 'saku', section: 'budget' } }))
  }
  const budgetLabel = formatIDR(status.budget)
  const budgetAmountClass =
    budgetLabel.replace(/\s+/g, '').length >= 13
      ? 'text-[clamp(1.55rem,6.2vw,2.2rem)]'
      : 'text-[clamp(1.72rem,6.8vw,2.45rem)]'

  return (
    <section className="mt-4 h-full rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-[18px]',
            status.roast ? 'bg-[var(--sk-red-dim)]' : 'bg-[var(--sk-amber-dim)]'
          )}>
            <Gauge className={cn('w-5 h-5', status.roast ? 'text-[var(--sk-red)]' : 'text-[var(--sk-amber)]')} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--sk-text-muted)]">Budget bulan ini</p>
            <p className={cn('whitespace-nowrap font-bold leading-none tabular-nums text-[var(--sk-text)]', budgetAmountClass)} data-amount>
              {budgetLabel}
            </p>
          </div>
          <span className={cn(
            'ml-auto text-[1rem] font-semibold tabular-nums',
            status.roast ? 'text-[var(--sk-red)]' : pct > 75 ? 'text-[var(--sk-amber)]' : 'text-[var(--sk-green)]'
          )}>
            {pct}%
          </span>
        </div>

        <div className="mb-3 h-2 rounded-full bg-[var(--sk-surface-2)] overflow-hidden">
          <div
            className={cn('h-full rounded-full', status.roast ? 'bg-[var(--sk-red)]' : 'bg-[var(--sk-cyan)]')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 text-[13px]">
          <div>
            <p className="text-[var(--sk-text-dim)]">Terpakai</p>
            <p className="font-semibold tabular-nums text-[var(--sk-red)]">{formatIDRCompact(status.spent)}</p>
          </div>
          <div>
            <p className="text-[var(--sk-text-dim)]">Jatah/hari</p>
            <p className="font-semibold tabular-nums text-[var(--sk-cyan)]">{formatIDRCompact(status.dynamicDailyBudget)}</p>
          </div>
          <div>
            <p className="text-[var(--sk-text-dim)]">Hari tersisa</p>
            <p className="font-semibold tabular-nums text-[var(--sk-text)]">{status.remainingDays}</p>
          </div>
        </div>

        <div className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-widest">
                Minggu {status.weekOfMonth}/{status.totalWeeks}
              </p>
              <p className="text-xs text-[var(--sk-text-muted)]">
                Tgl {status.weekStartDay}-{status.weekEndDay}
              </p>
            </div>
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              status.weekOverBase ? 'text-[var(--sk-red)]' : weekPct > 75 ? 'text-[var(--sk-amber)]' : 'text-[var(--sk-green)]'
            )}>
              {weekPct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--sk-surface-3)] overflow-hidden mb-2.5">
            <div
              className={cn('h-full rounded-full', status.weekOverBase ? 'bg-[var(--sk-red)]' : 'bg-[var(--sk-amber)]')}
              style={{ width: `${weekPct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-[var(--sk-text-dim)]">Jatah/minggu</p>
              <p className="font-semibold tabular-nums text-[var(--sk-text)]">{formatIDRCompact(status.baseWeeklyBudget)}</p>
            </div>
            <div>
              <p className="text-[var(--sk-text-dim)]">Keluar minggu</p>
              <p className="font-semibold tabular-nums text-[var(--sk-red)]">{formatIDRCompact(status.weeklySpent)}</p>
            </div>
            <div>
              <p className="text-[var(--sk-text-dim)]">Sisa minggu</p>
              <p className={cn(
                'font-semibold tabular-nums',
                status.weeklyRemaining < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
              )}>
                {formatIDRCompact(Math.abs(status.weeklyRemaining))}
              </p>
            </div>
          </div>
        </div>

        {status.roast && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-red)]">
            {status.roast}
          </p>
        )}
        {!status.roast && status.weekOverBase && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-amber)]">
            Minggu ini sudah lewat jatah. Tenang, remnya cukup di minggu ini dulu.
          </p>
        )}

        {status.budget === 0 ? (
          <div className="mt-3">
            <p className="text-xs leading-relaxed text-[var(--sk-text-dim)]">
              Budget bulan ini belum diisi.
            </p>
            <button
              type="button"
              onClick={openBudgetSettings}
              className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[rgba(56,189,248,0.25)] bg-[var(--sk-cyan-dim)] px-3 py-2 text-[13px] font-semibold text-[var(--sk-cyan)]"
            >
              Atur sekarang -&gt;
            </button>
          </div>
        ) : status.todayOverBase ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-red)]">
            Hari ini keluar {formatIDR(status.todayExpense)}. Lewat {formatIDR(Math.max(0, status.todayExpense - status.baseDailyBudget))} dari jatah harian.
          </p>
        ) : status.todayExpense > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-text-dim)]">
            Hari ini keluar {formatIDR(status.todayExpense)}. Batas amannya sekitar {formatIDR(Math.round(status.dynamicDailyBudget))} per hari.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-text-dim)]">
            Belum ada pengeluaran hari ini. Cocok buat mulai catat dari input cepat.
          </p>
        )}
    </section>
  )
}
