/**
 * SakuKilat — Manual Net Worth and Debt Liability Ledger (Phase P10)
 * -----------------------------------------------------------------
 * Tracks liabilities (utang), receivables (piutang), and aggregates overall
 * Net Worth offline and locally without cloud dependencies.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. Offline-First & Local Ledger: All debt records persist directly in device storage.
 * 2. Net Worth Identity: Net Worth = Total Assets (positive wallet balances) - Total Liabilities.
 * 3. Payment Synchronization: Debt payments decrease debt remaining, deduct wallet balance,
 *    and record an expense transaction in the primary transaction ledger.
 * 4. Non-Destructive: Debt settlements preserve full payment history and audit trail.
 */

import { generateId, type Transaction } from './mock-data.ts'

// ── Types & Contracts ─────────────────────────────────────────────────────────

export type DebtType = 'payable' | 'receivable' // Utang kita vs Piutang orang

export interface DebtPayment {
  id: string
  date: string // ISO date string or timestamp
  amount: number
  paymentMethodId: string
  transactionId?: string
  note?: string
}

export interface DebtItem {
  id: string
  name: string
  principalAmount: number
  paidAmount: number
  remainingAmount: number
  dueDate?: string // "YYYY-MM-DD"
  lenderOrBorrower: string
  type: DebtType
  note?: string
  isSettled: boolean
  payments: DebtPayment[]
  createdAt: string
  updatedAt: string
}

export interface CreateDebtInput {
  name: string
  principalAmount: number
  paidAmount?: number
  dueDate?: string
  lenderOrBorrower?: string
  type?: DebtType
  note?: string
}

export interface RecordDebtPaymentParams {
  debtId: string
  amount: number
  paymentMethodId: string
  date?: Date | string
  note?: string
  createExpenseTransaction?: boolean
}

export interface RecordDebtPaymentResult {
  updatedDebt: DebtItem
  payment: DebtPayment
  transaction?: Transaction
}

export interface NetWorthSummary {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  calculatedAt: string
  activeDebtsCount: number
  settledDebtsCount: number
  totalReceivables: number
}

// ── Calculation Functions (Requirements 10.2, 10.3, 10.4, Property 28) ───────

/**
 * Calculates total assets by summing all positive wallet balances in Transaction_Store.
 * Wallets with zero or negative balances are excluded from assets.
 * (Requirement 10.2, Property 28)
 */
export function calculateTotalAssets(
  wallets: Array<{ balance?: number } | null | undefined>
): number {
  if (!Array.isArray(wallets)) return 0
  return Math.round(
    wallets
      .filter((w) => Boolean(w && Number.isFinite(Number(w.balance)) && Number(w.balance) > 0))
      .reduce((sum, w) => sum + Number(w!.balance), 0)
  )
}

/**
 * Calculates total liabilities by summing the remaining balances of all active registered debts.
 * By default, sums all active (!isSettled) debts.
 * If options.onlyPayables is true, restricts to debts where type !== 'receivable'.
 * (Requirement 10.3, Property 28)
 */
export function calculateTotalLiabilities(
  debts: Array<Partial<DebtItem> | null | undefined>,
  options?: { onlyPayables?: boolean }
): number {
  if (!Array.isArray(debts)) return 0
  const onlyPayables = options?.onlyPayables ?? false

  return Math.round(
    debts
      .filter((d): d is Partial<DebtItem> => {
        if (!d || d.isSettled) return false
        if (onlyPayables && d.type === 'receivable') return false
        return true
      })
      .reduce((sum, d) => {
        const remaining = d.remainingAmount !== undefined && Number.isFinite(Number(d.remainingAmount))
          ? Number(d.remainingAmount)
          : Math.max(0, (Number(d.principalAmount) || 0) - (Number(d.paidAmount) || 0))
        return sum + Math.max(0, Math.round(remaining))
      }, 0)
  )
}

/**
 * Calculates total receivables (piutang) by summing remaining amounts of active receivables.
 */
