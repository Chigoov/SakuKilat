'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Sparkles, Target, Trash2, Trophy, X } from 'lucide-react'
import { useFeedbackStore, useWalletStore } from '@/lib/store'
import { formatIDR, formatIDRCompact } from '@/lib/parser'
import { formatNaturalAmountInput, parseAmountInput } from '@/lib/amount'
import { mirrorToNative, scheduleFileBackup } from '@/lib/native-store'
import { appScopedKey } from '@/lib/app-variant'
import { cn } from '@/lib/utils'

/**
 * SakuKilat Goal Tracker
 * ----------------------
 * Self-contained, localStorage-persisted. Each goal is a "wish counter"
 * with optional deadline. Contributing optionally transfers real money
 * from a saku into the savings wallet (one-way coupling, no double-book).
 *
 * Storage key: sakukilat:v2:goals
 */

export interface Goal {
  id: string
  label: string
  target: number
  saved: number
  deadline?: string // ISO date
  createdAt: string
}

export const GOAL_STORAGE_KEY = appScopedKey('goals')
const CELEBRATED_KEY = appScopedKey('celebrated-goals')

function isGoal(value: unknown): value is Goal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Goal).id === 'string' &&
    typeof (value as Goal).label === 'string' &&
    typeof (value as Goal).target === 'number' &&
    typeof (value as Goal).saved === 'number'
  )
}

function loadGoals(): Goal[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Goal[]
    const cleaned = Array.isArray(parsed) ? parsed.filter(isGoal) : []
    if (!Array.isArray(parsed) || cleaned.length !== parsed.length) saveGoals(cleaned)
    return cleaned
  } catch { return [] }
}

export function readGoalSnapshot(): Goal[] {
  return loadGoals()
}

export function createGoalSnapshot(input: Pick<Goal, 'label' | 'target' | 'deadline'>): Goal | null {
  const label = input.label.trim()
  const target = Math.round(input.target)
  if (!label || !Number.isFinite(target) || target <= 0) return null

  const fresh: Goal = {
    id: generateGoalId(),
    label,
    target,
    saved: 0,
    deadline: input.deadline,
    createdAt: new Date().toISOString(),
  }
  saveGoals([fresh, ...loadGoals()])
  return fresh
}

function saveGoals(goals: Goal[]) {
  if (typeof window === 'undefined') return
  try {
    const json = JSON.stringify(goals)
    window.localStorage.setItem(GOAL_STORAGE_KEY, json)
    mirrorToNative(GOAL_STORAGE_KEY, json)
    scheduleFileBackup()
    window.dispatchEvent(new CustomEvent('sakukilat:goals-changed'))
  } catch { /* quota */ }
}

export function contributeToGoalSnapshot(id: string, amount: number): Goal | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const goals = loadGoals()
  let updated: Goal | null = null
  const nextGoals = goals.map((goal) => {
    if (goal.id !== id) return goal
    updated = { ...goal, saved: goal.saved + Math.round(amount) }
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
  } catch { return new Set() }
}

function saveCelebrated(set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const json = JSON.stringify([...set])
    window.localStorage.setItem(CELEBRATED_KEY, json)
    mirrorToNative(CELEBRATED_KEY, json)
    scheduleFileBackup()
  } catch { /* quota */ }
}

function generateGoalId(): string {
  return 'g_' + Math.random().toString(36).slice(2, 10)
}

