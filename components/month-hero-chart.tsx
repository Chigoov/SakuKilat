'use client'

/**
 * Donut chart Beranda — dipisah ke file sendiri agar `recharts` (~300KB, library
 * terberat di app) di-code-split dan HANYA dimuat lewat dynamic import, bukan di
 * critical path Beranda. Shell Beranda bisa tampil dulu, chart menyusul.
 */

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { getCategoryHex } from '@/components/category-badge'
import { formatIDRCompact } from '@/lib/parser'

export function MonthHeroChart({
  empty,
  slices,
  centerLabel,
  centerValue,
}: {
  empty: boolean
  slices: Array<{ category: string; total: number }>
  centerLabel?: string
  centerValue?: string
}) {
  if (empty) {
    return (
      <div className="relative mx-auto flex h-[155px] w-full max-w-[280px] items-center justify-center">
        <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full border-[6px] border-dashed border-[var(--sk-border-2)] text-center text-xs leading-relaxed text-[var(--sk-text-dim)]">
          Belum
          <br />
          ada data
        </div>
      </div>
    )
  }

  const totalSpent = slices.reduce((acc, item) => acc + item.total, 0)

  return (
    <div className="relative mx-auto h-[155px] w-full max-w-[280px] flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="total"
            innerRadius={48}
            outerRadius={70}
            paddingAngle={3}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {slices.map((slice) => (
              <Cell key={slice.category} fill={getCategoryHex(slice.category)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Teks di tengah Donut Chart */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--sk-text-dim)]">
          {centerLabel ?? 'Pengeluaran'}
        </span>
        <span className="text-sm font-bold text-[var(--sk-text)] tabular-nums">
          {centerValue ?? formatIDRCompact(totalSpent)}
        </span>
      </div>
    </div>
  )
}
