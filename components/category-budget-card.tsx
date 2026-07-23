'use client'

import { useMemo } from 'react'
import { PiggyBank } from 'lucide-react'
import { useCustomizationStore, useTransactionData } from '@/lib/store'
import { rangeCategoryBreakdown } from '@/lib/stats'
import { getCategoryConfig, getCategoryHex } from '@/components/category-badge'
import { formatIDR } from '@/lib/parser'
import { cn } from '@/lib/utils'

interface BudgetRow {
  id: string
  label: string
  spent: number
  budget: number
  pct: number
}

export function CategoryBudgetCard() {
  const { customCategories } = useCustomizationStore()
  const { transactions } = useTransactionData()

  const rows = useMemo<BudgetRow[]>(() => {
    const budgeted = customCategories.filter((category) => (category.monthlyBudget ?? 0) > 0)
    if (budgeted.length === 0) return []

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const spentByCategory = new Map(
      rangeCategoryBreakdown(transactions, start, end, 'expense').map((slice) => [slice.category, slice.total])
    )

    return budgeted
      .map((category) => {
        const budget = category.monthlyBudget ?? 0
        const spent = spentByCategory.get(category.id) ?? 0
        return {
          id: category.id,
          label: getCategoryConfig(category.id).label ?? category.label,
          spent,
          budget,
          pct: budget > 0 ? spent / budget : 0,
        }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [customCategories, transactions])

  if (rows.length === 0) return null

  return (
    <section className="mt-5 rounded-[30px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sk-cyan-dim)]">
          <PiggyBank className="h-5 w-5 text-[var(--sk-cyan)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--sk-text-muted)]">Budget per kategori</p>
          <p className="text-[11px] text-[var(--sk-text-dim)]">Bulan ini</p>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const capped = Math.min(100, Math.round(row.pct * 100))
          const over = row.spent > row.budget
          const near = !over && row.pct >= 0.8
          const barColor = over ? 'var(--sk-red)' : near ? 'var(--sk-amber)' : getCategoryHex(row.id)
          const remaining = row.budget - row.spent
          return (
            <div key={row.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--sk-text)]">{row.label}</span>
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums whitespace-nowrap',
                    over ? 'text-[var(--sk-red)]' : near ? 'text-[var(--sk-amber)]' : 'text-[var(--sk-text-muted)]'
                  )}
                >
                  {formatIDR(row.spent)} / {formatIDR(row.budget)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--sk-surface-2)]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.max(capped, row.spent > 0 ? 4 : 0)}%`, background: barColor }}
                />
              </div>
              <p
                className={cn(
                  'mt-1 text-[11px] tabular-nums',
                  over ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text-dim)]'
                )}
              >
                {over
                  ? `Lewat batas ${formatIDR(row.spent - row.budget)}`
                  : `Sisa ${formatIDR(remaining)} (${Math.round(row.pct * 100)}%)`}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
