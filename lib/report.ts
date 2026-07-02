'use client'

/**
 * SakuKilat - Generator Laporan PDF (tanpa library, lewat cetak browser)
 * ----------------------------------------------------------------------
 * HTML laporan dirender ke iframe/modal lalu user bisa cetak atau simpan
 * jadi PDF dari print dialog bawaan browser/perangkat.
 */

import type { Transaction } from './mock-data'
import { monthlyTotals, categoryBreakdown } from './stats'
import { getCategoryConfig, getPaymentLabel } from '@/components/category-badge'
import { formatIDR } from '@/lib/parser'

function isMoneyMove(t: Transaction): boolean {
  return t.kind === 'transfer' || t.kind === 'saving'
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

function fmtTanggal(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export interface ReportOptions {
  ref?: Date
  profileName?: string | null
}

export function buildMonthlyReportHtml(transactions: Transaction[], opts: ReportOptions = {}): string {
  const ref = opts.ref ?? new Date()
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)

  const inMonth = transactions
    .filter(t => t.date >= start && t.date < end)
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const { income, expense, balance } = monthlyTotals(transactions, ref)
  const expenseSlices = categoryBreakdown(transactions, ref, 'expense')
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(ref)
  const printedAt = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date())

  const rows = inMonth.map(t => {
    const move = isMoneyMove(t)
    const sign = move ? '' : t.type === 'income' ? '+' : '-'
    const color = move ? '#64748b' : t.type === 'income' ? '#1e8e5a' : '#c0392b'
    const kategori = move
      ? (t.kind === 'saving' ? 'Simpanan' : 'Pindah uang')
      : getCategoryConfig(t.category).label
    const dompet = move && t.fromWalletId && t.toWalletId
      ? `${getPaymentLabel(t.fromWalletId)} -> ${getPaymentLabel(t.toWalletId)}`
      : getPaymentLabel(t.paymentMethod)
    return `<tr>
      <td>${fmtTanggal(t.date)}</td>
      <td>${esc(t.description)}</td>
      <td>${esc(kategori)}</td>
      <td>${esc(dompet)}</td>
      <td class="num" style="color:${color}">${sign}${formatIDR(t.amount)}</td>
    </tr>`
  }).join('')

  const allocRows = expenseSlices.map(s => `<tr>
      <td>${esc(getCategoryConfig(s.category).label)}</td>
      <td class="num">${Math.round(s.pct * 100)}%</td>
      <td class="num">${formatIDR(s.total)}</td>
    </tr>`).join('')

  const who = opts.profileName?.trim() ? ` · ${esc(opts.profileName.trim())}` : ''

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Laporan SakuKilat - ${esc(monthLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1f2b; margin: 0; padding: 28px; background: #ffffff; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
  .logo { width: 26px; height: 26px; border-radius: 7px; background: #38bdf8; color: #08111e; display: flex; align-items: center; justify-content: center; font-weight: 800; }
  .cards { display: flex; gap: 10px; margin-bottom: 20px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; }
  .card .val { font-size: 16px; font-weight: 700; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 22px; }
  th { text-align: left; background: #f1f5f9; padding: 7px 9px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; border-bottom: 1px solid #e2e8f0; }
  td { padding: 7px 9px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  h2 { font-size: 14px; margin: 8px 0 8px; }
  .foot { margin-top: 10px; color: #94a3b8; font-size: 10px; text-align: center; }
  .empty { color: #94a3b8; font-size: 12px; padding: 16px 0; text-align: center; }
  @media (max-width: 720px) {
    body { padding: 16px; }
    .cards { display: grid; grid-template-columns: 1fr; gap: 8px; }
    table { font-size: 11px; }
    th, td { padding: 6px 7px; }
    h1 { font-size: 18px; }
  }
  @media print {
    body { padding: 0; }
    @page { margin: 16mm; }
  }
</style></head>
<body>
  <div class="brand"><div class="logo">SK</div><strong>SakuKilat</strong></div>
  <h1>Laporan Keuangan - ${esc(monthLabel)}</h1>
  <div class="sub">Dibuat ${esc(printedAt)}${who}</div>

  <div class="cards">
    <div class="card"><div class="lbl">Pemasukan</div><div class="val" style="color:#1e8e5a">${formatIDR(income)}</div></div>
    <div class="card"><div class="lbl">Pengeluaran</div><div class="val" style="color:#c0392b">${formatIDR(expense)}</div></div>
    <div class="card"><div class="lbl">Saldo Bersih</div><div class="val" style="color:${balance >= 0 ? '#1a1f2b' : '#c0392b'}">${balance < 0 ? '-' : ''}${formatIDR(Math.abs(balance))}</div></div>
  </div>

  <h2>Alokasi Pengeluaran</h2>
  ${expenseSlices.length > 0 ? `<table>
    <thead><tr><th>Kategori</th><th class="num">Porsi</th><th class="num">Jumlah</th></tr></thead>
    <tbody>${allocRows}</tbody>
  </table>` : '<div class="empty">Belum ada pengeluaran bulan ini.</div>'}

  <h2>Rincian Transaksi (${inMonth.length})</h2>
  ${inMonth.length > 0 ? `<table>
    <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Dompet</th><th class="num">Nominal</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : '<div class="empty">Belum ada transaksi bulan ini.</div>'}

  <div class="foot">SakuKilat - pencatat keuangan lokal. Laporan ini dibuat dari data di perangkatmu.</div>
</body></html>`
}

export function printMonthlyReport(transactions: Transaction[], opts: ReportOptions = {}): boolean {
  if (typeof window === 'undefined') return false
  const html = buildMonthlyReportHtml(transactions, opts)
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.onload = () => {
    window.setTimeout(() => {
      w.focus()
      w.print()
    }, 350)
  }
  return true
}
