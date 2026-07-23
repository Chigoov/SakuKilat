'use client'

/**
 * SakuKilat -- Modal Ekspor PDF Terfilter
 * -------------------------------------------------
 * User bisa pilih:
 *   1) Tipe transaksi   : Pengeluaran / Pemasukan / Keduanya
 *   2) Rentang tanggal  : dari - sampai (opsional)
 *   3) Kategori         : multi-select (checkbox). Kosong = semua kategori.
 *
 * Klik "Ekspor PDF" -> generate HTML report -> print dialog browser.
 */

import { useMemo, useState } from 'react'
import { Check, FileText, Printer, X } from 'lucide-react'
import { CATEGORY_CONFIG, CategoryIcon, getCategoryConfig } from '@/components/category-badge'
import { useCustomizationStore, useFeedbackStore, useTransactionData } from '@/lib/store'
import { printFilteredReport, type FilteredReportOptions } from '@/lib/report'
import { cn } from '@/lib/utils'

type Tipe = 'expense' | 'income' | 'all'

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function fromDateInputValue(value: string): Date | null {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Kategori built-in yang tergolong income; sisanya expense (kecuali transfer yang di-hide)
const INCOME_CATEGORY_IDS = new Set(['gaji', 'investasi', 'penjualan', 'cashback', 'refund', 'hadiah', 'freelance'])

export function FilteredPdfExport() {
  const { transactions } = useTransactionData()
  const { customCategories } = useCustomizationStore()
  const { showToast } = useFeedbackStore()

  const [open, setOpen] = useState(false)
  const [tipe, setTipe] = useState<Tipe>('expense')
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set())
  const [start, setStart] = useState<string>(() => {
    const d = new Date()
    return toDateInputValue(new Date(d.getFullYear(), d.getMonth(), 1))
  })
  const [end, setEnd] = useState<string>(() => toDateInputValue(new Date()))

  // Daftar kategori yang bisa dipilih (di-filter berdasar tipe)
  const availableCategories = useMemo(() => {
    const builtinIds = Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>
    const builtin = builtinIds
      .filter((id) => {
        if (id === 'transfer') return false
        if (tipe === 'all') return true
        const isIncomeCat = INCOME_CATEGORY_IDS.has(id)
        return tipe === 'income' ? isIncomeCat : !isIncomeCat
      })
      .map((id) => ({ id: id as string, label: CATEGORY_CONFIG[id].label }))

    const custom = customCategories
      .filter((c) => tipe === 'all' || (c.type ?? 'expense') === tipe)
      .map((c) => ({ id: c.id, label: c.label }))

    return [...builtin, ...custom]
  }, [tipe, customCategories])

  const toggleCat = (id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedCats(new Set(availableCategories.map((c) => c.id)))
  const clearAll = () => setSelectedCats(new Set())

  const handleExport = () => {
    const startDate = fromDateInputValue(start)
    const endDate = fromDateInputValue(end)

    // Guard #1: langsung dari objek Date (paling ketat, pakai getTime supaya
    // tidak bergantung pada operator overloading Date -> primitive).
    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
      showToast('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.', 'error')
      return
    }
    // Guard #2 (safety net): kalau parser mengembalikan null tapi field terisi
    // string yang jelas terbalik (misal automation isi 2026-07-25 vs 2026-07-23),
    // fallback ke perbandingan string lexicographic ISO date valid.
    if (start && end && start.length === 10 && end.length === 10 && start > end) {
      showToast('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.', 'error')
      return
    }

    const opts: FilteredReportOptions = {
      transactionType: tipe,
      start: startDate ?? undefined,
      end: endDate ?? undefined,
      categoryIds: selectedCats.size > 0 ? Array.from(selectedCats) : undefined,
    }
    const ok = printFilteredReport(transactions, opts)
    if (!ok) {
      showToast('Gagal membuka print dialog. Cek popup blocker browser.', 'error')
    } else {
      setOpen(false)
      showToast('Laporan PDF terfilter dibuka di tab baru.', 'success')
    }
  }

  return (
    <>
      {/* Tombol pemicu */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--sk-text)] transition-colors hover:bg-[var(--sk-surface-2)]"
      >
        <FileText className="h-4 w-4 text-[var(--sk-cyan)]" />
        <div className="flex-1 min-w-0">
          <div>Ekspor PDF per kategori</div>
          <div className="text-[11px] font-normal text-[var(--sk-text-dim)]">Pilih kategori & rentang tanggal</div>
        </div>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ekspor PDF terfilter"
        >
          <div
            className="w-full max-w-md rounded-t-[28px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5 shadow-2xl sm:rounded-[28px] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--sk-text)]">Ekspor PDF Terfilter</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tipe transaksi */}
            <div className="mb-4">
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Tipe transaksi
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {([
                  ['expense', 'Pengeluaran'],
                  ['income', 'Pemasukan'],
                  ['all', 'Keduanya'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setTipe(value); setSelectedCats(new Set()) }}
                    className={cn(
                      'rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
                      tipe === value
                        ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
                        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rentang tanggal */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                  Dari tanggal
                </label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 text-sm text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                  Sampai tanggal
                </label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 text-sm text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
                />
              </div>
            </div>

            {/* Kategori (multi-select) */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                  Kategori ({selectedCats.size > 0 ? selectedCats.size : 'semua'})
                </label>
                <div className="flex gap-2 text-[11px] font-semibold">
                  <button type="button" onClick={selectAll} className="text-[var(--sk-cyan)]">Pilih semua</button>
                  <span className="text-[var(--sk-text-dim)]">|</span>
                  <button type="button" onClick={clearAll} className="text-[var(--sk-text-muted)]">Reset</button>
                </div>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {availableCategories.map((cat) => {
                  const active = selectedCats.has(cat.id)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCat(cat.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors truncate text-left',
                        active
                          ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                          : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                      )}
                    >
                      <CategoryIcon category={cat.id} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{cat.label}</span>
                      {active && <Check className="h-3.5 w-3.5" />}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-[var(--sk-text-dim)]">
                Tidak pilih kategori? Laporan akan mencakup semua kategori.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 h-11 rounded-xl bg-[var(--sk-surface-2)] text-sm font-semibold text-[var(--sk-text-muted)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="flex-1 h-11 rounded-xl bg-[var(--sk-cyan)] text-sm font-semibold text-[#090D16] flex items-center justify-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Ekspor PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
