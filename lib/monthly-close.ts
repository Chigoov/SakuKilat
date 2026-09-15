/**
 * SakuKilat — Monthly Financial Close (Tutup Bulan, Phase P9)
 * -----------------------------------------------------------
 * Implements pre-closing checklist validation, monthly financial summary
 * compilation, period locking with timestamp, and audit trail reopening.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 * Properties: 26, 27
 */

import type { Transaction, WalletAccount } from './mock-data.ts'
import type { WalletReconciliation } from './reconciliation.ts'
import type { Bill } from './bills.ts'
import type { InboxTransactionItem } from './rules-inbox.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
  formatIDR,
} from './parser.ts'

// ── Types & Interfaces ────────────────────────────────────────────────────────

export interface MonthlyCloseRecord {
  /** Identifier with format "YYYY-MM", e.g. "2026-03" */
  id: string
  year: number
  /** Calendar month (1 - 12) */
  month: number
  /** ISO timestamp string of when the month was closed */
  closedAt: string
  incomeTotal: number
  expenseTotal: number
  /** Guaranteed net savings: incomeTotal - expenseTotal */
  netSavings: number
  /** Aggregate reconciliation variances recorded in target month */
  unreconciledVariances: number
  isReopened: boolean
  reopenedAt?: string
  reopenedNote?: string
}

export interface MonthlyFinancialSummary {
  year: number
  month: number
  monthId: string
  incomeTotal: number
  expenseTotal: number
  netSavings: number
  transactionCount: number
  incomeCount: number
  expenseCount: number
  transferCount: number
  unreconciledVariances: number
  reconciliationsCount: number
}

export interface PreClosingChecklistItems {
  uncategorizedTransactions: {
    isPassed: boolean
    count: number
    transactions: Transaction[]
  }
  pendingInbox: {
    isPassed: boolean
    count: number
    items: InboxTransactionItem[]
  }
  unreconciledWallets: {
    isPassed: boolean
    count: number
    wallets: WalletAccount[]
  }
  overdueBills: {
    isPassed: boolean
    count: number
    bills: Bill[]
  }
}

export interface PreClosingChecklistResult {
  year: number
  month: number
  monthId: string
  isReadyToClose: boolean
  items: PreClosingChecklistItems
  /** Count of failing checklist categories (0 to 4) */
  totalViolations: number
  /** Sum of offending items across all categories */
  totalIssuesCount: number
}

export interface PreClosingChecklistOptions {
  referenceDate?: Date | string | number
  hiddenWalletIds?: string[]
}

export interface CreateMonthlyCloseParams {
  year: number
  month: number
  transactions: Transaction[]
  reconciliations?: WalletReconciliation[]
  closedAt?: string | Date
  overrideValidation?: boolean
}

// ── Month Formatting & Parsing Helpers ────────────────────────────────────────

const INDONESIAN_MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

/**
 * Formats calendar year and month into canonical month ID ("YYYY-MM").
 * E.g., 2026, 3 -> "2026-03"
 */
