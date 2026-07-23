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

  return (
    <section className="mt-5 h-full rounded-[30px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn(
            'w-10 h-10 rounded-2xl flex items-center justify-center',
            status.roast ? 'bg-[var(--sk-red-dim)]' : 'bg-[var(--sk-amber-dim)]'
          )}>
            <Gauge className={cn('w-5 h-5', status.roast ? 'text-[var(--sk-red)]' : 'text-[var(--sk-amber)]')} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--sk-text-muted)]">Budget bulan ini</p>
            <p className="text-[2rem] font-bold leading-none tabular-nums text-[var(--sk-text)]" data-amount>
              {formatIDR(status.budget)}
            </p>
          </div>
          <span className={cn(
            'ml-auto text-lg font-semibold tabular-nums',
            status.roast ? 'text-[var(--sk-red)]' : pct > 75 ? 'text-[var(--sk-amber)]' : 'text-[var(--sk-green)]'
          )}>
            {pct}%
          </span>
        </div>

        <div className="h-2 rounded-full bg-[var(--sk-surface-2)] overflow-hidden mb-3">
          <div
            className={cn('h-full rounded-full', status.roast ? 'bg-[var(--sk-red)]' : 'bg-[var(--sk-cyan)]')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm mb-3">
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

        <div className="rounded-[24px] bg-[var(--sk-surface-2)] border border-[var(--sk-border)] p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
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
              <p className="text-[var(--sk-text-dim)]">Jatah minggu ini</p>
              <p className="font-semibold tabular-nums text-[var(--sk-text)]">{formatIDRCompact(status.baseWeeklyBudget)}</p>
            </div>
            <div>
              <p className="text-[var(--sk-text-dim)]">Sudah keluar</p>
              <p className="font-semibold tabular-nums text-[var(--sk-red)]">{formatIDRCompact(status.weeklySpent)}</p>
            </div>
            <div>
              <p className="text-[var(--sk-text-dim)]">
                {status.weeklyRemaining < 0 ? 'Lewat jatah' : 'Sisa jatah'}
              </p>
              <p className={cn(
                'font-semibold tabular-nums',
                status.weeklyRemaining < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
              )}>
                {status.weeklyRemaining < 0 ? '-' : ''}{formatIDRCompact(Math.abs(status.weeklyRemaining))}
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
            Pengeluaran minggu ini ({formatIDR(status.weeklySpent)}) sudah lewat {formatIDR(Math.max(0, status.weeklySpent - status.baseWeeklyBudget))} dari jatah mingguan {formatIDR(Math.round(status.baseWeeklyBudget))}.
          </p>
        )}

        {status.budget === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-text-dim)]">
            Budget bulan ini belum diisi. Isi dulu supaya batas aman harian langsung kebaca.
          </p>
        ) : status.todayOverBase ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-red)]">
            Hari ini kamu sudah keluar {formatIDR(status.todayExpense)}. Itu lewat {formatIDR(Math.max(0, status.todayExpense - status.baseDailyBudget))} dari jatah harian {formatIDR(status.baseDailyBudget)}.
          </p>
        ) : status.todayExpense > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-text-dim)]">
            Hari ini baru keluar {formatIDR(status.todayExpense)}. Batas amannya sekitar {formatIDR(Math.round(status.dynamicDailyBudget))} per hari sampai minggu ini selesai.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-[var(--sk-text-dim)]">
            Belum ada pengeluaran hari ini. Cocok kalau mau mulai catat dari Smart Tracker atau input manual.
          </p>
        )}
    </section>
  )
}
