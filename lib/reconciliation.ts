/**
 * SakuKilat — Wallet Balance Reconciliation (Phase P6)
 * ----------------------------------------------------
 * Subsystem responsible for comparing recorded wallet balances against
 * physical account balances, calculating variances, and maintaining
 * a non-destructive audit history of reconciliation adjustments.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 * Properties: 17, 18, 19
 */

import type { Transaction, WalletAccount } from './mock-data.ts'
import { formatIDR } from './parser.ts'

export interface WalletReconciliation {
  id: string
  walletId: string
  reconciledAt: string // ISO timestamp string
  expectedBalance: number
  actualBalance: number
  difference: number // actualBalance - expectedBalance
  note?: string
  adjustmentTransactionId?: string
}

export interface CreateReconciliationRecordParams {
  id?: string
  walletId: string
  expectedBalance: number
  actualBalance: number
  difference?: number
  note?: string
  adjustmentTransactionId?: string
  reconciledAt?: string | Date
}

export interface ReconcileWalletParams {
  walletId: string
  actualBalance: number
  note?: string
  createAdjustment?: boolean
  date?: Date
}

export interface ReconcileWalletResult {
  reconciliation: WalletReconciliation
  adjustmentTransaction?: Transaction
}

export interface FormattedVariance {
  difference: number
  absDifference: number
  status: 'surplus' | 'shortfall' | 'balanced'
  badgeText: string
  formattedDifference: string
}

/**
 * Calculates reconciliation variance (difference).
 * Formula: difference = actualBalance - expectedBalance
 * (Requirement 6.2, Property 17)
 *
 * - difference > 0: Surplus (actual balance is higher than recorded)
 * - difference < 0: Shortfall (actual balance is lower than recorded)
 * - difference = 0: Balanced (actual balance matches recorded)
 */
export function calculateReconciliationVariance(actualBalance: number, expectedBalance: number): number {
  const actual = Math.round(Number(actualBalance) || 0)
  const expected = Math.round(Number(expectedBalance) || 0)
  const diff = actual - expected
  return diff === 0 ? 0 : diff
}

/**
 * Formats variance into displayable rupiah with human-readable status badge.
 */
export function formatReconciliationVariance(difference: number): FormattedVariance {
  const rounded = Math.round(Number(difference) || 0)
  const abs = Math.abs(rounded)

  if (rounded > 0) {
    return {
      difference: rounded,
      absDifference: abs,
      status: 'surplus',
      badgeText: 'Saldo Lebih',
      formattedDifference: `+${formatIDR(abs)}`,
    }
  }

  if (rounded < 0) {
    return {
      difference: rounded,
      absDifference: abs,
      status: 'shortfall',
      badgeText: 'Saldo Kurang',
      formattedDifference: `-${formatIDR(abs)}`,
    }
  }

  return {
    difference: 0,
    absDifference: 0,
    status: 'balanced',
    badgeText: 'Sesuai',
    formattedDifference: formatIDR(0),
  }
}

/**
 * Creates an immutable reconciliation audit record.
 * (Requirement 6.3, 6.5)
 */