function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null
  const target = new Date(iso)
  if (!Number.isFinite(target.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const goalDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((goalDay.getTime() - today.getTime()) / 86_400_000)
}

// ── Mini confetti for goal milestones ────────────────────────────────
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
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative">
        {particles.map(p => (
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

// ── Single goal card with progress + actions ───────────────
interface GoalCardProps {
  goal: Goal
  onContribute: (id: string, amount: number, fromWalletId?: string) => void
  onEdit: (goal: Goal) => void
  onRemove: (id: string) => void
  celebrating: boolean
  onCelebrationDone: () => void
}

const GoalCard = memo(function GoalCard({ goal, onContribute, onEdit, onRemove, celebrating, onCelebrationDone }: GoalCardProps) {
  const { wallets } = useWalletStore()
  const [expanded, setExpanded] = useState(false)
  const [contribRaw, setContribRaw] = useState('')
  const [fromWalletId, setFromWalletId] = useState<string>('')
  const parsedContrib = parseAmountInput(contribRaw)
  const progress = Math.min(1, goal.saved / Math.max(1, goal.target))
  const pct = Math.round(progress * 100)
  const remaining = Math.max(0, goal.target - goal.saved)
  const days = daysUntil(goal.deadline)
  const isDone = goal.saved >= goal.target
  const dailySuggestion = days && days > 0 && !isDone
    ? Math.ceil(remaining / days)
    : null

  const handleContribute = () => {
    if (!parsedContrib || parsedContrib <= 0) return
    onContribute(goal.id, parsedContrib, fromWalletId || undefined)
    setContribRaw('')
    setExpanded(false)
  }

  const barColor = isDone
    ? 'bg-[var(--sk-green)]'
    : progress >= 0.66
      ? 'bg-[var(--sk-cyan)]'
      : progress >= 0.33
        ? 'bg-[var(--sk-amber)]'
        : 'bg-[var(--sk-text-dim)]'

  return (
    <div className={cn(
      'relative rounded-2xl bg-[var(--sk-surface)] border p-3.5 transition-colors',
      isDone
        ? 'border-[var(--sk-green)] shadow-[0_0_24px_rgba(52,211,153,0.18)]'
        : 'border-[var(--sk-border)]'
    )}>
      {celebrating && <GoalConfetti onDone={onCelebrationDone} />}

      <div className="flex items-start gap-2 mb-2">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isDone ? 'bg-[var(--sk-green-dim)]' : 'bg-[var(--sk-cyan-dim)]'
        )}>
          {isDone
            ? <Trophy className="w-4 h-4 text-[var(--sk-green)]" />
            : <Target className="w-4 h-4 text-[var(--sk-cyan)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--sk-text)] truncate">{goal.label}</p>
          <p className="text-[10px] text-[var(--sk-text-dim)] tabular-nums">
            {formatIDRCompact(goal.saved)} / {formatIDRCompact(goal.target)}
            {days !== null && (
              <span className={cn('ml-2', days < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text-muted)]')}>
                {isDone ? 'tercapai!' : days >= 0 ? `${days} hari lagi` : `lewat ${-days} hari`}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => onEdit(goal)}
          aria-label="Edit goal"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)]"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onRemove(goal.id)}
          aria-label="Hapus goal"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-red-dim)] hover:text-[var(--sk-red)]"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="relative h-2 rounded-full bg-[var(--sk-surface-2)] overflow-hidden">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="tabular-nums text-[var(--sk-text-muted)] font-medium">{pct}%</span>
        {dailySuggestion && (
          <span className="text-right text-[var(--sk-text-dim)]">
            Sisihkan ~<span className="text-[var(--sk-cyan)] font-semibold">{formatIDRCompact(dailySuggestion)}</span>/hari
          </span>
        )}
        {isDone && (
          <span className="text-[var(--sk-green)] font-semibold inline-flex items-center gap-1">
            <Check className="w-3 h-3" /> Selesai
          </span>
        )}
      </div>

      {!isDone && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2.5 text-[12px] font-semibold text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-3)]"
          >
            {expanded
              ? <><ChevronUp className="w-3.5 h-3.5" /> Tutup</>
              : <><Plus className="w-3.5 h-3.5" /> Tambah kontribusi</>}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1.5">
                <input
                  value={contribRaw}
                  onChange={e => setContribRaw(formatNaturalAmountInput(e.target.value))}
                  onKeyDown={e => e.key === 'Enter' && handleContribute()}
                  placeholder="cth. 100k"
                  inputMode="decimal"
                  autoFocus
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]"
                />
                <button
                  onClick={handleContribute}
                  disabled={!parsedContrib || parsedContrib <= 0}
                  className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0',
                    parsedContrib
                      ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_10px_var(--sk-cyan-glow)] hover:opacity-90 active:scale-95'
                      : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)]'
                  )}
                  aria-label="Simpan kontribusi"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
                <span className="text-[var(--sk-text-dim)] flex-shrink-0">Sumber:</span>
                <button
                  type="button"
                  onClick={() => setFromWalletId('')}
                  className={cn(
                    'sk-suggest-chip',
                    fromWalletId === '' && 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[rgba(56,189,248,0.3)]'
                  )}
                >
                  Catat saja
                </button>
                {wallets.filter(w => w.id !== 'tabungan').slice(0, 5).map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setFromWalletId(w.id)}
                    className={cn(
                      'sk-suggest-chip',
                      fromWalletId === w.id && 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[rgba(56,189,248,0.3)]'
                    )}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              {fromWalletId && (
                <p className="text-[10px] text-[var(--sk-text-dim)] leading-relaxed">
                  Akan dipindahkan dari <span className="text-[var(--sk-text-muted)] font-medium">{wallets.find(w => w.id === fromWalletId)?.label}</span> ke <span className="text-[var(--sk-text-muted)] font-medium">Tabungan</span>.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
})

