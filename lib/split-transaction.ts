/**
 * SakuKilat — Balanced Split Transactions Engine (Phase P11)
 * ----------------------------------------------------------
 * Handles multi-category expense/income split line items, strict
 * mathematical balance validation (sum === parent), discrepancy calculations,
 * and category distribution for reporting without altering the parent
 * transaction's payment method or nominal in the primary ledger.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. Balance Invariant: sum(splitItems.amount) === parentTransaction.amount
 * 2. Save Blocking: Any discrepancy |parent - sum| > 0 blocks saving and displays exact delta.
 * 3. Unified Ledger Record: Parent transaction stores the single payment method deduction.
 * 4. Reporting Distribution: Reporting engines (Tab Rekapan, monthly close, category charts)
 *    distribute expense attribution across each split child's category and subcategory.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 * Properties: 30, 31
 */

import { formatIDRShort } from './parser.ts'
import type { Transaction } from './mock-data.ts'

// ── Types & Contracts (Requirement 11.1) ──────────────────────────────────────

export interface SplitLineItem {
  id: string
  categoryId: string
  subcategoryId?: string
  amount: number
  note?: string
}

export interface CreateSplitLineItemInput {
  id?: string
  categoryId: string
  subcategoryId?: string
  amount: number
  note?: string
}

export interface SplitValidationResult {
  isValid: boolean
  canSave: boolean
  totalSplitAmount: number
  parentAmount: number
  discrepancy: number // Math.abs(parentAmount - totalSplitAmount)
  isUnderAllocated: boolean // totalSplitAmount < parentAmount
  isOverAllocated: boolean // totalSplitAmount > parentAmount
  isBalanced: boolean // totalSplitAmount === parentAmount
  hasEmptyCategory: boolean
  hasInvalidAmount: boolean
  errorMessage?: string
}

export interface DistributedReportingItem {
  transactionId: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category: string // Category of the split line item (or parent category if not split)
  subcategory?: string // Subcategory of the split line item (or parent subcategory)
  paymentMethod: string // UNIFIED PARENT PAYMENT METHOD (Requirement 11.4, Property 31)
  date: Date
  note?: string
  isSplitChild: boolean
  splitItemId?: string
  parentCategory: string
  parentAmount: number
}

// ── Line Item Creation & Helpers ──────────────────────────────────────────────

/**
 * Creates a normalized SplitLineItem with a unique identifier and sanitized fields.
 */
