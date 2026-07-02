'use client'

/**
 * SakuKilat — Recurring Transactions
 * -----------------------------------------------
 * Local-first scheduled entries. Templates live in localStorage and get
 * auto-fired into the main transaction store when the user opens the app
 * if their nextDueAt is <= now.
 *
 * Why a hook + not part of store.tsx: keeps the main store stable.
 * The recurring engine only needs to read & call `addTransaction`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { appScopedKey } from '@/lib/app-variant'
import { mirrorToNative, scheduleFileBackup } from '@/lib/native-store'

export type RecurringCadence = 'daily' | 'weekly' | 'monthly'

export interface RecurringTemplate {
  id: string
  /** raw input string — replayed through the same NL parser used for live input. */
  input: string
  /** human-friendly label shown in the manager UI. */
  label: string
  cadence: RecurringCadence
  /** epoch ms when this template should next fire. */
  nextDueAt: number
  /** epoch ms of the last successful firing (null if never). */
  lastFiredAt: number | null
  active: boolean
  createdAt: number
}

const STORAGE_KEY = appScopedKey('recurring')
const MS_DAY = 24 * 60 * 60 * 1000

// ── Storage helpers ──────────────────────────────────────────────────────────
function loadFromStorage(): RecurringTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      saveToStorage([])
      return []
    }
    const cleaned = parsed.filter((t): t is RecurringTemplate =>
      typeof t === 'object' && t !== null
      && typeof t.id === 'string'
      && typeof t.input === 'string'
      && typeof t.nextDueAt === 'number'
      && (t.cadence === 'daily' || t.cadence === 'weekly' || t.cadence === 'monthly')
    )
    if (cleaned.length !== parsed.length) saveToStorage(cleaned)
    return cleaned
  } catch {
    return []
  }
}

function saveToStorage(templates: RecurringTemplate[]): void {
  if (typeof window === 'undefined') return
  try {
    const json = JSON.stringify(templates)
    window.localStorage.setItem(STORAGE_KEY, json)
    mirrorToNative(STORAGE_KEY, json)
    scheduleFileBackup()
  } catch {
    /* quota / private mode — silently ignore */
  }
}

// ── Cadence math ────────────────────────────────────────────────────────────
/** Returns the NEXT nextDueAt after firing at `firedAt`. */
export function advanceDueDate(cadence: RecurringCadence, firedAt: number): number {
  const d = new Date(firedAt)
  switch (cadence) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
  }
  return d.getTime()
}

export function cadenceLabel(cadence: RecurringCadence): string {
  return cadence === 'daily' ? 'Tiap hari'
    : cadence === 'weekly' ? 'Tiap minggu'
    : 'Tiap bulan'
}

function genId(): string {
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Hook ────────────────────────────────────────────────────────────────────
export interface UseRecurringResult {
  templates: RecurringTemplate[]
  /** Add a new recurring template. The first fire happens immediately on next open of the app. */
  addTemplate: (input: { input: string; label: string; cadence: RecurringCadence; firstRunAt?: number }) => void
  removeTemplate: (id: string) => void
  toggleActive: (id: string) => void
  /** Manually fire a single template now (does not affect schedule). */
  fireNow: (id: string) => Promise<boolean>
  /** Number of templates currently due (debug / UI badge). */
  dueCount: number
}

/**
 * Wires recurring templates to the main addTransaction action.
 *
 * @param addTransaction the same action exposed by `useTransactionActions()`.
 *                       Wrapped here so the hook stays decoupled from the store.
 */
export function useRecurringTransactions(
  addTransaction: (input: string) => Promise<boolean>
): UseRecurringResult {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [hydrated, setHydrated] = useState(false)
  /** Prevent firing storm during dev double-effect / strict mode. */
  const firingRef = useRef(false)
  const mountedRef = useRef(true)

  // hydrate from localStorage on mount
  useEffect(() => {
    setTemplates(loadFromStorage())
    setHydrated(true)
    return () => {
      mountedRef.current = false
    }
  }, [])

  // persist whenever templates change post-hydration
  useEffect(() => {
    if (!hydrated) return
    saveToStorage(templates)
  }, [templates, hydrated])

  // run any due recurring entries on mount (and when templates change after hydrate)
  useEffect(() => {
    if (!hydrated || firingRef.current) return
    const now = Date.now()
    const due = templates.filter(t => t.active && t.nextDueAt <= now)
    if (due.length === 0) return

    firingRef.current = true
    void (async () => {
      try {
        const updated: RecurringTemplate[] = []
        for (const t of templates) {
          if (!(t.active && t.nextDueAt <= now)) {
            updated.push(t)
            continue
          }
          // Catch-up: fire ONCE for templates that are overdue, then advance to
          // the most recent future date. We don't spam back-fills (user can
          // manually fireNow if they need historical data).
          const ok = await addTransaction(t.input)
          if (!mountedRef.current) return
          if (!ok) {
            updated.push(t) // leave as-is, retry next session
            continue
          }
          let nextDue = advanceDueDate(t.cadence, t.nextDueAt)
          while (nextDue <= now) {
            nextDue = advanceDueDate(t.cadence, nextDue)
          }
          updated.push({ ...t, nextDueAt: nextDue, lastFiredAt: now })
        }
        setTemplates(updated)
      } catch {
        // ponytail: failed auto-fire stays due and retries on next app open.
      } finally {
        if (mountedRef.current) firingRef.current = false
      }
    })()
  }, [hydrated, templates, addTransaction])

  const addTemplate = useCallback<UseRecurringResult['addTemplate']>(({ input, label, cadence, firstRunAt }) => {
    const now = Date.now()
    const tpl: RecurringTemplate = {
      id: genId(),
      input: input.trim(),
      label: (label || input).trim().slice(0, 60),
      cadence,
      // default first run: tomorrow same time. If firstRunAt is set, use it.
      nextDueAt: firstRunAt ?? now + MS_DAY,
      lastFiredAt: null,
      active: true,
      createdAt: now,
    }
    setTemplates(prev => [tpl, ...prev])
  }, [])

  const removeTemplate = useCallback((id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
  }, [])

  const toggleActive = useCallback((id: string) => {
    setTemplates(prev => prev.map(t => (t.id === id ? { ...t, active: !t.active } : t)))
  }, [])

  const fireNow = useCallback(async (id: string): Promise<boolean> => {
    const tpl = templates.find(t => t.id === id)
    if (!tpl) return false
    const ok = await addTransaction(tpl.input)
    if (!ok) return false
    setTemplates(prev =>
      prev.map(t => (t.id === id ? { ...t, lastFiredAt: Date.now() } : t))
    )
    return true
  }, [templates, addTransaction])

  const dueCount = templates.filter(t => t.active && t.nextDueAt <= Date.now()).length

  return { templates, addTemplate, removeTemplate, toggleActive, fireNow, dueCount }
}