export function calculateTotalReceivables(
  debts: Array<Partial<DebtItem> | null | undefined>
): number {
  if (!Array.isArray(debts)) return 0
  return Math.round(
    debts
      .filter((d): d is Partial<DebtItem> => Boolean(d && !d.isSettled && d.type === 'receivable'))
      .reduce((sum, d) => {
        const remaining = d.remainingAmount !== undefined && Number.isFinite(Number(d.remainingAmount))
          ? Number(d.remainingAmount)
          : Math.max(0, (Number(d.principalAmount) || 0) - (Number(d.paidAmount) || 0))
        return sum + Math.max(0, Math.round(remaining))
      }, 0)
  )
}

/**
 * Calculates Net Worth as total assets minus total liabilities.
 * (Requirement 10.4, Property 28)
 */
export function calculateNetWorth(totalAssets: number, totalLiabilities: number): number {
  const assets = Math.max(0, Math.round(Number(totalAssets) || 0))
  const liabilities = Math.max(0, Math.round(Number(totalLiabilities) || 0))
  return assets - liabilities
}

/**
 * Compiles a comprehensive NetWorthSummary from wallet and debt states.
 */
export function compileNetWorthSummary(
  wallets: Array<{ balance?: number }>,
  debts: DebtItem[],
  now: Date | string = new Date()
): NetWorthSummary {
  const totalAssets = calculateTotalAssets(wallets)
  const totalLiabilities = calculateTotalLiabilities(debts)
  const netWorth = calculateNetWorth(totalAssets, totalLiabilities)
  const totalReceivables = calculateTotalReceivables(debts)
  const calculatedAt = typeof now === 'string' ? now : now.toISOString()

  const safeDebts = Array.isArray(debts) ? debts : []
  const activeDebtsCount = safeDebts.filter((d) => d && !d.isSettled).length
  const settledDebtsCount = safeDebts.filter((d) => d && d.isSettled).length

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    calculatedAt,
    activeDebtsCount,
    settledDebtsCount,
    totalReceivables,
  }
}

// ── Debt Item Factory & Mutations (Requirement 10.1) ──────────────────────────

/**
 * Creates a new DebtItem record with validation.
 * (Requirement 10.1)
 */
