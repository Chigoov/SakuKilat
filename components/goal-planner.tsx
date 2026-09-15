'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  PiggyBank,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Wallet,
  X,
} from 'lucide-react'
import { useFeedbackStore, useWalletStore } from '@/lib/store'
import {
  formatIDR,
  formatIDRCompact,
  INDONESIAN_SHORT_MONTHS,
  toCalendarDateString,
  toTransactionDateParts,
} from '@/lib/parser'
import { parseAmountInput } from '@/lib/amount'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { RupiahInput } from '@/components/rupiah-input'
import { syncWidgetSnapshot } from '@/lib/widget-snapshot'

/**
 * SakuKilat — Enhanced Goal Planner (Phase P7, Task 14.4)
 * -------------------------------------------------------
 * Self-contained, offline-first financial goal planning and target tracking subsystem.
 *
 * Requirements:
 * - 7.1: Extended Goal model with targetDate, targetAmount, currentAmount, notes
 * - 7.2: Suggested monthly contribution required to reach target
 * - 7.3: Health status classification ('Aman', 'Perlu dipercepat', 'Terlambat')
 * - 7.4: Non-duplicating goal deposit allocations (internal transfers, no double-counting)
 * - 7.5: Primary goal completion percentage exported to NativeWidgetSnapshot
 * - 3.4: Linked in Tab Saku Perencanaan Keuangan section
 *
 * Storage key: sakukilat:v2:goals
 */

import {
  type Goal,
  type GoalEnhanced,
  type GoalHealthStatus,
  type GoalHealthFormat,
  calculateMonthlyContribution,
  calculateRemainingMonths,
  evaluateGoalHealth,
  enhanceGoal,
  formatGoalHealth,
  daysUntil,
  generateGoalId,
  GOAL_STORAGE_KEY,
  CELEBRATED_GOALS_KEY,
} from '@/lib/goals'

export type { Goal, GoalEnhanced, GoalHealthStatus, GoalHealthFormat }
export { GOAL_STORAGE_KEY }

const CELEBRATED_KEY = CELEBRATED_GOALS_KEY

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGoalRecord(value: unknown): value is Goal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Goal).id === 'string' &&
    (typeof (value as Goal).label === 'string' || typeof (value as Goal).name === 'string') &&
    (typeof (value as Goal).target === 'number' || typeof (value as Goal).targetAmount === 'number') &&
    (typeof (value as Goal).saved === 'number' || typeof (value as Goal).currentAmount === 'number')
  )
}

function loadGoals(): GoalEnhanced[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Goal[]
    if (!Array.isArray(parsed)) return []
    const cleaned = parsed.filter(isGoalRecord)
    const enhanced = cleaned.map(g => enhanceGoal(g))
    if (cleaned.length !== parsed.length) saveGoals(enhanced)
    return enhanced
  } catch {
    return []
  }
}

export function readGoalSnapshot(): GoalEnhanced[] {
  return loadGoals()
}

function saveGoals(goals: Array<Goal | GoalEnhanced>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goals))
    window.dispatchEvent(new CustomEvent('sakukilat:goals-changed'))
    void syncWidgetSnapshot({ goals }).catch(() => {
      /* non-blocking widget snapshot sync */
    })
  } catch {
    /* quota exceeded */
  }
}

export function contributeToGoalSnapshot(id: string, amount: number): GoalEnhanced | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const goals = loadGoals()
  let updated: GoalEnhanced | null = null
  const nextGoals = goals.map((goal) => {
    if (goal.id !== id) return goal
    const newSaved = (goal.currentAmount ?? goal.saved) + Math.round(amount)
    updated = enhanceGoal({
      ...goal,
      saved: newSaved,
      currentAmount: newSaved,
      updatedAt: new Date().toISOString(),
    })
    return updated
  })
  if (!updated) return null
  saveGoals(nextGoals)
  return updated
}

function loadCelebrated(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(CELEBRATED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    const cleaned = Array.isArray(arr) ? arr.filter((item): item is string => typeof item === 'string') : []
    const set = new Set(cleaned)
    if (!Array.isArray(arr) || cleaned.length !== arr.length || set.size !== cleaned.length) saveCelebrated(set)
    return set
  } catch {
    return new Set()
  }
}

