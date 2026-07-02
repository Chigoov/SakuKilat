'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Wallet, X } from 'lucide-react'
import { useCustomizationStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { BottomSheet } from '@/components/bottom-sheet'

interface PaymentTile {
  id: string
  label: string
  keywords: string[]
  isBuiltin: boolean
}

const BUILTIN_PAYMENTS: [string, string][] = [
  ['gopay', 'GoPay'],
  ['ovo', 'OVO'],
  ['dana', 'DANA'],
  ['shopeepay', 'ShopeePay'],
  ['bca', 'BCA'],
  ['bni', 'BNI'],
  ['bri', 'BRI'],
  ['mandiri', 'Mandiri'],
  ['jago', 'Jago'],
  ['qris', 'QRIS'],
  ['kartu', 'Kartu'],
  ['transfer', 'Transfer'],
  ['tunai', 'Tunai'],
]

function parseKeywords(raw: string): string[] {
  return raw.split(/[,\n]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)
}

export function PersonalizationSettings({ showCategories = true }: { showCategories?: boolean }) {
  const {
    customPayments,
    hiddenPaymentIds,
    addCustomPayment,
    updateCustomPayment,
    removeCustomPayment,
    restoreHiddenPayment,
  } = useCustomizationStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftKeywords, setDraftKeywords] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newKeywords, setNewKeywords] = useState('')

  const customPaymentMap = useMemo(
    () => new Map(customPayments.map((item) => [item.id, item])),
    [customPayments]
  )

  const payments = useMemo<PaymentTile[]>(() => {
    const builtins = BUILTIN_PAYMENTS
      .filter(([id]) => !hiddenPaymentIds.includes(id))
      .map(([id, label]) => {
        const custom = customPaymentMap.get(id)
        return {
          id,
          label: custom?.label ?? label,
          keywords: custom?.keywords ?? [id],
          isBuiltin: true,
        }
      })

    const customs = customPayments
      .filter((item) => !BUILTIN_PAYMENTS.some(([id]) => id === item.id))
      .map((item) => ({
        id: item.id,
        label: item.label,
        keywords: item.keywords,
        isBuiltin: false,
      }))

    return [...builtins, ...customs]
  }, [customPaymentMap, customPayments, hiddenPaymentIds])

  const selected = useMemo(
    () => payments.find((item) => item.id === selectedId) ?? null,
    [payments, selectedId]
  )

  const hiddenBuiltins = useMemo(
    () => BUILTIN_PAYMENTS.filter(([id]) => hiddenPaymentIds.includes(id)),
    [hiddenPaymentIds]
  )

  const startEdit = (item: PaymentTile) => {
    setSelectedId(item.id)
    setEditing(true)
    setDraftLabel(item.label)
    setDraftKeywords(item.keywords.join(', '))
  }

  const closeSheet = () => {
    setSelectedId(null)
    setEditing(false)
    setDraftLabel('')
    setDraftKeywords('')
  }

  const handleSaveEdit = () => {
    if (!selected) return
    updateCustomPayment(selected.id, {
      label: draftLabel.trim(),
      keywords: parseKeywords(draftKeywords),
    })
    closeSheet()
  }

  const handleAdd = () => {
    const label = newLabel.trim()
    if (!label) return
    addCustomPayment(label, parseKeywords(newKeywords))
    setNewLabel('')
    setNewKeywords('')
  }

  return (
    <div>
      <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-[var(--sk-text-dim)]">
        Personalisasi
      </p>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sk-cyan-dim)]">
            <Wallet className="h-4 w-4 text-[var(--sk-cyan)]" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--sk-text)]">Metode Bayar</h3>
          <span className="ml-auto text-xs font-medium text-[var(--sk-cyan)]">{payments.length} aktif</span>
        </div>

        <div className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Nama metode baru"
              className="min-w-0 rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-sm text-[var(--sk-text)] outline-none"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newLabel.trim()}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                newLabel.trim() ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
              )}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={newKeywords}
            onChange={(event) => setNewKeywords(event.target.value)}
            placeholder="Keyword, pisahkan koma"
            className="mt-2 w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-sm text-[var(--sk-text)] outline-none"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {payments.map((payment) => (
            <button
              key={payment.id}
              type="button"
              onClick={() => setSelectedId(payment.id)}
              className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-left"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sk-surface-2)]">
                <Wallet className="h-4 w-4 text-[var(--sk-text-muted)]" />
              </div>
              <p className="mt-3 truncate text-sm font-semibold text-[var(--sk-text)]">{payment.label}</p>
              <p className="mt-1 text-[11px] text-[var(--sk-text-dim)]">{payment.keywords.length} keyword</p>
            </button>
          ))}
        </div>

        {hiddenBuiltins.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Disembunyikan</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hiddenBuiltins.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => restoreHiddenPayment(id)}
                  className="rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--sk-text)]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {showCategories ? (
        <p className="mt-4 text-[11px] text-[var(--sk-text-dim)]">Kategori diatur dari panel khusus di bawah.</p>
      ) : null}

      <BottomSheet
        open={Boolean(selectedId)}
        onClose={closeSheet}
        title={editing ? 'Edit metode bayar' : selected?.label ?? ''}
        subtitle={editing ? 'Atur nama dan keyword.' : selected?.isBuiltin ? 'Bawaan' : 'Custom'}
      >
        {editing && selected ? (
          <div className="space-y-3">
            <input
              value={draftLabel}
              onChange={(event) => setDraftLabel(event.target.value)}
              className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-sm text-[var(--sk-text)] outline-none"
              placeholder="Nama metode"
            />
            <input
              value={draftKeywords}
              onChange={(event) => setDraftKeywords(event.target.value)}
              className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-sm text-[var(--sk-text)] outline-none"
              placeholder="Keyword, pisahkan koma"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-xl bg-[var(--sk-cyan)] px-3 py-2 text-sm font-semibold text-[#090D16]"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-xl bg-[var(--sk-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--sk-text-dim)]"
              >
                Batal
              </button>
            </div>
          </div>
        ) : selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[var(--sk-surface-2)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Keyword</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface)] px-2.5 py-1 text-[11px] text-[var(--sk-text)]"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => startEdit(selected)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--sk-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--sk-text)]"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  removeCustomPayment(selected.id)
                  closeSheet()
                }}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold',
                  selected.isBuiltin ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]' : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                )}
              >
                <X className="h-4 w-4" />
                {selected.isBuiltin ? 'Sembunyikan' : 'Hapus'}
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  )
}