export function createSplitLineItem(input: CreateSplitLineItemInput): SplitLineItem {
  const amount = Math.max(0, Math.round(Number(input.amount) || 0))
  const categoryId = input.categoryId ? input.categoryId.trim() : ''
  const subcategoryId = input.subcategoryId ? input.subcategoryId.trim() || undefined : undefined
  const note = input.note ? input.note.trim() || undefined : undefined
  const id = input.id && input.id.trim()
    ? input.id.trim()
    : `split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return {
    id,
    categoryId,
    subcategoryId,
    amount,
    note,
  }
}

/**
 * Calculates the total allocated amount across all split line items.
 */
export function calculateSplitTotal(
  splitItems: Array<{ amount?: number } | null | undefined> | null | undefined
): number {
  if (!Array.isArray(splitItems)) return 0
  return splitItems.reduce((sum, item) => {
    if (!item || item.amount === undefined || item.amount === null) return sum
    const val = Math.round(Number(item.amount) || 0)
    return sum + (val > 0 ? val : 0)
  }, 0)
}

/**
 * Calculates the discrepancy between parent transaction amount and sum of split line items: |parent - sum|
 */
export function calculateSplitDiscrepancy(
  parentAmount: number,
  splitItems: Array<{ amount?: number } | null | undefined> | null | undefined
): number {
  const safeParent = Math.max(0, Math.round(Number(parentAmount) || 0))
  const totalSplit = calculateSplitTotal(splitItems)
  return Math.abs(safeParent - totalSplit)
}

// ── Validation Engine (Requirements 11.2, 11.3, Property 30) ──────────────────

/**
 * Validates whether a set of split line items satisfies the balance invariant against parent transaction amount.
 * - Invariant: sum(splitItems.amount) === parentAmount
 * - If sum !== parent, calculate discrepancy |parent - sum| and block save
 * - Ensures every split item has a valid category and a positive amount (> 0)
 *
 * (Requirements 11.2, 11.3, Property 30)
 */
export function validateSplitTransaction(
  parentAmount: number,
  splitItems: SplitLineItem[] | null | undefined
): SplitValidationResult {
  const safeParent = Math.max(0, Math.round(Number(parentAmount) || 0))
  const items = Array.isArray(splitItems) ? splitItems : []
  const totalSplitAmount = calculateSplitTotal(items)
  const discrepancy = Math.abs(safeParent - totalSplitAmount)
  const isBalanced = totalSplitAmount === safeParent
  const isUnderAllocated = totalSplitAmount < safeParent
  const isOverAllocated = totalSplitAmount > safeParent

  if (safeParent <= 0) {
    return {
      isValid: false,
      canSave: false,
      totalSplitAmount,
      parentAmount: safeParent,
      discrepancy,
      isUnderAllocated,
      isOverAllocated,
      isBalanced: false,
      hasEmptyCategory: false,
      hasInvalidAmount: false,
      errorMessage: 'Nominal transaksi induk harus lebih besar dari Rp0',
    }
  }

  if (items.length === 0) {
    return {
      isValid: false,
      canSave: false,
      totalSplitAmount: 0,
      parentAmount: safeParent,
      discrepancy: safeParent,
      isUnderAllocated: true,
      isOverAllocated: false,
      isBalanced: false,
      hasEmptyCategory: false,
      hasInvalidAmount: false,
      errorMessage: 'Minimal harus ada satu rincian alokasi split.',
    }
  }

  let hasEmptyCategory = false
  let hasInvalidAmount = false

  for (const item of items) {
    if (!item || !item.categoryId || typeof item.categoryId !== 'string' || item.categoryId.trim() === '') {
      hasEmptyCategory = true
    }
    const itemAmt = Number(item?.amount)
    if (!Number.isFinite(itemAmt) || itemAmt <= 0) {
      hasInvalidAmount = true
    }
  }

  if (hasEmptyCategory) {
    return {
      isValid: false,
      canSave: false,
      totalSplitAmount,
      parentAmount: safeParent,
      discrepancy,
      isUnderAllocated,
      isOverAllocated,
      isBalanced,
      hasEmptyCategory: true,
      hasInvalidAmount,
      errorMessage: 'Semua rincian split harus memiliki kategori yang dipilih.',
    }
  }

  if (hasInvalidAmount) {
    return {
      isValid: false,
      canSave: false,
      totalSplitAmount,
      parentAmount: safeParent,
      discrepancy,
      isUnderAllocated,
      isOverAllocated,
      isBalanced,
      hasEmptyCategory,
      hasInvalidAmount: true,
      errorMessage: 'Nominal setiap rincian split harus lebih besar dari Rp0.',
    }
  }

  if (!isBalanced) {
    const formattedDelta = formatIDRShort(discrepancy)
    return {
      isValid: false,
      canSave: false,
      totalSplitAmount,
      parentAmount: safeParent,
      discrepancy,
      isUnderAllocated,
      isOverAllocated,
      isBalanced: false,
      hasEmptyCategory: false,
      hasInvalidAmount: false,
      errorMessage: `Selisih Rp${formattedDelta}. Total alokasi harus pas dengan transaksi induk.`,
    }
  }

  return {
    isValid: true,
    canSave: true,
    totalSplitAmount,
    parentAmount: safeParent,
    discrepancy: 0,
    isUnderAllocated: false,
    isOverAllocated: false,
    isBalanced: true,
    hasEmptyCategory: false,
    hasInvalidAmount: false,
    errorMessage: undefined,
  }
}

/**
 * Convenient boolean check whether split transaction can be saved safely.
 */
export function canSaveSplitTransaction(
  parentAmount: number,
  splitItems: SplitLineItem[] | null | undefined
): boolean {
  return validateSplitTransaction(parentAmount, splitItems).canSave
}

// ── Category Distribution Engine (Requirements 11.4, 11.5, Property 31) ───────

/**
 * Checks if a transaction has active split line items.
 */
export function isSplitTransaction(
  transaction: { splitItems?: SplitLineItem[] } | null | undefined
): boolean {
  return Boolean(
    transaction &&
    Array.isArray(transaction.splitItems) &&
    transaction.splitItems.length > 0
  )
}

/**
 * Expands a single transaction for reporting.
 * - If not split, returns a single item with parent's category and amount.
 * - If split, expands into child line items with each split item's category, subcategory,
 *   amount, and note, while preserving the parent's payment method and transaction ID.
 * (Requirement 11.4, Property 31)
 */
export function expandTransactionForReporting<
  T extends {
    id: string
    description?: string
    amount: number
    type: 'expense' | 'income' | string
    category: string
    subcategory?: string
    paymentMethod: string
    date: Date
    note?: string
    splitItems?: SplitLineItem[]
  }
>(transaction: T): DistributedReportingItem[] {
  if (!isSplitTransaction(transaction)) {
    return [
      {
        transactionId: transaction.id,
        description: transaction.description || '',
        amount: Math.round(Number(transaction.amount) || 0),
        type: (transaction.type === 'income' ? 'income' : 'expense'),
        category: transaction.category,
        subcategory: transaction.subcategory,
        paymentMethod: transaction.paymentMethod,
        date: transaction.date,
        note: transaction.note,
        isSplitChild: false,
        parentCategory: transaction.category,
        parentAmount: Math.round(Number(transaction.amount) || 0),
      },
    ]
  }

  return transaction.splitItems!.map((split) => ({
    transactionId: transaction.id,
    description: split.note || transaction.description || '',
    amount: Math.round(Number(split.amount) || 0),
    type: (transaction.type === 'income' ? 'income' : 'expense'),
    category: split.categoryId,
    subcategory: split.subcategoryId || undefined,
    paymentMethod: transaction.paymentMethod, // Unified parent payment method (Requirement 11.4)
    date: transaction.date,
    note: split.note || transaction.note,
    isSplitChild: true,
    splitItemId: split.id,
    parentCategory: transaction.category,
    parentAmount: Math.round(Number(transaction.amount) || 0),
  }))
}

/**
 * Expands a list of transactions into reporting items, flattening split transactions.
 */
export function expandTransactionsForReporting<
  T extends {
    id: string
    description?: string
    amount: number
    type: 'expense' | 'income' | string
    category: string
    subcategory?: string
    paymentMethod: string
    date: Date
    note?: string
    splitItems?: SplitLineItem[]
  }
>(transactions: T[] | null | undefined): DistributedReportingItem[] {
  if (!Array.isArray(transactions)) return []
  return transactions.flatMap((t) => expandTransactionForReporting(t))
}

/**
 * Calculates category totals by distributing split transactions across their individual split categories.
 * For non-split transactions, uses transaction.category.
 * Excludes transfers/savings or transactions not matching typeFilter.
 * Returns a Map of categoryId -> total allocated nominal amount.
 * (Requirement 11.4, 11.5, Property 31)
 */
export function distributeCategoryAmounts<
  T extends {
    id: string
    amount: number
    type: 'expense' | 'income' | string
    category: string
    subcategory?: string
    paymentMethod: string
    date: Date
    kind?: string
    splitItems?: SplitLineItem[]
  }
>(
  transactions: T[] | null | undefined,
  typeFilter: 'expense' | 'income' = 'expense'
): Map<string, number> {
  const map = new Map<string, number>()
  if (!Array.isArray(transactions)) return map

  for (const t of transactions) {
    if (t.kind === 'transfer' || t.kind === 'saving') continue
    if (t.type !== typeFilter) continue

    if (isSplitTransaction(t)) {
      for (const split of t.splitItems!) {
        const cat = split.categoryId
        const amt = Math.round(Number(split.amount) || 0)
        map.set(cat, (map.get(cat) ?? 0) + amt)
      }
    } else {
      const cat = t.category
      const amt = Math.round(Number(t.amount) || 0)
      map.set(cat, (map.get(cat) ?? 0) + amt)
    }
  }

  return map
}

/**
 * Generates category breakdown slices (category, total, percentage) for charts and reports,
 * fully distributing split transactions across their line items.
 * (Requirement 11.4, 11.5, Property 31)
 */
export function distributeCategorySlices<
  T extends {
    id: string
    amount: number
    type: 'expense' | 'income' | string
    category: string
    subcategory?: string
    paymentMethod: string
    date: Date
    kind?: string
    splitItems?: SplitLineItem[]
  }
>(
  transactions: T[] | null | undefined,
  typeFilter: 'expense' | 'income' = 'expense'
): Array<{ category: string; total: number; pct: number }> {
  const totalsMap = distributeCategoryAmounts(transactions, typeFilter)
  const grandTotal = Array.from(totalsMap.values()).reduce((sum, v) => sum + v, 0)

  return Array.from(totalsMap.entries())
    .map(([category, total]) => ({
      category,
      total,
      pct: grandTotal > 0 ? total / grandTotal : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Calculates subcategory totals within a specific category,
 * respecting split line items assigned to that category.
 */
export function distributeSubcategoryAmounts<
  T extends {
    id: string
    amount: number
    type: 'expense' | 'income' | string
    category: string
    subcategory?: string
    kind?: string
    splitItems?: SplitLineItem[]
  }
>(
  transactions: T[] | null | undefined,
  categoryId: string,
  typeFilter: 'expense' | 'income' = 'expense'
): Map<string, number> {
  const map = new Map<string, number>()
  if (!Array.isArray(transactions) || !categoryId) return map

  for (const t of transactions) {
    if (t.kind === 'transfer' || t.kind === 'saving') continue
    if (t.type !== typeFilter) continue

    if (isSplitTransaction(t)) {
      for (const split of t.splitItems!) {
        if (split.categoryId === categoryId) {
          const sub = split.subcategoryId || 'Lainnya'
          const amt = Math.round(Number(split.amount) || 0)
          map.set(sub, (map.get(sub) ?? 0) + amt)
        }
      }
    } else if (t.category === categoryId) {
      const sub = t.subcategory || 'Lainnya'
      const amt = Math.round(Number(t.amount) || 0)
      map.set(sub, (map.get(sub) ?? 0) + amt)
    }
  }

  return map
}

// ── SplitTransactionValidator Static Class ────────────────────────────────────

export class SplitTransactionValidator {
  static createLineItem = createSplitLineItem
  static calculateTotal = calculateSplitTotal
  static calculateDiscrepancy = calculateSplitDiscrepancy
  static validate = validateSplitTransaction
  static canSave = canSaveSplitTransaction
  static isSplit = isSplitTransaction
  static expandTransaction = expandTransactionForReporting
  static expandTransactions = expandTransactionsForReporting
  static distributeCategoryAmounts = distributeCategoryAmounts
  static distributeCategorySlices = distributeCategorySlices
  static distributeSubcategoryAmounts = distributeSubcategoryAmounts
}