export function formatMonthId(year: number, month: number): string {
  const y = Math.round(year)
  const m = Math.max(1, Math.min(12, Math.round(month)))
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Parses a canonical month ID ("YYYY-MM") into structured year and month.
 */
export function parseMonthId(id: string): { year: number; month: number } {
  if (typeof id !== 'string') {
    throw new Error(`Format ID bulan tidak valid: ${String(id)}`)
  }
  const match = id.trim().match(/^(\d{4})-(\d{1,2})$/)
  if (!match) {
    throw new Error(`Format ID bulan harus "YYYY-MM", diterima: "${id}"`)
  }
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  if (month < 1 || month > 12) {
    throw new Error(`Bulan harus di antara 1 - 12, diterima: ${month}`)
  }
  return { year, month }
}

/**
 * Formats year and month into localized Indonesian label.
 * E.g., 2026, 3 -> "Maret 2026"
 */
export function formatMonthLabel(year: number, month: number): string {
  const m = Math.max(1, Math.min(12, Math.round(month)))
  return `${INDONESIAN_MONTH_NAMES[m - 1]} ${year}`
}

/**
 * Checks if a given date string, number, or Date instance matches the target year and month.
 * Uses calendar date extraction unaffected by UTC timezone shifts.
 */
export function matchesMonth(
  dateInput: Date | string | number | undefined | null,
  targetYear: number,
  targetMonth: number
): boolean {
  if (!dateInput) return false
  const parts = toTransactionDateParts(dateInput)
  return parts.year === targetYear && parts.month === targetMonth
}

/**
 * Checks if a transaction is an internal money move (transfer or saving).
 */
export function isMoneyMove(tx: Transaction): boolean {
  return tx.kind === 'transfer' || tx.kind === 'saving'
}

// ── Item Validation Predicates ────────────────────────────────────────────────

/**
 * Checks if a transaction is uncategorized.
 * Transfers and savings are internal movements, so they are not uncategorized.
 * Any expense or income with empty category, 'lainnya', or 'uncategorized' is considered uncategorized.
 */
export function isUncategorizedTransaction(tx: Transaction): boolean {
  if (isMoneyMove(tx)) return false
  if (!tx.category || typeof tx.category !== 'string') return true
  const norm = tx.category.trim().toLowerCase()
  return norm === '' || norm === 'lainnya' || norm === 'uncategorized'
}

/**
 * Checks if an inbox item is pending and belongs to target month.
 */
export function isPendingInboxItemInMonth(
  item: InboxTransactionItem,
  targetYear: number,
  targetMonth: number
): boolean {
  if (item.status !== 'pending') return false
  return matchesMonth(item.date, targetYear, targetMonth)
}

/**
 * Checks if a wallet has been reconciled in the target month.
 * A wallet is reconciled if there is at least one reconciliation record
 * recorded within the target month.
 */
export function isWalletReconciledInMonth(
  wallet: WalletAccount,
  reconciliations: WalletReconciliation[],
  targetYear: number,
  targetMonth: number
): boolean {
  const hasReconciliationRecord = reconciliations.some(
    r => r.walletId === wallet.id && matchesMonth(r.reconciledAt, targetYear, targetMonth)
  )
  if (hasReconciliationRecord) return true

  if (wallet.lastReconciledAt && matchesMonth(wallet.lastReconciledAt, targetYear, targetMonth)) {
    return true
  }

  return false
}

/**
 * Checks if a bill is active, unpaid, and overdue relative to the target month.
 *
 * Rules:
 * 1. Must be active (isActive !== false).
 * 2. Next due date must fall in target month or earlier.
 * 3. Overdue evaluation:
 *    - If target month is strictly in the past relative to referenceDate, the entire month
 *      has elapsed, so any unpaid bill due in target month is overdue.
 *    - If target month is the current month of referenceDate, it is overdue if nextDueDate < referenceDate.
 *    - If target month is in the future, it is not overdue yet.
 */
export function isBillOverdueInMonth(
  bill: Bill,
  targetYear: number,
  targetMonth: number,
  referenceDate: Date | string | number = new Date()
): boolean {
  if (!bill.isActive) return false
  const dueParts = toTransactionDateParts(bill.nextDueDate)
  const refParts = toTransactionDateParts(referenceDate)

  // Must be due in target month or an earlier unpaid month
  const isDueInTargetOrEarlier =
    dueParts.year < targetYear ||
    (dueParts.year === targetYear && dueParts.month <= targetMonth)
  if (!isDueInTargetOrEarlier) return false

  // Determine if target month is in past, present, or future
  const isTargetMonthInPast =
    refParts.year > targetYear ||
    (refParts.year === targetYear && refParts.month > targetMonth)

  if (isTargetMonthInPast) {
    return true
  }

  // If referenceDate is currently in the target month:
  if (refParts.year === targetYear && refParts.month === targetMonth) {
    const todayStr = toCalendarDateString(referenceDate)
    return bill.nextDueDate < todayStr
  }

  // Target month is in the future relative to referenceDate
  return false
}

// ── Pre-Closing Checklist Evaluator ──────────────────────────────────────────

/**
 * Executes the complete pre-closing checklist for a given calendar month.
 * Evaluates:
 * 1. Uncategorized transactions in target month (Requirement 9.1)
 * 2. Pending inbox items in target month (Requirement 9.1)
 * 3. Active wallets unreconciled in target month (Requirement 9.1)
 * 4. Overdue unpaid bills in target month (Requirement 9.1)
 *
 * Guaranteed to satisfy Property 26: reports violations if and only if
 * there exist items failing any of the 4 conditions.
 */
export function evaluatePreClosingChecklist(params: {
  year: number
  month: number
  transactions: Transaction[]
  inbox?: InboxTransactionItem[]
  wallets?: WalletAccount[]
  reconciliations?: WalletReconciliation[]
  bills?: Bill[]
  options?: PreClosingChecklistOptions
}): PreClosingChecklistResult {
  const {
    year,
    month,
    transactions,
    inbox = [],
    wallets = [],
    reconciliations = [],
    bills = [],
    options = {},
  } = params

  const monthId = formatMonthId(year, month)
  const referenceDate = options.referenceDate ?? new Date()
  const hiddenWalletIds = new Set(options.hiddenWalletIds ?? [])

  // 1. Uncategorized transactions in target month
  const targetMonthTx = transactions.filter(tx => matchesMonth(tx.date, year, month))
  const uncategorizedTransactions = targetMonthTx.filter(isUncategorizedTransaction)

  // 2. Pending inbox items in target month
  const pendingInboxItems = inbox.filter(item =>
    isPendingInboxItemInMonth(item, year, month)
  )

  // 3. Active wallets unreconciled in target month
  const activeWallets = wallets.filter(w => !hiddenWalletIds.has(w.id))
  const unreconciledWallets = activeWallets.filter(
    w => !isWalletReconciledInMonth(w, reconciliations, year, month)
  )

  // 4. Overdue unpaid bills in target month
  const overdueBills = bills.filter(b =>
    isBillOverdueInMonth(b, year, month, referenceDate)
  )

  const items: PreClosingChecklistItems = {
    uncategorizedTransactions: {
      isPassed: uncategorizedTransactions.length === 0,
      count: uncategorizedTransactions.length,
      transactions: uncategorizedTransactions,
    },
    pendingInbox: {
      isPassed: pendingInboxItems.length === 0,
      count: pendingInboxItems.length,
      items: pendingInboxItems,
    },
    unreconciledWallets: {
      isPassed: unreconciledWallets.length === 0,
      count: unreconciledWallets.length,
      wallets: unreconciledWallets,
    },
    overdueBills: {
      isPassed: overdueBills.length === 0,
      count: overdueBills.length,
      bills: overdueBills,
    },
  }

  const totalViolations =
    (items.uncategorizedTransactions.isPassed ? 0 : 1) +
    (items.pendingInbox.isPassed ? 0 : 1) +
    (items.unreconciledWallets.isPassed ? 0 : 1) +
    (items.overdueBills.isPassed ? 0 : 1)

  const totalIssuesCount =
    items.uncategorizedTransactions.count +
    items.pendingInbox.count +
    items.unreconciledWallets.count +
    items.overdueBills.count

  const isReadyToClose = totalViolations === 0

  return {
    year,
    month,
    monthId,
    isReadyToClose,
    items,
    totalViolations,
    totalIssuesCount,
  }
}

// ── Monthly Financial Summary Compiler ───────────────────────────────────────

/**
 * Compiles monthly financial summary for target month.
 * Guarantees mathematical identity: netSavings === incomeTotal - expenseTotal (Requirement 9.2, Property 27)
 */
export function compileMonthlyFinancialSummary(params: {
  year: number
  month: number
  transactions: Transaction[]
  reconciliations?: WalletReconciliation[]
}): MonthlyFinancialSummary {
  const { year, month, transactions, reconciliations = [] } = params
  const monthId = formatMonthId(year, month)

  const inMonth = transactions.filter(tx => matchesMonth(tx.date, year, month))

  let incomeTotal = 0
  let expenseTotal = 0
  let incomeCount = 0
  let expenseCount = 0
  let transferCount = 0

  for (const tx of inMonth) {
    if (isMoneyMove(tx)) {
      transferCount += 1
      continue
    }

    const amount = Math.max(0, Math.round(Number(tx.amount) || 0))
    if (tx.type === 'income') {
      incomeTotal += amount
      incomeCount += 1
    } else if (tx.type === 'expense') {
      expenseTotal += amount
      expenseCount += 1
    }
  }

  // Guaranteed identity
  const netSavings = incomeTotal - expenseTotal

  // Reconciliations in target month
  const inMonthRecons = reconciliations.filter(r =>
    matchesMonth(r.reconciledAt, year, month)
  )
  const unreconciledVariances = inMonthRecons.reduce(
    (sum, r) => sum + Math.round(Number(r.difference) || 0),
    0
  )

  return {
    year,
    month,
    monthId,
    incomeTotal,
    expenseTotal,
    netSavings,
    transactionCount: inMonth.length,
    incomeCount,
    expenseCount,
    transferCount,
    unreconciledVariances,
    reconciliationsCount: inMonthRecons.length,
  }
}

// ── Monthly Close Record Operations ──────────────────────────────────────────

/**
 * Creates an immutable MonthlyCloseRecord for a finalized month.
 * Computes income, expense, and net savings summary with exact identity check.
 */
export function createMonthlyCloseRecord(params: CreateMonthlyCloseParams): MonthlyCloseRecord {
  const {
    year,
    month,
    transactions,
    reconciliations = [],
    closedAt,
  } = params

  const monthId = formatMonthId(year, month)
  const summary = compileMonthlyFinancialSummary({
    year,
    month,
    transactions,
    reconciliations,
  })

  const closedAtIso =
    typeof closedAt === 'string'
      ? closedAt
      : closedAt instanceof Date
        ? closedAt.toISOString()
        : new Date().toISOString()

  return {
    id: monthId,
    year,
    month,
    closedAt: closedAtIso,
    incomeTotal: summary.incomeTotal,
    expenseTotal: summary.expenseTotal,
    netSavings: summary.netSavings,
    unreconciledVariances: summary.unreconciledVariances,
    isReopened: false,
  }
}

/**
 * Reopens a previously closed month with a mandatory audit note.
 * (Requirement 9.4)
 */
export function reopenMonthlyClose(
  record: MonthlyCloseRecord,
  note: string,
  reopenedAt?: Date | string
): MonthlyCloseRecord {
  if (!note || typeof note !== 'string' || !note.trim()) {
    throw new Error('Catatan audit pembukaan kembali periode tutup buku wajib diisi.')
  }

  const reopenedAtIso =
    typeof reopenedAt === 'string'
      ? reopenedAt
      : reopenedAt instanceof Date
        ? reopenedAt.toISOString()
        : new Date().toISOString()

  return {
    ...record,
    isReopened: true,
    reopenedAt: reopenedAtIso,
    reopenedNote: note.trim(),
  }
}

/**
 * Re-closes a previously reopened month, updating the closed timestamp and optional summary figures.
 */
export function recloseMonthlyClose(
  record: MonthlyCloseRecord,
  params?: {
    transactions?: Transaction[]
    reconciliations?: WalletReconciliation[]
    closedAt?: Date | string
  }
): MonthlyCloseRecord {
  const closedAtIso =
    typeof params?.closedAt === 'string'
      ? params.closedAt
      : params?.closedAt instanceof Date
        ? params.closedAt.toISOString()
        : new Date().toISOString()

  if (params?.transactions) {
    const summary = compileMonthlyFinancialSummary({
      year: record.year,
      month: record.month,
      transactions: params.transactions,
      reconciliations: params.reconciliations,
    })

    return {
      ...record,
      closedAt: closedAtIso,
      incomeTotal: summary.incomeTotal,
      expenseTotal: summary.expenseTotal,
      netSavings: summary.netSavings,
      unreconciledVariances: summary.unreconciledVariances,
      isReopened: false,
    }
  }

  return {
    ...record,
    closedAt: closedAtIso,
    isReopened: false,
  }
}

/**
 * Checks if a specific month is currently in closed status.
 */
export function isMonthClosed(
  monthIdOrDate: string | { year: number; month: number },
  records: MonthlyCloseRecord[]
): boolean {
  const targetId =
    typeof monthIdOrDate === 'string'
      ? monthIdOrDate
      : formatMonthId(monthIdOrDate.year, monthIdOrDate.month)

  const record = records.find(r => r.id === targetId)
  return Boolean(record && !record.isReopened)
}

/**
 * Retrieves the MonthlyCloseRecord for a given month, if any exists.
 */
export function getMonthlyCloseRecord(
  monthIdOrDate: string | { year: number; month: number },
  records: MonthlyCloseRecord[]
): MonthlyCloseRecord | undefined {
  const targetId =
    typeof monthIdOrDate === 'string'
      ? monthIdOrDate
      : formatMonthId(monthIdOrDate.year, monthIdOrDate.month)

  return records.find(r => r.id === targetId)
}

// ── Unified MonthlyCloseManager Service ───────────────────────────────────────

export class MonthlyCloseManager {
  static formatMonthId = formatMonthId
  static parseMonthId = parseMonthId
  static formatMonthLabel = formatMonthLabel
  static matchesMonth = matchesMonth
  static isMoneyMove = isMoneyMove
  static isUncategorizedTransaction = isUncategorizedTransaction
  static isPendingInboxItemInMonth = isPendingInboxItemInMonth
  static isWalletReconciledInMonth = isWalletReconciledInMonth
  static isBillOverdueInMonth = isBillOverdueInMonth
  static evaluatePreClosingChecklist = evaluatePreClosingChecklist
  static compileMonthlyFinancialSummary = compileMonthlyFinancialSummary
  static createMonthlyCloseRecord = createMonthlyCloseRecord
  static reopenMonthlyClose = reopenMonthlyClose
  static recloseMonthlyClose = recloseMonthlyClose
  static isMonthClosed = isMonthClosed
  static getMonthlyCloseRecord = getMonthlyCloseRecord
}
