'use client'

import { cn } from '@/lib/utils'

type FilterTab = 'semua' | 'pengeluaran' | 'pemasukan'

interface FilterTabsProps {
  active: FilterTab
  onChange: (tab: FilterTab) => void
  counts: { semua: number; pengeluaran: number; pemasukan: number }
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'semua',        label: 'Semua' },
  { key: 'pengeluaran',  label: 'Keluar' },
  { key: 'pemasukan',    label: 'Masuk' },
]

export function FilterTabs({ active, onChange, counts }: FilterTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filter transaksi"
      className="flex items-center gap-1.5 rounded-[24px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-1.5"
    >
      {TABS.map(tab => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-[18px] px-3.5 py-2 text-sm font-semibold transition-all duration-200',
            active === tab.key
              ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
              : 'text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]'
          )}
        >
          {tab.label}
          <span
            className={cn(
              'inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums transition-colors duration-200',
              active === tab.key
                ? 'bg-[var(--sk-surface-2)] text-[var(--sk-text)]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
            )}
          >
            {counts[tab.key]}
          </span>
        </button>
      ))}
    </div>
  )
}

export type { FilterTab }
