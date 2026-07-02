'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Bell, Flame, PiggyBank, Trophy, X } from 'lucide-react'
import { useBudgetStore, useTransactionData } from '@/lib/store'
import { monthlyBudgetStatus, streakStatus } from '@/lib/stats'
import { readGoalSnapshot } from '@/components/goal-tracker'
import { cn } from '@/lib/utils'

type NotifTone = 'warn' | 'info' | 'good'

interface NotifItem {
  id: string
  icon: React.ComponentType<{ className?: string }>
  tone: NotifTone
  title: string
  body: string
}

const TONE: Record<NotifTone, { bg: string; text: string }> = {
  warn: { bg: 'bg-[var(--sk-amber-dim)]', text: 'text-[var(--sk-amber)]' },
  info: { bg: 'bg-[var(--sk-cyan-dim)]', text: 'text-[var(--sk-cyan)]' },
  good: { bg: 'bg-[var(--sk-green-dim)]', text: 'text-[var(--sk-green)]' },
}

export function NotificationBell() {
  const { transactions } = useTransactionData()
  const { monthlyBudget } = useBudgetStore()
  const [open, setOpen] = useState(false)

  const items = useMemo<NotifItem[]>(() => {
    const list: NotifItem[] = []
    const streak = streakStatus(transactions)

    // 1. Streak hampir putus / belum catat hari ini
    if (!streak.loggedToday && streak.current > 0) {
      list.push({
        id: 'streak-risk',
        icon: Flame,
        tone: 'warn',
        title: 'Streak-mu dalam bahaya',
        body: `Kamu punya ${streak.current} hari beruntun. Catat 1 transaksi hari ini biar tidak putus.`,
      })
    } else if (!streak.loggedToday && streak.lives < streak.maxLives) {
      list.push({
        id: 'lives',
        icon: Flame,
        tone: 'warn',
        title: `${streak.lives}/${streak.maxLives} nyawa tersisa`,
        body: 'Catat hari ini untuk berhenti kehilangan nyawa.',
      })
    }

    // 2. Budget menipis
    if (monthlyBudget > 0) {
      const status = monthlyBudgetStatus(transactions, monthlyBudget)
      if (status.remaining < 0) {
        list.push({
          id: 'budget-over',
          icon: AlertTriangle,
          tone: 'warn',
          title: 'Budget bulan ini terlewat',
          body: 'Pengeluaran sudah melebihi budget. Rem dulu sampai bulan depan.',
        })
      } else if (status.pctUsed >= 0.8) {
        list.push({
          id: 'budget-low',
          icon: AlertTriangle,
          tone: 'warn',
          title: 'Budget tinggal sedikit',
          body: `Sudah terpakai ${Math.round(status.pctUsed * 100)}% dari budget bulan ini.`,
        })
      }
    }

    // 3. Goal hampir tercapai
    const goals = readGoalSnapshot()
    const nearGoal = goals.find(g => g.saved < g.target && g.saved / g.target >= 0.8)
    if (nearGoal) {
      const pct = Math.round((nearGoal.saved / nearGoal.target) * 100)
      list.push({
        id: `goal-${nearGoal.id}`,
        icon: PiggyBank,
        tone: 'good',
        title: `Goal "${nearGoal.label}" hampir tercapai`,
        body: `Sudah ${pct}%. Sedikit lagi sampai target!`,
      })
    }

    // 4. Ajakan kalau belum mulai
    if (transactions.length === 0) {
      list.push({
        id: 'empty',
        icon: Trophy,
        tone: 'info',
        title: 'Selamat datang di SakuKilat',
        body: 'Catat transaksi pertamamu untuk membuka lencana Pecah Telur.',
      })
    }

    return list
  }, [transactions, monthlyBudget])

  const count = items.length

  return (
    <>
      <button
        type="button"
        data-tour="notif-bell"
        onClick={() => setOpen(true)}
        aria-label={`Notifikasi${count > 0 ? `, ${count} baru` : ''}`}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center border bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-muted)]"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--sk-red)] text-[9px] font-bold text-white flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notifikasi"
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 backdrop-blur-sm animate-fade-in pt-16 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--sk-border)]">
              <Bell className="w-4 h-4 text-[var(--sk-cyan)]" />
              <p className="text-sm font-bold text-[var(--sk-text)] flex-1">Notifikasi</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
                className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[60dvh] overflow-y-auto p-3 flex flex-col gap-2">
              {count === 0 ? (
                <p className="text-xs text-[var(--sk-text-dim)] text-center py-6 leading-relaxed">
                  Tidak ada notifikasi. Semua aman terkendali 👌
                </p>
              ) : (
                items.map(item => {
                  const Icon = item.icon
                  const tone = TONE[item.tone]
                  return (
                    <div key={item.id} className="flex items-start gap-3 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2.5">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', tone.bg)}>
                        <Icon className={cn('w-4 h-4', tone.text)} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">{item.title}</p>
                        <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">{item.body}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
