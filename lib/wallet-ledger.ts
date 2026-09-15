/**
 * SakuKilat — Single Source of Truth Wallet Ledger & Self-Healing Reconciliation
 * -----------------------------------------------------------------------------
 * Computes wallet balance deterministically:
 *   wallet.currentBalance = wallet.openingBalance + sum(ledger impacts)
 */

import type { Transaction, WalletAccount } from './mock-data.ts'

export interface AuditLogEntry {
  id: string
  timestamp: string
  type: 'SELF_HEALING_RECONCILIATION' | string
  walletId: string
  previousBalance: number
  reconciledBalance: number
  drift: number
  details?: string
}

export interface BalanceReconciliationResult {
  walletId: string
  cachedBalance: number
  calculatedBalance: number
  drift: number
  corrected: boolean
  auditLogId?: string
}

/**
 * Calculates the deterministic net impact of a single transaction on a given wallet.
 *
 * Rules:
 * - Transfer: -amount for fromWalletId, +amount for toWalletId (0 if self-transfer)
 * - Standard income: +amount if paymentMethod matches
 * - Standard expense: -amount if paymentMethod matches
 */
export function calculateLedgerImpact(tx: Transaction, walletId: string): number {
  if (!tx || !walletId) return 0
  const rawAmount = Number(tx.amount)
  if (!Number.isFinite(rawAmount) || Number.isNaN(rawAmount)) return 0
  const amount = Math.round(Math.abs(rawAmount))
  if (amount === 0) return 0

  if (tx.kind === 'transfer') {
    if (tx.fromWalletId === walletId && tx.toWalletId === walletId) return 0
    if (tx.fromWalletId === walletId) return -amount
    if (tx.toWalletId === walletId) return amount
    return 0
  }

  if (tx.paymentMethod === walletId) {
    if (tx.type === 'income') return amount
    if (tx.type === 'expense') return -amount
  }

  return 0
}

/**
 * Single Source of Truth: Computes wallet balance strictly as:
 *   openingBalance + sum(ledger impacts)
 */
export function computeWalletBalanceFromLedger(
  openingBalance: number = 0,
  walletId: string,
  transactions: Transaction[]
): number {
  const opening = Number.isFinite(openingBalance) ? Math.round(openingBalance) : 0
  if (!walletId || !Array.isArray(transactions)) return opening

  const ledgerImpact = transactions.reduce((sum, tx) => {
    return sum + calculateLedgerImpact(tx, walletId)
  }, 0)

  return opening + ledgerImpact
}

/**
 * Self-healing reconciliation engine:
 * Detects drift between cached balance and ledger summation,
 * produces an audit log entry for each drift, and returns reconciled wallets.
 */
export function reconcileWalletBalances(
  wallets: WalletAccount[],
  transactions: Transaction[]
): { reconciledWallets: WalletAccount[]; auditLogs: AuditLogEntry[] } {
  if (!Array.isArray(wallets)) return { reconciledWallets: [], auditLogs: [] }
  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const auditLogs: AuditLogEntry[] = []

  const reconciledWallets = wallets.map((wallet) => {
    const rawOpening = wallet.openingBalance !== undefined ? wallet.openingBalance : wallet.balance
    const opening = Number.isFinite(rawOpening) ? Math.round(rawOpening) : 0
    const calculated = computeWalletBalanceFromLedger(opening, wallet.id, safeTransactions)
    const cached = wallet.currentBalance !== undefined ? wallet.currentBalance : wallet.balance

    if (cached !== calculated || wallet.balance !== calculated || wallet.currentBalance !== calculated) {
      const drift = calculated - cached
      const logEntry: AuditLogEntry = {
        id: `audit-${Date.now()}-${wallet.id}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        type: 'SELF_HEALING_RECONCILIATION',
        walletId: wallet.id,
        previousBalance: cached,
        reconciledBalance: calculated,
        drift,
        details: `Auto-reconciled wallet ${wallet.label} (${wallet.id}) drift of ${drift}`,
      }
      auditLogs.push(logEntry)

      return {
        ...wallet,
        openingBalance: opening,
        currentBalance: calculated,
        balance: calculated,
        lastReconciledAt: new Date().toISOString(),
      }
    }

    return {
      ...wallet,
      openingBalance: opening,
      currentBalance: calculated,
      balance: calculated,
    }
  })

  return { reconciledWallets, auditLogs }
}