export function createDebtItem(input: CreateDebtInput): DebtItem {
  const name = (input.name || '').trim()
  if (!name) {
    throw new Error('Nama utang/piutang wajib diisi')
  }

  const principalAmount = Math.round(Number(input.principalAmount))
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    throw new Error('Nominal pokok utang harus berupa angka positif')
  }

  const rawPaid = input.paidAmount !== undefined ? Math.round(Number(input.paidAmount)) : 0
  const paidAmount = Math.max(0, Math.min(principalAmount, Number.isFinite(rawPaid) ? rawPaid : 0))
  const remainingAmount = Math.max(0, principalAmount - paidAmount)
  const isSettled = remainingAmount === 0

  const now = new Date().toISOString()
  const type: DebtType = input.type === 'receivable' ? 'receivable' : 'payable'
  const lenderOrBorrower = (input.lenderOrBorrower || '').trim() || (type === 'receivable' ? 'Peminjam' : 'Pemberi Pinjaman')

  const initialPayments: DebtPayment[] = []
  if (paidAmount > 0) {
    initialPayments.push({
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: now,
      amount: paidAmount,
      paymentMethodId: 'tunai',
      note: 'Pembayaran awal saat pencatatan',
    })
  }

  return {
    id: `debt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    principalAmount,
    paidAmount,
    remainingAmount,
    dueDate: input.dueDate && /^\d{4}-\d{2}-\d{2}/.test(input.dueDate) ? input.dueDate.slice(0, 10) : undefined,
    lenderOrBorrower,
    type,
    note: input.note?.trim() || undefined,
    isSettled,
    payments: initialPayments,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Updates an existing DebtItem with validation, maintaining correct remainingAmount and settled status.
 */
export function updateDebtItem(
  debt: DebtItem,
  updates: Partial<Omit<DebtItem, 'id' | 'createdAt'>>
): DebtItem {
  const nextName = updates.name !== undefined ? updates.name.trim() : debt.name
  if (!nextName) {
    throw new Error('Nama utang/piutang tidak boleh kosong')
  }

  const nextPrincipal = updates.principalAmount !== undefined
    ? Math.max(0, Math.round(Number(updates.principalAmount)))
    : debt.principalAmount

  const nextPaid = updates.paidAmount !== undefined
    ? Math.max(0, Math.min(nextPrincipal, Math.round(Number(updates.paidAmount))))
    : Math.min(nextPrincipal, debt.paidAmount)

  const remainingAmount = Math.max(0, nextPrincipal - nextPaid)
  const isSettled = updates.isSettled !== undefined ? updates.isSettled : remainingAmount === 0

  return {
    ...debt,
    ...updates,
    name: nextName,
    principalAmount: nextPrincipal,
    paidAmount: nextPaid,
    remainingAmount,
    isSettled,
    type: updates.type ?? debt.type,
    lenderOrBorrower: updates.lenderOrBorrower !== undefined ? updates.lenderOrBorrower.trim() : debt.lenderOrBorrower,
    note: updates.note !== undefined ? updates.note?.trim() || undefined : debt.note,
    dueDate: updates.dueDate !== undefined ? updates.dueDate : debt.dueDate,
    updatedAt: new Date().toISOString(),
  }
}

// ── Repayment Synchronization (Requirement 10.5, Property 29) ─────────────────

/**
 * Synchronizes debt repayment:
 * 1. Validates payment nominal against debt remaining balance.
 * 2. Decreases remainingAmount by payment nominal, increases paidAmount.
 * 3. Appends a new DebtPayment to debt history.
 * 4. Generates corresponding expense transaction for the primary ledger.
 * (Requirement 10.5, Property 29)
 */
export function recordDebtPayment(
  debt: DebtItem,
  params: RecordDebtPaymentParams
): RecordDebtPaymentResult {
  if (debt.isSettled || debt.remainingAmount <= 0) {
    throw new Error(`Utang "${debt.name}" sudah lunas`)
  }

  const rawAmount = Math.round(Number(params.amount))
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    throw new Error('Nominal pembayaran utang harus berupa angka positif')
  }

  // Bound payment amount to remaining amount
  const paymentAmount = Math.min(rawAmount, debt.remainingAmount)
  const newPaidAmount = debt.paidAmount + paymentAmount
  const newRemainingAmount = Math.max(0, debt.remainingAmount - paymentAmount)
  const isSettled = newRemainingAmount === 0

  const paymentDate = params.date instanceof Date
    ? params.date
    : typeof params.date === 'string' && params.date
      ? new Date(params.date)
      : new Date()
  const paymentIso = paymentDate.toISOString()

  const txId = generateId()
  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const payment: DebtPayment = {
    id: paymentId,
    date: paymentIso,
    amount: paymentAmount,
    paymentMethodId: params.paymentMethodId,
    transactionId: txId,
    note: params.note?.trim() || `Pembayaran untuk ${debt.name}`,
  }

  const updatedDebt: DebtItem = {
    ...debt,
    paidAmount: newPaidAmount,
    remainingAmount: newRemainingAmount,
    isSettled,
    payments: [payment, ...debt.payments],
    updatedAt: paymentIso,
  }

  let transaction: Transaction | undefined
  if (params.createExpenseTransaction !== false) {
    const isReceivable = debt.type === 'receivable'
    transaction = {
      id: txId,
      kind: 'transaction',
      description: params.note?.trim() || (isReceivable ? `Pelunasan piutang: ${debt.name}` : `Bayar utang: ${debt.name}`),
      amount: paymentAmount,
      type: isReceivable ? 'income' : 'expense',
      category: isReceivable ? 'lainnya' : 'tagihan',
      paymentMethod: params.paymentMethodId,
      date: paymentDate,
      note: isReceivable
        ? `Penerimaan pembayaran piutang dari ${debt.lenderOrBorrower}`
        : `Pembayaran utang kepada ${debt.lenderOrBorrower}`,
    }
  }

  return {
    updatedDebt,
    payment,
    transaction,
  }
}

// ── NetWorthTracker Static Class ──────────────────────────────────────────────

export class NetWorthTracker {
  static calculateTotalAssets = calculateTotalAssets
  static calculateTotalLiabilities = calculateTotalLiabilities
  static calculateTotalReceivables = calculateTotalReceivables
  static calculateNetWorth = calculateNetWorth
  static compileSummary = compileNetWorthSummary
  static createDebt = createDebtItem
  static updateDebt = updateDebtItem
  static recordPayment = recordDebtPayment
}
