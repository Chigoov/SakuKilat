/**
 * SakuKilat — Native Widget Snapshot Generator & Data Bridge (Phase P4)
 * ---------------------------------------------------------------------
 * Generates an immutable, sanitized, lightweight snapshot of the user's
 * financial state for Android native home screen widgets (RemoteViews).
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. Strict Isolation: Android widgets NEVER read or parse raw transaction ledgers.
 * 2. Bounded Size: The serialized snapshot payload is strictly bounded below 4,096 bytes.
 * 3. Zero Beranda Disruption: Operates purely as a background projection without
 *    touching or altering the in-app Beranda view.
 * 4. Offline & Durable: Synchronized to Android native SharedPreferences via @capacitor/preferences.
 */

import { formatTransactionDateTime, toCalendarDateString } from './parser.ts'
import {
  WIDGET_SNAPSHOT_KEY,
  saveWidgetSnapshotToNative,
  readWidgetSnapshotFromNative,
  triggerWidgetUpdateBroadcast,
} from './native-store.ts'

export { WIDGET_SNAPSHOT_KEY }
export const MAX_WIDGET_SNAPSHOT_SIZE = 4096

// ── Snapshot Data Contracts (Phase P4) ────────────────────────────────────────

export interface WidgetRecentTransaction {
  id: string
  description: string
  amount: number
  type: 'expense' | 'income' | 'transfer'
  formattedDate: string // e.g. "Hari ini • 14.30"
}

export interface WidgetNearestBill {
  name: string
  amount: number
  dueDateStr: string // "YYYY-MM-DD"
  isOverdue: boolean
}

export interface WidgetPrimaryGoal {
  name: string
  currentAmount: number
  targetAmount: number
  percentComplete: number // 0 - 100
}

export interface NativeWidgetSnapshot {
  version: 1
  generatedAt: number // Timestamp ms
  totalBalance: number
  monthlyExpense: number
  monthlyExpenseTxCount: number
  nearestBill?: WidgetNearestBill
  primaryGoal?: WidgetPrimaryGoal
  recentTransactions: WidgetRecentTransaction[]
  netWorth?: number
  hasUnreconciledWallets: boolean
}

export type WidgetLayoutType = 'small' | 'medium' | 'large'

// ── Input Model Types (Polymorphic & Decoupled) ──────────────────────────────

export interface SnapshotWalletItem {
  id: string
  label?: string
  balance: number
  type?: string
  lastReconciledAt?: string
}

export interface SnapshotTransactionItem {
  id: string
  description: string
  amount: number
  type: 'expense' | 'income'
  date: Date | string | number
  kind?: 'transaction' | 'transfer' | 'saving'
  category?: string
  subcategory?: string
  paymentMethod?: string
  fromWalletId?: string
  toWalletId?: string
}

export interface SnapshotBillItem {
  id?: string
  name?: string
  label?: string
  amount?: number
  input?: string
  nextDueDate?: string // "YYYY-MM-DD"
  nextDueAt?: number   // epoch ms
  dueDate?: string | Date
  dueDay?: number
  isActive?: boolean
  active?: boolean
}

export interface SnapshotGoalItem {
  id?: string
  name?: string
  label?: string
  targetAmount?: number
  target?: number
  currentAmount?: number
  saved?: number
  targetDate?: string
  deadline?: string
}

export interface SnapshotDebtItem {
  id?: string
  principalAmount?: number
  paidAmount?: number
  remainingAmount?: number
  isSettled?: boolean
}

export interface GenerateSnapshotOptions {
  transactions?: SnapshotTransactionItem[]
  wallets?: SnapshotWalletItem[]
  now?: Date | string | number
  bills?: SnapshotBillItem[]
  goals?: SnapshotGoalItem[]
  debts?: SnapshotDebtItem[]
  netWorth?: number
}

// ── Layout Dimension Mapper (Property 12 / Requirements 4.6) ──────────────────

/**
 * Maps Launcher widget cell dimensions (width in dp) to appropriate layout.
 * - Small (< 180dp): Single primary metric (Total Balance).
 * - Medium (180dp <= width < 260dp): Dual metrics (Balance + Monthly Expense).
 * - Large (>= 260dp): Summary + nearest bill + 3 recent transactions.
 */
export function getWidgetLayoutForDimensions(
  widthDp: number,
  _heightDp?: number
): WidgetLayoutType {
  if (widthDp < 180) return 'small'
  if (widthDp < 260) return 'medium'
  return 'large'
}

