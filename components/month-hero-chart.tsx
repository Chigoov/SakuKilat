'use client'

/**
 * Donut chart Beranda — dipisah ke file sendiri agar `recharts` (~300KB, library
 * terberat di app) di-code-split dan HANYA dimuat lewat dynamic import, bukan di
 * critical path Beranda. Shell Beranda bisa tampil dulu, chart menyusul.
 */

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { getCategoryHex } from '@/components/category-badge'

export function MonthHeroChart({
  empty,
  slices,
}: {
  empty: boolean
  slices: Array<{ category: string; total: number }>
}) {
  if (empty) {
    return (
      <div className="animate-home-chart-spin mx-auto flex h-[190px] w-full max-w-[300px] items-center justify-center">
        <div className="flex h-[180px] w-[180px] items-center justify-center rounded-full border-[8px] border-dashed border-[var(--sk-border-2)] text-center text-sm leading-relaxed text-[var(--sk-text-dim)]">
          Belum
          <br />
          ada data
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto h-[190px] w-full max-w-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="total"
            innerRadius={56}
            outerRadius={84}
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
    </div>
  )
}
