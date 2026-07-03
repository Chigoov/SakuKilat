'use client'

import { useState, useMemo } from 'react'
import { CalendarClock, Check, Pause, Play, Plus, Repeat, Trash2, Zap } from 'lucide-react'
import { useTransactionActions } from '@/lib/store'
import {
  useRecurringTransactions,
  cadenceLabel,
  type RecurringCadence,
} from '@/lib/recurring'
import { parseEntry, formatIDR } from '@/lib/parser'
import { cn } from '@/lib/utils'

const CADENCES: { id: RecurringCadence; label: string }[] = [
  { id: 'daily',   label: 'Hari' },
  { id: 'weekly',  label: 'Minggu' },
  { id: 'monthly', label: 'Bulan' },
]

function formatRelativeDue(ts: number): string {
  const diff = ts - Date.now()
  if (diff <= 0) return 'Jatuh tempo'
  const days = Math.round(diff / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Hari ini'
  if (days === 1) return 'Besok'
  if (days < 7)   return `${days} hari lagi`
  if (days < 30)  return `${Math.round(days / 7)} minggu lagi`
  return `${Math.round(days / 30)} bulan lagi`
}

export function RecurringManager() {
  const { addTransaction } = useTransactionActions()
  const { templates, addTemplate, removeTemplate, toggleActive, fireNow, dueCount } =
    useRecurringTransactions(addTransaction)

  const [draft, setDraft]       = useState('')
  const [cadence, setCadence]   = useState<RecurringCadence>('monthly')
  const [adding, setAdding]     = useState(false)

  // Live preview using the same parser as Smart Input.
  const preview = useMemo(() => {
    if (!draft.trim()) return null
    return parseEntry(draft)
  }, [draft])

  const canSave = !!preview && preview.kind === 'transaction'

  const handleAdd = () => {
    if (!canSave || !preview) return
    addTemplate({
      input: draft.trim(),
      label: preview.kind === 'transaction' ? preview.description : draft.trim(),
      cadence,
    })
    setDraft('')
    setAdding(false)
    // gentle haptic — matches the rest of the app
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12)
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center">
          <Repeat className="w-4 h-4 text-[var(--sk-cyan)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--sk-text)]">Transaksi Otomatis</h3>
        {dueCount > 0 && (
          <span
            className="ml-auto text-[10px] font-semibold text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full"
            title="Jatuh tempo akan otomatis tercatat saat kamu buka app"
          >
            {dueCount} jatuh tempo
          </span>
        )}
        {dueCount === 0 && templates.length > 0 && (
          <span className="ml-auto text-[10px] text-[var(--sk-text-dim)]">
            {templates.length} aktif
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--sk-text-dim)] leading-relaxed mb-3">
        Untuk gaji, langganan, cicilan, atau transaksi lain yang berulang. Saat jadwalnya jatuh tempo,
        SakuKilat akan mencatatnya otomatis ketika app dibuka; tombol petir mencatat satu transaksi sekarang.
      </p>

      {/* Existing templates */}
      {templates.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {templates.map(t => (
            <div
              key={t.id}
              className={cn(
                'rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3 py-2.5',
                !t.active && 'opacity-60'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--sk-text)] truncate">
                    {t.label}
                  </p>
                  <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 flex items-center gap-1.5">
                    <CalendarClock className="w-3 h-3 inline" />
                    {cadenceLabel(t.cadence)}
                    <span className="text-[var(--sk-text-dim)]">·</span>
                    <span className={cn(
                      t.active && t.nextDueAt <= Date.now()
                        ? 'text-[var(--sk-amber)] font-medium'
                        : ''
                    )}>
                      {t.active ? formatRelativeDue(t.nextDueAt) : 'Dijeda'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fireNow(t.id)}
                  aria-label="Catat sekarang"
                  title="Catat sekarang tanpa mengubah jadwal"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-cyan)] hover:bg-[var(--sk-cyan-dim)] transition-colors"
                >
                  <Zap className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(t.id)}
                  aria-label={t.active ? 'Jeda' : 'Aktifkan'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
                >
                  {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeTemplate(t.id)}
                  aria-label="Hapus"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-red)] hover:bg-[var(--sk-red-dim)] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex flex-col gap-2.5">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="cth. spotify 54k debit  ·  gaji 8jt"
            className="w-full bg-transparent outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)]"
          />

          {preview && preview.kind === 'transaction' && (
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]">
                {preview.description}
              </span>
              <span className={cn(
                'font-bold tabular-nums',
                preview.type === 'expense' ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
              )}>
                {preview.type === 'expense' ? '-' : '+'}{formatIDR(preview.amount)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {CADENCES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCadence(c.id)}
                  className={cn(
                    'flex-1 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-colors',
                    cadence === c.id
                      ? 'bg-[var(--sk-cyan)] text-[var(--sk-bg)]'
                      : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canSave}
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-all',
                canSave
                  ? 'bg-[var(--sk-cyan)] text-[var(--sk-bg)] hover:opacity-90'
                  : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed'
              )}
              aria-label="Simpan"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setDraft('') }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)] transition-colors"
              aria-label="Batal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[10px] text-[var(--sk-text-dim)] leading-relaxed">
            Pakai sintaks yang sama kayak Smart Input. Akan otomatis tercatat tiap{' '}
            <strong className="text-[var(--sk-text-muted)]">{cadenceLabel(cadence).toLowerCase()}</strong>{' '}
            saat kamu buka app.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--sk-surface)] border border-dashed border-[var(--sk-border-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {templates.length === 0 ? 'Tambah gaji, langganan, atau cicilan' : 'Tambah transaksi otomatis'}
        </button>
      )}
    </section>
  )
}
