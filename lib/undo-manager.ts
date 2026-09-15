/**
 * SakuKilat — Sequence-Checked Safe Undo Manager & Double-Undo Guard
 * -----------------------------------------------------------------
 * Prevents race conditions and stale inverse delta applications
 * by validating mutationSequenceId prior to rolling back transaction state.
 */

import type { Transaction, WalletAccount } from './mock-data.ts'
import { reconcileWalletBalances } from './wallet-ledger.ts'

export interface UndoSnapshot {
  mutationSequenceId: number
  timestamp: number
  transaction: Transaction
  actionType: 'CREATE' | 'EDIT' | 'DELETE'
  previousTransactionState?: Transaction
}

export function executeSafeUndo(
  snapshot: UndoSnapshot,
  currentSequenceId: number,
  state: { transactions: Transaction[]; wallets: WalletAccount[] }
): {
  success: boolean
  state: { transactions: Transaction[]; wallets: WalletAccount[] }
  reason?: string
} {
  // Sequence guard: reject if state has advanced beyond this snapshot
  if (currentSequenceId !== snapshot.mutationSequenceId) {
    return {
      success: false,
      state,
      reason:
        'State aplikasi telah termutasi setelah transaksi ini. Pembatalan otomatis dicegah demi integritas saldo.',
    }
  }

  let updatedTransactions = [...state.transactions]

  if (snapshot.actionType === 'CREATE') {
    updatedTransactions = updatedTransactions.filter((t) => t.id !== snapshot.transaction.id)
  } else if (snapshot.actionType === 'DELETE') {
    if (!updatedTransactions.some((t) => t.id === snapshot.transaction.id)) {
      updatedTransactions = [snapshot.transaction, ...updatedTransactions]
    }
  } else if (snapshot.actionType === 'EDIT' && snapshot.previousTransactionState) {
    updatedTransactions = updatedTransactions.map((t) =>
      t.id === snapshot.transaction.id ? snapshot.previousTransactionState! : t
    )
  }

  // Reconcile balances dynamically using Single Source of Truth
  const { reconciledWallets } = reconcileWalletBalances(state.wallets, updatedTransactions)

  return {
    success: true,
    state: {
      transactions: updatedTransactions,
      wallets: reconciledWallets,
    },
  }
}
