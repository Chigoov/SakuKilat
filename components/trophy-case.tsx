'use client'

import { memo, useMemo, useState } from 'react'
import { Award, ChevronDown, Lock, Trophy } from 'lucide-react'
import {
  useCustomizationStore,
  useTransactionData,
  useWalletStore,
} from '@/lib/store'
import { readGoalSnapshot } from '@/components/goal-tracker'
import {
  buildContext,
  evaluateBadges,
  formatUnlockDate,
  type BadgeTier,
  type UnlockedBadge,
} from '@/lib/achievements'
import { cn } from '@/lib/utils'

const TIER_STYLE: Record<BadgeTier, { text: string; bg: string }> = {
  bronze:  { text: 'text-[#c98a4b]', bg: 'bg-[rgba(180,120,70,0.14)]' },
  silver:  { text: 'text-[#b8c2d9]', bg: 'bg-[rgba(180,190,210,0.14)]' },
  gold:    { text: 'text-[var(--sk-amber)]', bg: 'bg-[var(--sk-amber-dim)]' },
  special: { text: 'text-[var(--sk-cyan)]', bg: 'bg-[var(--sk-cyan-dim)]' },
}
const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: 'Perunggu', silver: 'Perak', gold: 'Emas', special: 'Spesial',
}

// ── Satu baris lencana ────────────────────────────────────────────────────────
function BadgeRow({ badge }: { badge: UnlockedBadge }) {
  const [open, setOpen] = useState(false)
  const style = TIER_STYLE[badge.tier]
  const pct = Math.round(badge.progress * 100)
  const unlockDate = formatUnlockDate(badge.unlockedAt)

  return (
    <div className={cn(
      'rounded-xl border transition-colors',
      badge.unlocked ? 'bg-[var(--sk-surface)] border-[var(--sk-border-2)]' : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)]'
    )}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
          badge.unlocked ? style.bg : 'bg-[var(--sk-surface-3)]'
        )}>
          {badge.unlocked
            ? <Award className={cn('w-4.5 h-4.5', style.text)} />
            : <Lock className="w-4 h-4 text-[var(--sk-text-dim)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn(
              'text-sm font-semibold truncate',
              badge.unlocked ? 'text-[var(--sk-text)]' : 'text-[var(--sk-text-dim)]'
            )}>
              {badge.title}
            </p>
            {badge.unlocked && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--sk-green)] flex-shrink-0">✓</span>
            )}
          </div>
          {/* progress bar untuk yang belum terbuka & punya target */}
          {!badge.unlocked && badge.target ? (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-[var(--sk-surface-3)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--sk-cyan)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[9px] tabular-nums text-[var(--sk-text-dim)] flex-shrink-0">
                {badge.current ?? 0}/{badge.target}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
              {badge.unlocked
                ? (unlockDate ? `Didapat ${unlockDate}` : 'Terbuka')
                : 'Terkunci'}
            </p>
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-[var(--sk-text-dim)] flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-[var(--sk-border)] px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] text-[var(--sk-text-muted)] leading-relaxed">
            <span className="font-semibold text-[var(--sk-text)]">Cara dapat: </span>{badge.howTo}
          </p>
          {badge.unlocked && (
            <p className="text-[11px] text-[var(--sk-green)] leading-relaxed italic">&ldquo;{badge.copy}&rdquo;</p>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', style.bg, style.text)}>
              {TIER_LABEL[badge.tier]}
            </span>
            <span className="text-[10px] text-[var(--sk-text-dim)]">{badge.group}</span>
            {badge.unlocked && unlockDate && (
              <span className="ml-auto text-[10px] text-[var(--sk-text-dim)]">{unlockDate}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export const TrophyCase = memo(function TrophyCase() {
  const { transactions } = useTransactionData()
  const { wallets } = useWalletStore()
  const { customPayments, customCategories } = useCustomizationStore()
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all')

  const badges = useMemo(() => {
    const goals = readGoalSnapshot()
    const ctx = buildContext({
      transactions,
      walletsCount: wallets.length,
      customPaymentsCount: customPayments.length,
      customCategoriesCount: customCategories.length,
      goalsTotal: goals.length,
      goalsCompleted: goals.filter(g => g.saved >= g.target).length,
    })
    return evaluateBadges(ctx)
  }, [transactions, wallets, customPayments, customCategories])

  const unlockedCount = badges.filter(b => b.unlocked).length

  const visible = useMemo(() => {
    if (filter === 'unlocked') return badges.filter(b => b.unlocked)
    if (filter === 'locked') return badges.filter(b => !b.unlocked)
    // 'all' → tampilkan yang terbuka dulu, lalu yang progресnya tinggi.
    return [...badges].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
      return b.progress - a.progress
    })
  }, [badges, filter])

  return (
    <div>
      {/* Header etalase — bisa di-minimize */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3.5 py-3 text-left hover:bg-[var(--sk-surface-2)] transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-[var(--sk-amber-dim)] flex items-center justify-center flex-shrink-0">
          <Trophy className="w-4.5 h-4.5 text-[var(--sk-amber)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Etalase Trofi</p>
          <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5">
            {unlockedCount} dari {badges.length} lencana terbuka
          </p>
        </div>
        <span className="text-[11px] font-bold tabular-nums text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
          {unlockedCount}/{badges.length}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-[var(--sk-text-dim)] flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="mt-2.5">
          {/* Filter */}
          <div className="flex gap-1.5 mb-2.5">
            {([['all', 'Semua'], ['unlocked', 'Terbuka'], ['locked', 'Terkunci']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
                  filter === id
                    ? 'bg-[var(--sk-cyan)] text-[#090D16]'
                    : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-[var(--sk-border)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* List scrollable */}
          <div className="max-h-[400px] overflow-y-auto flex flex-col gap-2 pr-1">
            {visible.map(badge => <BadgeRow key={badge.id} badge={badge} />)}
            {visible.length === 0 && (
              <p className="text-xs text-[var(--sk-text-dim)] text-center py-6">Tidak ada lencana di filter ini.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