// ── Date and Input Helpers ───────────────────────────────────────────────────

function parseDateSafe(input: unknown): Date {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    return new Date(input)
  }
  if (typeof input === 'string') {
    const d = new Date(input)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

function isMoneyMove(t: SnapshotTransactionItem): boolean {
  return t.kind === 'transfer' || t.kind === 'saving' || t.category === 'transfer'
}

function extractAmountFromInput(input?: string): number {
  if (!input) return 0
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/i)
  if (!match) return 0
  const rawNum = parseFloat(match[1].replace(',', '.'))
  if (Number.isNaN(rawNum)) return 0
  const unit = (match[2] || '').toLowerCase()
  if (unit === 'k' || unit === 'rb' || unit === 'ribu') return Math.round(rawNum * 1_000)
  if (unit === 'jt' || unit === 'juta') return Math.round(rawNum * 1_000_000)
  return Math.round(rawNum)
}

function resolveBillDueDate(bill: SnapshotBillItem, refDate: Date): { dueDateStr: string; isOverdue: boolean } {
  const todayStr = toCalendarDateString(refDate)
  let dateStr = ''

  if (typeof bill.nextDueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(bill.nextDueDate)) {
    dateStr = bill.nextDueDate.slice(0, 10)
  } else if (typeof bill.nextDueAt === 'number' && Number.isFinite(bill.nextDueAt)) {
    dateStr = toCalendarDateString(new Date(bill.nextDueAt))
  } else if (bill.dueDate) {
    dateStr = typeof bill.dueDate === 'string' ? bill.dueDate.slice(0, 10) : toCalendarDateString(bill.dueDate)
  } else if (typeof bill.dueDay === 'number' && bill.dueDay >= 1 && bill.dueDay <= 31) {
    const year = refDate.getFullYear()
    const month = refDate.getMonth()
    const thisMonthDue = new Date(year, month, bill.dueDay)
    if (thisMonthDue >= refDate) {
      dateStr = toCalendarDateString(thisMonthDue)
    } else {
      dateStr = toCalendarDateString(new Date(year, month + 1, bill.dueDay))
    }
  }

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = todayStr
  }

  return {
    dueDateStr: dateStr,
    isOverdue: dateStr < todayStr,
  }
}

// ── Snapshot Generator ────────────────────────────────────────────────────────

/**
 * Aggregates app financial state into a compact NativeWidgetSnapshot.
 * Does not mutate inputs, and guarantees zero leakage of raw transaction ledgers.
 */
