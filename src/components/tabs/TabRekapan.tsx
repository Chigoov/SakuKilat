'use client';

import { useMemo, useState } from 'react';
import { useTransactionData, useBudgetStore, usePreferenceStore } from '@/store/StoreProvider';
import { periodInsight, categoryBreakdown, trendSeries, monthlyTotals } from '@/lib/analytics';
import { formatIDR } from '@/lib/format';
import { getCategoryConfig, assignDistinctChartColors } from '@/lib/categories';

export function TabRekapan() {
  const { transactions } = useTransactionData();
  const { monthlyBudget } = useBudgetStore();
  const { zenMode } = usePreferenceStore();
  const [period, setPeriod] = useState<'minggu' | 'bulan'>('bulan');

  const insight = useMemo(() => periodInsight(transactions, period), [transactions, period]);
  const breakdown = useMemo(() => categoryBreakdown(transactions, new Date(), 'expense'), [transactions]);
  const trend = useMemo(() => trendSeries(transactions, '7d'), [transactions]);
  const totals = useMemo(() => monthlyTotals(transactions), [transactions]);
  const colors = useMemo(() => assignDistinctChartColors(breakdown.map((b) => b.category)), [breakdown]);

  const maxTrend = Math.max(...trend.map((t) => t.expense), 1);

  return (
    <div className="px-4 pt-4 space-y-2 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--sk-text)]">Rekapan</h1>

        {/* Period toggle — small inline pill */}
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-[var(--sk-surface-2)]">
          {(['minggu', 'bulan'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${period === p ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'text-[var(--sk-text-muted)]'}`}
            >
              {p === 'minggu' ? '7H' : 'Bulan'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary — compact inline */}
      <div className="grid grid-cols-3 gap-1">
        <div className="rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] p-1.5">
          <p className="text-[9px] text-[var(--sk-text-dim)]">Masuk</p>
          <p className="text-[11px] font-bold text-[var(--sk-green)] tabular-nums">{zenMode ? '•••' : formatIDR(insight.income)}</p>
        </div>
        <div className="rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] p-1.5">
          <p className="text-[9px] text-[var(--sk-text-dim)]">Keluar</p>
          <p className="text-[11px] font-bold text-[var(--sk-red)] tabular-nums">{zenMode ? '•••' : formatIDR(insight.expense)}</p>
        </div>
        <div className="rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] p-1.5">
          <p className="text-[9px] text-[var(--sk-text-dim)]">Selisih</p>
          <p className={`text-[11px] font-bold tabular-nums ${insight.net >= 0 ? 'text-[var(--sk-green)]' : 'text-[var(--sk-red)]'}`}>
            {zenMode ? '•••' : formatIDR(insight.net)}
          </p>
        </div>
      </div>

      {/* Trend chart (simple bar) */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5">
        <h3 className="text-[10px] font-semibold text-[var(--sk-text-muted)] mb-1.5">Tren 7 Hari</h3>
        <div className="flex items-end justify-between gap-1 h-16">
          {trend.map((t, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t bg-[var(--sk-cyan)] opacity-80 transition-all"
                  style={{ height: `${(t.expense / maxTrend) * 100}%`, minHeight: t.expense > 0 ? '4px' : '0' }}
                />
              </div>
              <span className="text-[9px] text-[var(--sk-text-dim)]">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      {breakdown.length > 0 && (
        <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5">
          <h3 className="text-[10px] font-semibold text-[var(--sk-text-muted)] mb-1.5">Pengeluaran per Kategori</h3>
          <div className="space-y-1">
            {breakdown.slice(0, 8).map((cat) => {
              const config = getCategoryConfig(cat.category);
              const pct = Math.round(cat.pct * 100);
              return (
                <div key={cat.category} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--sk-text-muted)] w-16 truncate">{config.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--sk-surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: colors[cat.category] ?? '#66789A' }}
                    />
                  </div>
                  <span className="text-[9px] text-[var(--sk-text-dim)] tabular-nums w-14 text-right">{zenMode ? '•••' : formatIDR(cat.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5">
        <h3 className="text-[10px] font-semibold text-[var(--sk-text-muted)] mb-1">Insight</h3>
        <div className="space-y-0.5">
          {insight.takeaways.map((t, i) => (
            <p key={i} className="text-[10px] text-[var(--sk-text-muted)] leading-relaxed">• {t}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