// ── Goal form (create/edit) ──────────────────────────────
interface GoalFormProps {
  initial?: Goal
  onCancel: () => void
  onSave: (data: Omit<Goal, 'id' | 'createdAt' | 'saved'> & { id?: string }) => void
}

function GoalForm({ initial, onCancel, onSave }: GoalFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [targetRaw, setTargetRaw] = useState(initial ? String(initial.target) : '')
  const [deadline, setDeadline] = useState(initial?.deadline?.slice(0, 10) ?? '')
  const target = parseAmountInput(targetRaw)
  const isValid = label.trim().length > 0 && target && target > 0

  const submit = () => {
    if (!isValid || !target) return
    onSave({
      id: initial?.id,
      label: label.trim(),
      target,
      deadline: deadline || undefined,
    })
  }

  return (
    <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-3.5 shadow-[0_0_20px_var(--sk-cyan-glow)] animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[var(--sk-cyan)]" />
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">
          {initial ? 'Edit goal' : 'Goal baru'}
        </h4>
        <button onClick={onCancel} className="ml-auto text-[var(--sk-text-dim)] hover:text-[var(--sk-text-muted)]" aria-label="Tutup">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Apa yang mau dicapai? cth. Laptop baru"
          autoFocus
          className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={targetRaw}
            onChange={e => setTargetRaw(formatNaturalAmountInput(e.target.value))}
            placeholder="Target (5jt)"
            inputMode="decimal"
            className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)] tabular-nums"
          />
          <input
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            type="date"
            className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] focus:border-[var(--sk-cyan)]"
          />
        </div>
        {target ? (
          <p className="text-[10px] text-[var(--sk-text-dim)] tabular-nums">
            Target: <span className="text-[var(--sk-text-muted)] font-semibold">{formatIDR(target)}</span>
          </p>
        ) : null}
        <button
          onClick={submit}
          disabled={!isValid}
          className={cn(
            'w-full py-2 rounded-xl font-semibold text-sm transition-all',
            isValid
              ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_15px_var(--sk-cyan-glow)] hover:opacity-90 active:scale-[0.98]'
              : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)]'
          )}
        >
          {initial ? 'Simpan perubahan' : 'Buat goal'}
        </button>
      </div>
    </div>
  )
}

