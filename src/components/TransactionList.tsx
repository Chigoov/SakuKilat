'use client';

import { useMemo } from 'react';
import { Trash2, Pencil, ArrowRightLeft } from 'lucide-react';
import type { Transaction } from '@/types';
import { useTransactionActions } from '@/store/StoreProvider';
import { formatIDR, formatRelativeDate, formatTime } from '@/lib/format';
import { getCategoryConfig, getPaymentLabel } from '@/lib/categories';

interface TransactionListProps {
  transactions: Transaction[];
  limit?: number;
  zenMode?: boolean;
}

export function TransactionList({ transactions, limit, zenMode }: TransactionListProps) {
  const { deleteTransaction } = useTransactionActions();

  const sorted = useMemo(() => {
    const sortedTxs = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime());
    return limit ? sortedTxs.slice(0, limit) : sortedTxs;
  }, [transactions, limit]);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-[var(--sk-text-dim)]">
        Belum ada transaksi. Mulai catat di kolom bawah!
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {sorted.map((tx) => {
        const isTransfer = tx.kind === 'transfer' || tx.kind === 'saving';
        const cat = getCategoryConfig(tx.category);
        const Icon = isTransfer ? ArrowRightLeft : cat.icon;
        const sign = tx.type === 'income' ? '+' : '-';

        return (
          <div
            key={tx.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[var(--sk-surface-2)] transition-colors group"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isTransfer ? 'bg-[var(--sk-surface-3)]' : cat.bg}`}>
              <Icon className={`w-3.5 h-3.5 ${isTransfer ? 'text-[var(--sk-text-muted)]' : cat.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--sk-text)] truncate">{tx.description}</p>
              <p className="text-[10px] text-[var(--sk-text-dim)]">
                {isTransfer ? `${getPaymentLabel(tx.fromWalletId ?? '')} → ${getPaymentLabel(tx.toWalletId ?? '')}` : `${cat.label} · ${getPaymentLabel(tx.paymentMethod)}`}
                {' · '}
                {formatRelativeDate(tx.date)} {formatTime(tx.date)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-sm font-semibold tabular-nums ${tx.type === 'income' ? 'text-[var(--sk-green)]' : 'text-[var(--sk-text)]'}`}>
                {zenMode ? '•••' : `${sign}${formatIDR(tx.amount)}`}
              </span>
              <button
                onClick={() => deleteTransaction(tx.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-red-dim)] hover:text-[var(--sk-red)] opacity-0 group-hover:opacity-100 transition-all"
                aria-label="Hapus transaksi"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