export function generateWidgetSnapshot(options: GenerateSnapshotOptions = {}): NativeWidgetSnapshot {
  const now = parseDateSafe(options.now)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-11
  const todayStr = toCalendarDateString(now)

  const wallets = Array.isArray(options.wallets) ? options.wallets : []
  const transactions = Array.isArray(options.transactions) ? options.transactions : []

  // 1. Aggregate Total Balance (sum of all wallet balances)
  const totalBalance = Math.round(
    wallets.reduce((sum, w) => sum + (Number.isFinite(Number(w.balance)) ? Number(w.balance) : 0), 0)
  )

  // 2. Aggregate Monthly Expenses (current calendar month, excluding money moves)
  let monthlyExpense = 0
  let monthlyExpenseTxCount = 0

  for (const t of transactions) {
    if (!t || isMoneyMove(t)) continue
    const txDate = parseDateSafe(t.date)
    if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
      if (t.type === 'expense') {
        const amount = Math.round(Number(t.amount) || 0)
        if (amount > 0) {
          monthlyExpense += amount
          monthlyExpenseTxCount += 1
        }
      }
    }
  }

  // 3. Extract Recent 3 Transactions (isolated metadata, sorted descending by date)
  const validTransactionsWithDate = transactions
    .filter((t): t is SnapshotTransactionItem => Boolean(t && t.id))
    .map((t) => ({ t, dateObj: parseDateSafe(t.date) }))
    .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime())

  const recentTransactions: WidgetRecentTransaction[] = validTransactionsWithDate
    .slice(0, 3)
    .map(({ t, dateObj }) => {
      const type: 'expense' | 'income' | 'transfer' = isMoneyMove(t)
        ? 'transfer'
        : t.type === 'income'
          ? 'income'
          : 'expense'
      const cleanDesc = (t.description || '').trim().slice(0, 80) || (type === 'transfer' ? 'Transfer' : 'Transaksi')
      return {
        id: String(t.id),
        description: cleanDesc,
        amount: Math.max(0, Math.round(Number(t.amount) || 0)),
        type,
        formattedDate: formatTransactionDateTime(dateObj, now),
      }
    })

  // 4. Resolve Nearest Bill (Property 16: minimum nextDueDate >= today, or closest overdue)
  let nearestBill: WidgetNearestBill | undefined
  let bills = Array.isArray(options.bills) ? options.bills : []
  if (bills.length === 0 && options.bills === undefined && typeof window !== 'undefined') {
    try {
      const stateRaw = window.localStorage.getItem('sakukilat:v2:local-state')
      if (stateRaw) {
        const parsedState = JSON.parse(stateRaw)
        if (Array.isArray(parsedState?.bills)) {
          bills = parsedState.bills
        }
      }
      if (bills.length === 0) {
        const raw = window.localStorage.getItem('sakukilat:v2:recurring') || window.localStorage.getItem('sakukilat:v2:bills')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) bills = parsed
        }
      }
    } catch {
      /* ignore */
    }
  }
  const activeBills = bills.filter((b) => b && b.isActive !== false && b.active !== false)

  if (activeBills.length > 0) {
    const evaluatedBills = activeBills.map((b) => {
      const { dueDateStr, isOverdue } = resolveBillDueDate(b, now)
      const amount = Math.round(Number(b.amount) || extractAmountFromInput(b.input) || 0)
      const name = (b.name || b.label || 'Tagihan').trim().slice(0, 50) || 'Tagihan'
      return { name, amount, dueDateStr, isOverdue }
    })

    const upcoming = evaluatedBills
      .filter((b) => !b.isOverdue)
      .sort((a, b) => a.dueDateStr.localeCompare(b.dueDateStr))

    if (upcoming.length > 0) {
      nearestBill = upcoming[0]
    } else {
      // If all bills are overdue, pick closest overdue bill (descending by dueDateStr)
      const overdue = evaluatedBills.sort((a, b) => b.dueDateStr.localeCompare(a.dueDateStr))
      nearestBill = overdue[0]
    }
  }

  // 5. Resolve Primary Goal
  let primaryGoal: WidgetPrimaryGoal | undefined
  let goals = Array.isArray(options.goals) ? options.goals : []
  if (goals.length === 0 && options.goals === undefined && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('sakukilat:v2:goals')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) goals = parsed
      }
    } catch {
      /* ignore */
    }
  }
  const activeGoals = goals.filter((g) => Boolean(g && (g.name || g.label)))

  if (activeGoals.length > 0) {
    // Pick the primary goal (first uncompleted goal with target > 0, or first goal with target > 0, or first goal)
    const uncompleted = activeGoals.find((item) => {
      const t = Number(item.targetAmount ?? item.target) || 0
      const c = Number(item.currentAmount ?? item.saved) || 0
      return t > 0 && c < t
    })
    const g = uncompleted || activeGoals.find((item) => (item.targetAmount ?? item.target ?? 0) > 0) || activeGoals[0]
    const targetAmount = Math.max(0, Math.round(Number(g.targetAmount ?? g.target) || 0))
    const currentAmount = Math.max(0, Math.round(Number(g.currentAmount ?? g.saved) || 0))
    const percentComplete = targetAmount > 0
      ? Math.min(100, Math.max(0, Math.round((currentAmount / targetAmount) * 100)))
      : 0
    const name = (g.name || g.label || 'Target').trim().slice(0, 50) || 'Target'

    primaryGoal = {
      name,
      currentAmount,
      targetAmount,
      percentComplete,
    }
  }

  // 6. Check Unreconciled Wallets Indicator (Property 19: warning if lastReconciledAt is undefined)
  const hasUnreconciledWallets = wallets.length > 0 && wallets.some((w) => w && w.lastReconciledAt === undefined)

  // 7. Calculate Net Worth (Property 28: totalAssets - totalLiabilities)
  let netWorth: number | undefined
  if (options.netWorth !== undefined && Number.isFinite(options.netWorth)) {
    netWorth = Math.round(options.netWorth)
  } else if (Array.isArray(options.debts)) {
    const totalAssets = wallets
      .filter((w) => Boolean(w && Number.isFinite(Number(w.balance)) && Number(w.balance) > 0))
      .reduce((sum, w) => sum + Number(w.balance), 0)
    const totalLiabilities = options.debts
      .filter((d) => Boolean(d && !d.isSettled))
      .reduce((sum, d) => {
        const remaining = d.remainingAmount !== undefined && Number.isFinite(Number(d.remainingAmount))
          ? Number(d.remainingAmount)
          : Math.max(0, (Number(d.principalAmount) || 0) - (Number(d.paidAmount) || 0))
        return sum + Math.max(0, Math.round(remaining))
      }, 0)
    netWorth = Math.round(totalAssets - totalLiabilities)
  } else {
    netWorth = totalBalance
  }

  const snapshot: NativeWidgetSnapshot = {
    version: 1,
    generatedAt: now.getTime(),
    totalBalance,
    monthlyExpense,
    monthlyExpenseTxCount,
    nearestBill,
    primaryGoal,
    recentTransactions,
    netWorth,
    hasUnreconciledWallets,
  }

  return enforceSnapshotSizeBound(snapshot)
}