function saveCelebrated(set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...set]))
  } catch {
    /* quota */
  }
}

function formatDeadlineDate(dateStr?: string): string {
  if (!dateStr) return '-'
  try {
    const parts = toTransactionDateParts(dateStr)
    const monthName = INDONESIAN_SHORT_MONTHS[parts.month - 1] || String(parts.month)
    return `${parts.day} ${monthName} ${parts.year}`
  } catch {
    return dateStr.slice(0, 10)
  }
}

// ── Mini confetti for goal milestones ─────────────────────────────────────────

function GoalConfetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3200)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([20, 40, 20, 80])
    }
    return () => window.clearTimeout(t)
  }, [onDone])

  const COLORS = ['#34D399', '#38BDF8', '#FBBF24', '#F472B6']
  const particles = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2
    const distance = 70 + Math.random() * 110
    return {
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 30,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 80,
      duration: 700 + Math.random() * 600,
    }
  })

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 overflow-hidden">
      <div className="relative">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute w-1.5 h-2 rounded-sm"
            style={{
              background: p.color,
              animation: `sk-confetti ${p.duration}ms cubic-bezier(0.16,1,0.3,1) ${p.delay}ms forwards`,
              ['--sk-dx' as string]: `${p.dx}px`,
              ['--sk-dy' as string]: `${p.dy}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

// ── Single Goal Card Component ────────────────────────────────────────────────

export interface GoalCardProps {
  goal: GoalEnhanced
  onContribute: (id: string, amount: number, fromWalletId?: string) => void
  onEdit: (goal: GoalEnhanced) => void
  onRemove: (id: string) => void
  celebrating: boolean
  onCelebrationDone: () => void
}

export const GoalCard = memo(function GoalCard({
  goal,
  onContribute,
  onEdit,
  onRemove,
  celebrating,
  onCelebrationDone,
}: GoalCardProps) {
  const { wallets } = useWalletStore()
  const [expanded, setExpanded] = useState(false)
  const [contribRaw, setContribRaw] = useState('')
  const [fromWalletId, setFromWalletId] = useState<string>('')
  const parsedContrib = parseAmountInput(contribRaw)

  const targetAmount = goal.targetAmount ?? goal.target ?? 0
  const currentAmount = goal.currentAmount ?? goal.saved ?? 0
  const progress = targetAmount > 0 ? Math.min(1, currentAmount / targetAmount) : 0
  const pct = Math.round(progress * 100)
  const remaining = Math.max(0, targetAmount - currentAmount)
  const days = daysUntil(goal.targetDate || goal.deadline)
  const isDone = currentAmount >= targetAmount

  const dailySuggestion =
    days !== null && days > 0 && !isDone ? Math.ceil(remaining / days) : null

  const health = formatGoalHealth(goal.healthStatus || 'Aman')

  const handleContribute = () => {
    if (!parsedContrib || parsedContrib <= 0) return
    onContribute(goal.id, parsedContrib, fromWalletId || undefined)
    setContribRaw('')
    setExpanded(false)
  }

  const barColor = isDone
    ? 'bg-[var(--sk-green)]'
    : goal.healthStatus === 'Terlambat'
      ? 'bg-[var(--sk-red)]'
      : goal.healthStatus === 'Perlu dipercepat'
        ? 'bg-[var(--sk-amber)]'
        : progress >= 0.66
          ? 'bg-[var(--sk-cyan)]'
          : progress >= 0.33
            ? 'bg-[var(--sk-cyan)]/80'
            : 'bg-[var(--sk-text-dim)]'

  return (
    <div
      data-testid={`goal-card-${goal.id}`}
      data-goal-id={goal.id}
      className={cn(
        'relative rounded-2xl bg-[var(--sk-surface)] border p-4 transition-all duration-200 overflow-hidden',
        isDone
          ? 'border-[var(--sk-green)]/70 shadow-[0_0_24px_rgba(52,211,153,0.15)]'
          : 'border-[var(--sk-border)] hover:border-[var(--sk-border-2)]'
      )}
    >
      {celebrating && <GoalConfetti onDone={onCelebrationDone} />}

      {/* Header Row: Icon, Title, Health Badge, Actions */}
      <div className="flex items-start gap-2.5 mb-2.5">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border',
            isDone
              ? 'bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30 text-[var(--sk-green)]'
              : 'bg-[var(--sk-cyan-dim)] border-[var(--sk-cyan)]/30 text-[var(--sk-cyan)]'
          )}
        >
          {isDone ? <Trophy className="w-4 h-4" /> : <Target className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-semibold text-[var(--sk-text)] truncate">
              {goal.name || goal.label}
            </h4>

            {/* Requirement 7.3: Health status classification badge */}
            <span
              data-testid={`goal-health-badge-${goal.id}`}
              data-health-status={goal.healthStatus}
              className={cn(
                'text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0',
                health.bgClass,
                health.textClass,
                health.borderClass
              )}
            >
              {health.badgeText}
            </span>
          </div>

          {/* Optional Note (Req 7.1) */}
          {goal.note && (
            <p className="text-[11px] text-[var(--sk-text-dim)] truncate italic mt-0.5">
              {goal.note}
            </p>
          )}

          {/* Amount info */}
          <p className="text-xs text-[var(--sk-text-dim)] tabular-nums mt-0.5">
            <span className="font-semibold text-[var(--sk-text)]">{formatIDR(currentAmount)}</span>
            {' / '}
            <span>{formatIDR(targetAmount)}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(goal)}
            aria-label="Edit goal"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)] hover:text-[var(--sk-text)] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove(goal.id)}
            aria-label="Hapus goal"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-red-dim)] hover:text-[var(--sk-red)] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 rounded-full bg-[var(--sk-surface-2)] overflow-hidden">
        <div
          data-testid={`goal-progress-bar-${goal.id}`}
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Metrics Row: % & Target Date & Projection */}
      <div className="mt-2 flex items-center justify-between text-[11px] gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="tabular-nums font-semibold text-[var(--sk-text)]">{pct}%</span>
          {isDone ? (
            <span className="text-[var(--sk-green)] font-semibold inline-flex items-center gap-1">
              <Check className="w-3 h-3" /> Tercapai!
            </span>
          ) : (
            <span className="text-[var(--sk-text-dim)]">
              (sisa {formatIDRCompact(remaining)})
            </span>
          )}
        </div>

        {/* Deadline information (Req 7.1) */}
        {(goal.targetDate || goal.deadline) && (
          <div
            data-testid={`goal-deadline-${goal.id}`}
            className="flex items-center gap-1 text-[10px] text-[var(--sk-text-muted)] shrink-0"
          >
            <Calendar className="w-3 h-3 text-[var(--sk-text-dim)]" />
            <span>Target: {formatDeadlineDate(goal.targetDate || goal.deadline)}</span>
            {days !== null && !isDone && (
              <span
                className={cn(
                  'ml-0.5 font-medium',
                  days < 0 ? 'text-[var(--sk-red)] font-semibold' : 'text-[var(--sk-text-dim)]'
                )}
              >
                ({days >= 0 ? `${days} hr lagi` : `lewat ${-days} hr`})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Suggested Monthly Contribution (Req 7.2) */}
      {!isDone && (goal.monthlyContributionRequired > 0 || dailySuggestion) && (
        <div
          data-testid={`goal-monthly-required-${goal.id}`}
          className="mt-2 pt-2 border-t border-[var(--sk-border)]/50 flex items-center justify-between text-[11px]"
        >
          <div className="flex items-center gap-1 text-[var(--sk-cyan)] font-medium">
            <Clock className="w-3 h-3 shrink-0" />
            <span>
              Sisihkan <strong className="font-semibold">{formatIDR(goal.monthlyContributionRequired)}</strong>/bulan
            </span>
          </div>

          {dailySuggestion && (
            <span className="text-[10px] text-[var(--sk-text-dim)] tabular-nums">
              ~{formatIDRCompact(dailySuggestion)}/hari
            </span>
          )}
        </div>
      )}

      {/* Expandable Contribution Form */}
      {!isDone && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-3)] hover:text-[var(--sk-text)] transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Tutup
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Tambah tabungan
              </>
            )}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2.5 pt-2.5 border-t border-[var(--sk-border)] animate-fade-in">
              <div className="flex gap-2">
                <RupiahInput
                  value={contribRaw}
                  onChange={(_num, str) => setContribRaw(str)}
                  onKeyDown={(e) => e.key === 'Enter' && handleContribute()}
                  placeholder="Nominal tabungan cth. 100.000"
                  autoFocus
                  containerClassName="flex-1 min-w-0 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)]"
                  prefixClassName="text-xs pl-3 pr-0.5"
                  className="px-1 py-2 text-xs font-medium"
                />
                <button
                  onClick={handleContribute}
                  disabled={!parsedContrib || parsedContrib <= 0}
                  className={cn(
                    'px-3.5 rounded-xl flex items-center justify-center transition-all flex-shrink-0 font-semibold text-xs gap-1',
                    parsedContrib
                      ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_12px_var(--sk-cyan-glow)] hover:opacity-90 active:scale-95'
                      : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)] cursor-not-allowed'
                  )}
                  aria-label="Simpan kontribusi tabungan"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan</span>
                </button>
              </div>

              {/* Quick suggestion chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
                <span className="text-[var(--sk-text-dim)] shrink-0">Cepat:</span>
                {goal.monthlyContributionRequired > 0 && (
                  <button
                    type="button"
                    onClick={() => setContribRaw(String(goal.monthlyContributionRequired))}
                    className="px-2 py-1 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[var(--sk-cyan)] hover:border-[var(--sk-cyan)] transition-colors shrink-0"
                  >
                    1 Bln ({formatIDRCompact(goal.monthlyContributionRequired)})
                  </button>
                )}
                {[50_000, 100_000, 500_000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setContribRaw(String(amt))}
                    className="px-2 py-1 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[var(--sk-text-muted)] hover:border-[var(--sk-border-2)] transition-colors shrink-0"
                  >
                    +{formatIDRCompact(amt)}
                  </button>
                ))}
              </div>

              {/* Source wallet picker (Req 7.4: Non-duplicating internal allocation) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
                <span className="text-[var(--sk-text-dim)] flex-shrink-0">Sumber:</span>
                <button
                  type="button"
                  onClick={() => setFromWalletId('')}
                  className={cn(
                    'sk-suggest-chip px-2 py-1 rounded-lg border transition-colors',
                    fromWalletId === ''
                      ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]/30 font-semibold'
                      : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-dim)]'
                  )}
                >
                  Catat saja (tanpa potong saldo)
                </button>
                {wallets
                  .filter((w) => w.id !== 'tabungan')
                  .slice(0, 5)
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setFromWalletId(w.id)}
                      className={cn(
                        'sk-suggest-chip px-2 py-1 rounded-lg border transition-colors shrink-0',
                        fromWalletId === w.id
                          ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]/30 font-semibold'
                          : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-dim)]'
                      )}
                    >
                      {w.label}
                    </button>
                  ))}
              </div>

              {/* Clear feedback regarding internal transfer / no double counting */}
              <p className="text-[10px] text-[var(--sk-text-dim)] leading-relaxed">
                {fromWalletId ? (
                  <>
                    Dipindahkan dari{' '}
                    <span className="text-[var(--sk-text-muted)] font-medium">
                      {wallets.find((w) => w.id === fromWalletId)?.label}
                    </span>{' '}
                    ke <span className="text-[var(--sk-text-muted)] font-medium">Tabungan</span>. (Transfer internal, tidak menambah pengeluaran umum).
                  </>
                ) : (
                  'Hanya mencatat progres tabungan tanpa mengurangi saldo saku apa pun.'
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
})

// ── Goal Creation & Editing Form Component ───────────────────────────────────

export interface GoalFormProps {
  initial?: GoalEnhanced | Goal
  onCancel: () => void
  onSave: (data: {
    id?: string
    name: string
    label: string
    targetAmount: number
    target: number
    targetDate?: string
    deadline?: string
    note?: string
  }) => void
}

export function GoalForm({ initial, onCancel, onSave }: GoalFormProps) {
  const [label, setLabel] = useState(initial?.name || initial?.label || '')
  const [targetRaw, setTargetRaw] = useState(
    initial ? String(initial.targetAmount ?? initial.target ?? '') : ''
  )
  const initialDate = initial?.targetDate || initial?.deadline
  const [targetDate, setTargetDate] = useState(
    initialDate ? toCalendarDateString(initialDate) : ''
  )
  const [note, setNote] = useState(initial?.note || '')

  const target = parseAmountInput(targetRaw)
  const isValid = label.trim().length > 0 && target && target > 0

  // Live projection preview
  const projection = useMemo(() => {
    if (!target || target <= 0 || !targetDate) return null
    const months = calculateRemainingMonths(targetDate)
    const current = initial?.currentAmount ?? initial?.saved ?? 0
    const monthlyReq = calculateMonthlyContribution(target, current, targetDate)
    return { months, monthlyReq }
  }, [target, targetDate, initial])

  const submit = () => {
    if (!isValid || !target) return
    const cleanLabel = label.trim()
    onSave({
      id: initial?.id,
      name: cleanLabel,
      label: cleanLabel,
      targetAmount: target,
      target,
      targetDate: targetDate || undefined,
      deadline: targetDate || undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-4 shadow-[0_0_24px_var(--sk-cyan-glow)] animate-slide-up">
      <div className="flex items-center gap-2 mb-3.5">
        <Sparkles className="w-4 h-4 text-[var(--sk-cyan)]" />
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">
          {initial ? 'Edit goal tabungan' : 'Target tabungan baru'}
        </h4>
        <button
          onClick={onCancel}
          className="ml-auto text-[var(--sk-text-dim)] hover:text-[var(--sk-text-muted)] p-1 rounded-lg"
          aria-label="Tutup form"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--sk-text-dim)] mb-1">
            Nama Target
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="cth. Dana Darurat, Laptop Baru, Liburan"
            autoFocus
            className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-[var(--sk-text-dim)] mb-1">
              Nominal Target
            </label>
            <RupiahInput
              value={targetRaw}
              onChange={(_num, str) => setTargetRaw(str)}
              placeholder="cth. 10.000.000"
              containerClassName="rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)]"
              prefixClassName="text-xs pl-2.5 pr-0.5"
              className="px-1 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--sk-text-dim)] mb-1">
              Tenggat Waktu (Opsional)
            </label>
            <input
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              type="date"
              className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] focus:border-[var(--sk-cyan)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--sk-text-dim)] mb-1">
            Catatan Tambahan (Opsional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="cth. Tabungan impian untuk upgrade alat kerja"
            className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]"
          />
        </div>

        {/* Live Monthly Contribution Projection */}
        {projection && (
          <div className="rounded-xl bg-[var(--sk-surface-2)] p-2.5 border border-[var(--sk-border)] text-xs text-[var(--sk-text-muted)] flex items-start gap-2 animate-fade-in">
            <Target className="w-4 h-4 text-[var(--sk-cyan)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-[var(--sk-text)]">Proyeksi Tabungan:</p>
              <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">
                Perlu menyisihkan{' '}
                <strong className="text-[var(--sk-cyan)] font-semibold">
                  {formatIDR(projection.monthlyReq)}/bulan
                </strong>{' '}
                selama {projection.months > 0 ? `${projection.months} bulan` : 'sisa bulan ini'} untuk mencapai target tepat waktu.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!isValid}
          className={cn(
            'w-full py-2.5 rounded-xl font-semibold text-sm transition-all',
            isValid
              ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_15px_var(--sk-cyan-glow)] hover:opacity-90 active:scale-[0.98]'
              : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)] cursor-not-allowed'
          )}
        >
          {initial ? 'Simpan Perubahan' : 'Buat Target Baru'}
        </button>
      </div>
    </div>
  )
}

// ── Main Goal Planner Subsystem Component ─────────────────────────────────────

export const GoalPlanner = memo(function GoalPlanner() {
  const [goals, setGoals] = useState<GoalEnhanced[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [editing, setEditing] = useState<GoalEnhanced | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [celebratingId, setCelebratingId] = useState<string | null>(null)
  const celebratedRef = useRef<Set<string>>(new Set())
  const { transferMoney } = useWalletStore()
  const { showToast } = useFeedbackStore()

  // Hydrate post-mount to avoid SSR mismatches
  useEffect(() => {
    setGoals(loadGoals())
    celebratedRef.current = loadCelebrated()
    setHydrated(true)
  }, [])

  // Persist whenever goals change
  useEffect(() => {
    if (!hydrated) return
    saveGoals(goals)
  }, [goals, hydrated])

  // Back-stack integration for goal form / editing modal
  useEffect(() => {
    if (showForm || editing) {
      pushBackLayer({
        id: 'goal-planner-form',
        type: 'sublayer',
        onClose: () => {
          setShowForm(false)
          setEditing(null)
        },
      })
    } else {
      removeBackLayer('goal-planner-form')
    }
    return () => removeBackLayer('goal-planner-form')
  }, [showForm, editing])

  const upsertGoal = useCallback(
    (data: {
      id?: string
      name: string
      label: string
      targetAmount: number
      target: number
      targetDate?: string
      deadline?: string
      note?: string
    }) => {
      setGoals((prev) => {
        const dateStr = data.targetDate || data.deadline
        if (data.id) {
          return prev.map((g) => {
            if (g.id !== data.id) return g
            const target = data.targetAmount ?? data.target ?? g.targetAmount
            const saved = g.currentAmount ?? g.saved ?? 0
            return enhanceGoal({
              ...g,
              name: data.name,
              label: data.name,
              targetAmount: target,
              target,
              currentAmount: saved,
              saved,
              targetDate: dateStr,
              deadline: dateStr,
              note: data.note,
              updatedAt: new Date().toISOString(),
            })
          })
        }

        const fresh = enhanceGoal({
          id: generateGoalId(),
          name: data.name,
          label: data.name,
          targetAmount: data.targetAmount,
          target: data.targetAmount,
          currentAmount: 0,
          saved: 0,
          targetDate: dateStr,
          deadline: dateStr,
          note: data.note,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })

        if (dateStr) {
          void import('@/lib/achievements').then((m) => m.setFlag('sakukilat:v2:goal-deadline'))
        }
        return [fresh, ...prev]
      })
      setShowForm(false)
      setEditing(null)
      showToast(data.id ? 'Goal diperbarui.' : 'Target tabungan dibuat. Yuk mulai sisihkan!', 'success')
    },
    [showToast]
  )

  const removeGoal = useCallback(
    (id: string) => {
      setGoals((prev) => prev.filter((g) => g.id !== id))
      showToast('Goal dihapus.', 'success')
    },
    [showToast]
  )

  // Non-duplicating goal deposit allocation handler (Req 7.4)
  const contribute = useCallback(
    (id: string, amount: number, fromWalletId?: string) => {
      let goalSnapshot: GoalEnhanced | undefined

      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== id) return g
          const newSaved = (g.currentAmount ?? g.saved) + amount
          const updated = enhanceGoal({
            ...g,
            saved: newSaved,
            currentAmount: newSaved,
            updatedAt: new Date().toISOString(),
          })
          goalSnapshot = updated
          return updated
        })
      )

      if (fromWalletId) {
        // Internal savings transfer to tabungan wallet: does NOT create general income or expense records
        const note = `Tabungan: ${goalSnapshot?.name || goalSnapshot?.label || 'Goal'}`
        const ok = transferMoney(fromWalletId, 'tabungan', amount, note, 'saving')
        if (!ok) {
          // Rollback on failure
          setGoals((prev) =>
            prev.map((g) =>
              g.id === id
                ? enhanceGoal({
                    ...g,
                    saved: Math.max(0, (g.currentAmount ?? g.saved) - amount),
                    currentAmount: Math.max(0, (g.currentAmount ?? g.saved) - amount),
                  })
                : g
            )
          )
          return
        }
      } else {
        showToast(`+${formatIDRCompact(amount)} dicatat ke target.`, 'success')
      }

      // Export primary goal completion percentage to widget snapshot asynchronously (Req 7.5)
      setTimeout(() => {
        void syncWidgetSnapshot().catch(() => {})
      }, 50)

      // Milestone celebration check
      setTimeout(() => {
        setGoals((curr) => {
          const updated = curr.find((g) => g.id === id)
          const target = updated?.targetAmount ?? updated?.target ?? 0
          const current = updated?.currentAmount ?? updated?.saved ?? 0
          if (updated && current >= target && target > 0 && !celebratedRef.current.has(id)) {
            celebratedRef.current.add(id)
            saveCelebrated(celebratedRef.current)
            setCelebratingId(id)
            showToast(`Target \"${updated.name || updated.label}\" tercapai! 🎯`, 'success')
          }
          return curr
        })
      }, 60)
    },
    [transferMoney, showToast]
  )

  const totalSaved = useMemo(
    () => goals.reduce((sum, g) => sum + Math.min(g.currentAmount ?? g.saved, g.targetAmount ?? g.target), 0),
    [goals]
  )
  const totalTarget = useMemo(
    () => goals.reduce((sum, g) => sum + (g.targetAmount ?? g.target ?? 0), 0),
    [goals]
  )
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0

  // Health breakdown stats
  const healthStats = useMemo(() => {
    let aman = 0
    let perlu = 0
    let terlambat = 0
    for (const g of goals) {
      if (g.healthStatus === 'Aman') aman++
      else if (g.healthStatus === 'Perlu dipercepat') perlu++
      else if (g.healthStatus === 'Terlambat') terlambat++
    }
    return { aman, perlu, terlambat }
  }, [goals])

  return (
    <section data-testid="goal-planner-section" className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center">
          <Target className="w-4 h-4 text-[var(--sk-cyan)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--sk-text)] leading-tight">
            Target Tabungan (Goals)
          </h3>
          <p className="text-[10px] text-[var(--sk-text-dim)]">
            Perencanaan deadline, proyeksi tabungan bulanan & status kesehatan
          </p>
        </div>

        {goals.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] border border-[var(--sk-cyan)]/25 px-2.5 py-0.5 rounded-full tabular-nums">
            {overallPct}% · {goals.length} target
          </span>
        )}
      </div>

      {/* Health Overview Pills (when goals exist) */}
      {goals.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
          {healthStats.aman > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--sk-green-dim)] text-[var(--sk-green)] border border-[var(--sk-green)]/20 font-medium">
              {healthStats.aman} Aman
            </span>
          )}
          {healthStats.perlu > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] border border-[var(--sk-amber)]/20 font-medium">
              {healthStats.perlu} Perlu Dipercepat
            </span>
          )}
          {healthStats.terlambat > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--sk-red-dim)] text-[var(--sk-red)] border border-[var(--sk-red)]/20 font-medium">
              {healthStats.terlambat} Terlambat
            </span>
          )}
        </div>
      )}

      {/* Form or Add Button */}
      {showForm || editing ? (
        <GoalForm
          initial={editing ?? undefined}
          onCancel={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onSave={upsertGoal}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--sk-surface)] border border-dashed border-[var(--sk-border-2)] text-xs font-semibold text-[var(--sk-text-muted)] hover:border-[var(--sk-cyan)] hover:text-[var(--sk-cyan)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Buat target baru
        </button>
      )}

      {/* Empty State */}
      {hydrated && goals.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-[var(--sk-border-2)] p-4 text-center bg-[var(--sk-surface)]/50">
          <PiggyBank className="w-6 h-6 text-[var(--sk-text-dim)] mx-auto mb-1.5" />
          <p className="text-xs font-medium text-[var(--sk-text-muted)]">Belum ada target tabungan</p>
          <p className="mt-1 text-[11px] text-[var(--sk-text-dim)] max-w-xs mx-auto leading-relaxed">
            Mulai dengan hal kecil — tabungan darurat, upgrade gadget, atau liburan. SakuKilat akan menghitung kebutuhan tabungan per bulan secara otomatis.
          </p>
        </div>
      )}

      {/* Goal Cards List */}
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onContribute={contribute}
            onEdit={(g) => {
              setEditing(g)
              setShowForm(false)
            }}
            onRemove={removeGoal}
            celebrating={celebratingId === goal.id}
            onCelebrationDone={() => setCelebratingId(null)}
          />
        ))}
      </div>
    </section>
  )
})

// Backward-compatibility alias
export const GoalTracker = GoalPlanner
export default GoalPlanner