export function createReconciliationRecord(params: CreateReconciliationRecordParams): WalletReconciliation {
  const expected = Math.round(Number(params.expectedBalance) || 0)
  const actual = Math.round(Number(params.actualBalance) || 0)
  const difference = params.difference !== undefined
    ? Math.round(Number(params.difference) || 0)
    : calculateReconciliationVariance(actual, expected)

  const reconciledAt = typeof params.reconciledAt === 'string'
    ? params.reconciledAt
    : (params.reconciledAt instanceof Date ? params.reconciledAt.toISOString() : new Date().toISOString())

  const id = params.id || `recon-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  return {
    id,
    walletId: params.walletId,
    reconciledAt,
    expectedBalance: expected,
    actualBalance: actual,
    difference,
    note: params.note?.trim() || undefined,
    adjustmentTransactionId: params.adjustmentTransactionId,
  }
}

/**
 * Creates an explicit adjustment transaction payload when difference !== 0.
 * Non-destructive: Creates a new adjustment entry without modifying or deleting
 * existing historical transactions.
 * (Requirement 6.3, 6.4, Property 18)
 *
 * - If difference > 0: Creates an 'income' adjustment transaction
 * - If difference < 0: Creates an 'expense' adjustment transaction
 * - If difference === 0: Returns null (no adjustment transaction needed)
 */
export function createAdjustmentTransaction(
  walletId: string,
  walletLabel: string,
  difference: number,
  note?: string,
  date: Date = new Date(),
  id?: string
): Transaction | null {
  if (difference === 0) return null

  const absAmount = Math.abs(difference)
  const isSurplus = difference > 0
  const txId = id || `txn-adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

  const autoDescription = isSurplus
    ? `Penyesuaian saldo lebih (${walletLabel})`
    : `Penyesuaian saldo kurang (${walletLabel})`

  const detailedNote = note?.trim() || `Koreksi rekonsiliasi saldo (${isSurplus ? '+' : '-'}Rp${absAmount.toLocaleString('id-ID')})`

  return {
    id: txId,
    kind: 'transaction',
    description: autoDescription,
    amount: absAmount,
    type: isSurplus ? 'income' : 'expense',
    category: 'lainnya',
    subcategory: 'Penyesuaian Saldo',
    paymentMethod: walletId,
    note: detailedNote,
    date: date instanceof Date && !Number.isNaN(date.getTime()) ? new Date(date.getTime()) : new Date(),
  }
}

/**
 * Retrieves audit history of reconciliations for a given wallet,
 * sorted by reconciledAt descending (most recent first).
 * (Requirement 6.5)
 */
export function getWalletReconciliationHistory(
  walletId: string,
  reconciliations: WalletReconciliation[]
): WalletReconciliation[] {
  if (!Array.isArray(reconciliations)) return []
  return reconciliations
    .filter(r => r.walletId === walletId)
    .sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime())
}

/**
 * Retrieves all reconciliation records sorted by reconciledAt descending.
 */
export function getAllReconciliationHistory(
  reconciliations: WalletReconciliation[]
): WalletReconciliation[] {
  if (!Array.isArray(reconciliations)) return []
  return [...reconciliations].sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime())
}

/**
 * Returns the latest reconciliation record for a wallet, if any.
 */
export function getLatestWalletReconciliation(
  walletId: string,
  reconciliations: WalletReconciliation[]
): WalletReconciliation | undefined {
  const history = getWalletReconciliationHistory(walletId, reconciliations)
  return history[0]
}

/**
 * Determines whether a wallet has never been reconciled.
 * (Requirement 6.6, Property 19)
 *
 * An unreconciled warning badge SHALL be displayed if and only if
 * wallet.lastReconciledAt is undefined/null/empty OR wallet has zero reconciliation records.
 */
export function hasNeverBeenReconciled(
  wallet: { id: string; lastReconciledAt?: string },
  reconciliations?: WalletReconciliation[]
): boolean {
  if (!wallet.lastReconciledAt || (typeof wallet.lastReconciledAt === 'string' && !wallet.lastReconciledAt.trim())) return true
  if (Array.isArray(reconciliations)) {
    const hasRecord = reconciliations.some(r => r.walletId === wallet.id)
    if (!hasRecord) return true
  }
  return false
}

/**
 * Prepares reconciliation prompts for a wallet by extracting current recorded balance.
 * (Requirement 6.1)
 */
export function prepareWalletReconciliation(wallet: WalletAccount): {
  walletId: string
  walletLabel: string
  expectedBalance: number
} {
  return {
    walletId: wallet.id,
    walletLabel: wallet.label,
    expectedBalance: wallet.balance,
  }
}

/**
 * Namespace object grouping all ReconciliationManager logic.
 */
export const ReconciliationManager = {
  calculateVariance: calculateReconciliationVariance,
  createRecord: createReconciliationRecord,
  createAdjustmentTransaction,
  getHistory: getWalletReconciliationHistory,
  getAllHistory: getAllReconciliationHistory,
  getLatest: getLatestWalletReconciliation,
  hasNeverBeenReconciled,
  formatVariance: formatReconciliationVariance,
  prepare: prepareWalletReconciliation,
}