// ── Serialization & Payload Size Enforcement ──────────────────────────────────

/**
 * Enforces that the snapshot strictly stays within MAX_WIDGET_SNAPSHOT_SIZE (4,096 bytes).
 * If needed, truncates text fields defensively.
 */
function enforceSnapshotSizeBound(snapshot: NativeWidgetSnapshot): NativeWidgetSnapshot {
  let json = JSON.stringify(snapshot)
  if (json.length < MAX_WIDGET_SNAPSHOT_SIZE) {
    return snapshot
  }

  // Defensively trim recent transaction descriptions
  const trimmed = {
    ...snapshot,
    recentTransactions: snapshot.recentTransactions.map((tx) => ({
      ...tx,
      description: tx.description.slice(0, 30),
    })),
    nearestBill: snapshot.nearestBill
      ? { ...snapshot.nearestBill, name: snapshot.nearestBill.name.slice(0, 30) }
      : undefined,
    primaryGoal: snapshot.primaryGoal
      ? { ...snapshot.primaryGoal, name: snapshot.primaryGoal.name.slice(0, 30) }
      : undefined,
  }

  json = JSON.stringify(trimmed)
  if (json.length < MAX_WIDGET_SNAPSHOT_SIZE) {
    return trimmed
  }

  // If still oversized, omit optional metadata
  const minimal: NativeWidgetSnapshot = {
    version: 1,
    generatedAt: snapshot.generatedAt,
    totalBalance: snapshot.totalBalance,
    monthlyExpense: snapshot.monthlyExpense,
    monthlyExpenseTxCount: snapshot.monthlyExpenseTxCount,
    recentTransactions: trimmed.recentTransactions.slice(0, 1),
    hasUnreconciledWallets: snapshot.hasUnreconciledWallets,
  }
  return minimal
}

export function serializeWidgetSnapshot(snapshot: NativeWidgetSnapshot): string {
  const bounded = enforceSnapshotSizeBound(snapshot)
  const serialized = JSON.stringify(bounded)
  if (serialized.length >= MAX_WIDGET_SNAPSHOT_SIZE) {
    throw new Error(`Widget snapshot size exceeds limit: ${serialized.length} >= ${MAX_WIDGET_SNAPSHOT_SIZE}`)
  }
  return serialized
}

export function parseWidgetSnapshot(raw: string | null | undefined): NativeWidgetSnapshot | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as NativeWidgetSnapshot
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.generatedAt === 'number' &&
      typeof parsed.totalBalance === 'number' &&
      typeof parsed.monthlyExpense === 'number' &&
      typeof parsed.monthlyExpenseTxCount === 'number' &&
      Array.isArray(parsed.recentTransactions)
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

// ── Storage Synchronization & Native Bridge ───────────────────────────────────

/**
 * Generates the snapshot, writes it to native storage via @capacitor/preferences
 * under key `sakukilat:v2:widget-snapshot`, and dispatches an update broadcast.
 */
export async function syncWidgetSnapshot(
  options: GenerateSnapshotOptions = {}
): Promise<NativeWidgetSnapshot> {
  const snapshot = generateWidgetSnapshot(options)
  const json = serializeWidgetSnapshot(snapshot)

  await saveWidgetSnapshotToNative(json)
  await triggerWidgetUpdateBroadcast()

  return snapshot
}

/**
 * Loads the current widget snapshot from native storage.
 */
export async function loadWidgetSnapshot(): Promise<NativeWidgetSnapshot | null> {
  const raw = await readWidgetSnapshotFromNative()
  return parseWidgetSnapshot(raw)
}