// ── Public Goal Tracker section ───────────────────────────
export const GoalTracker = memo(function GoalTracker() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [celebratingId, setCelebratingId] = useState<string | null>(null)
  const celebratedRef = useRef<Set<string>>(new Set())
  const { transferMoney } = useWalletStore()
  const { showToast } = useFeedbackStore()

  // hydrate post-mount to avoid SSR mismatch
  useEffect(() => {
    setGoals(loadGoals())
    celebratedRef.current = loadCelebrated()
    setHydrated(true)
  }, [])

  // persist whenever goals change
  useEffect(() => {
    if (!hydrated) return
    saveGoals(goals)
  }, [goals, hydrated])

  const upsertGoal = useCallback((data: Omit<Goal, 'id' | 'createdAt' | 'saved'> & { id?: string }) => {
    setGoals(prev => {
      if (data.id) {
        return prev.map(g => g.id === data.id
          ? { ...g, label: data.label, target: data.target, deadline: data.deadline }
          : g
        )
      }
      const fresh: Goal = {
        id: generateGoalId(),
        label: data.label,
        target: data.target,
        saved: 0,
        deadline: data.deadline,
        createdAt: new Date().toISOString(),
      }
      if (data.deadline) {
        void import('@/lib/achievements').then(m => m.setFlag('sakukilat:v2:goal-deadline'))
      }
      return [fresh, ...prev]
    })
    setShowForm(false)
    setEditing(null)
    showToast(data.id ? 'Goal diperbarui.' : 'Goal dibuat. Yuk mulai sisihkan!', 'success')
  }, [showToast])

  const removeGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id))
    showToast('Goal dihapus.', 'success')
  }, [showToast])

  const contribute = useCallback((id: string, amount: number, fromWalletId?: string) => {
    let goalSnapshot: Goal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== id) return g
      goalSnapshot = g
      return { ...g, saved: g.saved + amount }
    }))

    if (fromWalletId) {
      const ok = transferMoney(fromWalletId, 'tabungan', amount, goalSnapshot?.label ?? 'Kontribusi goal', 'saving')
      if (!ok) {
        // rollback the increment
        setGoals(prev => prev.map(g => g.id === id ? { ...g, saved: Math.max(0, g.saved - amount) } : g))
        return
      }
    } else {
      showToast(`+${formatIDRCompact(amount)} ke goal.`, 'success')
    }

    // milestone check
    setTimeout(() => {
      setGoals(curr => {
        const updated = curr.find(g => g.id === id)
        if (updated && updated.saved >= updated.target && !celebratedRef.current.has(id)) {
          celebratedRef.current.add(id)
          saveCelebrated(celebratedRef.current)
          setCelebratingId(id)
          showToast(`Goal \"${updated.label}\" tercapai! 🎯`, 'success')
        }
        return curr
      })
    }, 50)
  }, [transferMoney, showToast])

  const totalSaved = useMemo(() => goals.reduce((sum, g) => sum + Math.min(g.saved, g.target), 0), [goals])
  const totalTarget = useMemo(() => goals.reduce((sum, g) => sum + g.target, 0), [goals])
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center">
          <Target className="w-4 h-4 text-[var(--sk-cyan)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--sk-text)]">Goal Tabungan</h3>
        {goals.length > 0 && (
          <span className="ml-auto text-xs font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full tabular-nums">
            {overallPct}% · {goals.length}
          </span>
        )}
      </div>

      {showForm || editing ? (
        <GoalForm
          initial={editing ?? undefined}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          onSave={upsertGoal}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--sk-surface)] border border-dashed border-[var(--sk-border-2)] text-xs font-semibold text-[var(--sk-text-muted)] hover:border-[var(--sk-cyan)] hover:text-[var(--sk-cyan)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Buat goal baru
        </button>
      )}

      {hydrated && goals.length === 0 && !showForm && (
        <p className="mt-3 text-[11px] text-[var(--sk-text-dim)] text-center leading-relaxed">
          Belum ada goal. Mulai dengan menabung untuk hal kecil dulu — misal kopi spesial atau buku baru.
        </p>
      )}

      <div className="mt-3 space-y-2.5">
        {goals.map(goal => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onContribute={contribute}
            onEdit={(g) => { setEditing(g); setShowForm(false) }}
            onRemove={removeGoal}
            celebrating={celebratingId === goal.id}
            onCelebrationDone={() => setCelebratingId(null)}
          />
        ))}
      </div>
    </section>
  )
})
