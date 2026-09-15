'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Gauge,
  Landmark,
  Lock,
  Pencil,
  PiggyBank,
  Plus,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
  Inbox,
} from 'lucide-react'
import {
  useBudgetStore,
  useWalletStore,
  useRuleInboxStore,
  useMonthlyCloseStore,
  useNetWorthStore,
} from '@/lib/store'
import { GoalPlanner } from '@/components/goal-planner'
import { BillManager } from '@/components/bill-manager'
import { CategoryManager } from '@/components/category-manager'
import { PersonalizationSettings } from '@/components/personalization-settings'
import { ReconciliationModal } from '@/components/reconciliation-modal'
import { MonthlyCloseModal } from '@/components/monthly-close-modal'
import { InboxReviewDrawer } from '@/components/inbox-review'
import { NetWorthModal } from '@/components/net-worth-panel'
import { hasNeverBeenReconciled } from '@/lib/reconciliation'
import { formatMonthLabel } from '@/lib/monthly-close'
import { formatIDR } from '@/lib/parser'
import { parseAmountInput } from '@/lib/amount'
import type { WalletType } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { RupiahInput } from '@/components/rupiah-input'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import {
  SAKU_SECTIONS,
  getSakuSections,
  getSectionById,
  getSubmenuItem,
  isSubmenuImplemented,
  type SakuSectionConfig,
  type SubmenuItem,
} from '@/lib/saku-sections'

export {
  SAKU_SECTIONS,
  getSakuSections,
  getSectionById,
  getSubmenuItem,
  isSubmenuImplemented,
  type SakuSectionConfig,
  type SubmenuItem,
}

const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-wallet',
  card: 'Kartu',
  savings: 'Simpan',
  other: 'Lainnya',
}

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Wallet,
  SlidersHorizontal,
  PiggyBank,
  ShieldCheck,
}

export type ActiveSakuLayer = 'wallets' | 'money-move' | 'categories' | 'inbox' | 'budget' | null

export function BudgetSettings() {
  const { monthlyBudget, setMonthlyBudget } = useBudgetStore()
  const [raw, setRaw] = useState('')
  const parsedAmount = parseAmountInput(raw)

  const handleSave = () => {
    if (!parsedAmount) return
    setMonthlyBudget(parsedAmount)
    setRaw('')
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-amber-dim)] flex items-center justify-center">
          <Gauge className="w-4 h-4 text-[var(--sk-amber)]" />
        </div>
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">Budget Bulanan</h4>
        <span className="ml-auto text-xs font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
          {formatIDR(monthlyBudget)}
        </span>
      </div>

      <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <RupiahInput
            value={raw}
            onChange={(_num, str) => setRaw(str)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="cth. 1.500.000"
            containerClassName="flex-1 min-w-0 bg-transparent border-0"
            className="py-0 pr-0"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!parsedAmount}
            className={cn(
              'w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-all shrink-0',
              parsedAmount
                ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_10px_var(--sk-cyan-glow)]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed'
            )}
            aria-label="Simpan budget"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-[var(--sk-text-dim)] mt-2">
          Anggaran ini menjadi acuan batas pengeluaran dan perhitungan sisa jatah belanja harian di Beranda.
        </p>
      </div>
    </section>
  )
}

export function WalletManager({ onOpenReconcile }: { onOpenReconcile?: (walletId: string) => void }) {
  const { wallets, totalStored, addWallet, updateWallet, removeWallet, reconciliations } = useWalletStore()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<WalletType>('ewallet')
  const [balance, setBalance] = useState('')
  const [keywords, setKeywords] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [isAddingWallet, setIsAddingWallet] = useState(false)
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    label: '',
    type: 'ewallet' as WalletType,
    balance: '',
    keywords: '',
  })
  const visibleWallets = showAll ? wallets : wallets.slice(0, 4)
  const hasHiddenWallets = wallets.length > visibleWallets.length

  useEffect(() => {
    if (!confirmDeleteWalletId) return
    const timer = setTimeout(() => setConfirmDeleteWalletId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmDeleteWalletId])

  const handleAdd = () => {
    const name = label.trim()
    if (!name) return

    addWallet(
      name,
      type,
      parseAmountInput(balance),
      keywords.split(',').map(item => item.trim()).filter(Boolean)
    )
    setLabel('')
    setBalance('')
    setKeywords('')
    setIsAddingWallet(false)
  }

  const startEdit = (wallet: typeof wallets[number]) => {
    setEditingId(wallet.id)
    setDraft({
      label: wallet.label,
      type: wallet.type,
      balance: String(wallet.balance),
      keywords: wallet.keywords.join(', '),
    })
  }

  const handleUpdate = () => {
    if (!editingId) return
    updateWallet(editingId, {
      label: draft.label,
      type: draft.type,
      balance: parseAmountInput(draft.balance),
      keywords: draft.keywords.split(',').map(item => item.trim()).filter(Boolean),
    })
    setEditingId(null)
  }

  return (
    <section data-tour="wallets" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center">
          <Wallet className="w-4 h-4 text-[var(--sk-cyan)]" />
        </div>
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">Saku Uang</h4>
        <span className="ml-auto text-xs font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full">
          {wallets.length} aktif
        </span>
      </div>

      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 mb-1 flex items-center justify-between gap-3 shadow-sm">
        <div>
          <p className="text-xs text-[var(--sk-text-dim)] mb-1">Total tersimpan</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--sk-text)]" data-amount>
            {formatIDR(totalStored)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('sakukilat:open-manual-entry', { detail: { seed: 'pindah 0 bca ke gopay' } }))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]/25 text-xs font-semibold hover:bg-[var(--sk-cyan)] hover:text-[#090D16] transition-all shrink-0 min-h-[40px]"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Pindah Saldo
        </button>
      </div>

      {!isAddingWallet ? (
        <button
          type="button"
          onClick={() => setIsAddingWallet(true)}
          className="w-full mb-1 min-h-[44px] py-3 rounded-xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface)] text-xs font-semibold text-[var(--sk-cyan)] flex items-center justify-center gap-2 hover:bg-[var(--sk-surface-2)] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah Saku Baru
        </button>
      ) : (
        <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-3 mb-1 flex flex-col gap-2 animate-fade-in shadow-md">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-[var(--sk-text)]">Tambah Saku Baru</p>
            <button
              type="button"
              onClick={() => { setIsAddingWallet(false); setLabel(''); setBalance(''); setKeywords('') }}
              className="text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nama saku"
              autoFocus
              className="min-w-0 bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)]"
            />
            <select
              value={type}
              onChange={e => setType(e.target.value as WalletType)}
              className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]"
            >
              <option value="ewallet">E-wallet</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="savings">Simpan</option>
              <option value="card">Kartu</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <RupiahInput
              value={balance}
              onChange={(_num, str) => setBalance(str)}
              placeholder="Saldo awal"
              containerClassName="min-w-0 rounded-lg text-xs"
              prefixClassName="text-xs pl-2.5 pr-0.5"
              className="text-xs py-1.5 pr-2.5"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!label.trim()}
              className={cn(
                'px-4 py-2.5 min-h-[40px] rounded-lg flex items-center justify-center font-semibold text-xs transition-all',
                label.trim() ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed'
              )}
              aria-label="Tambah saku"
            >
              Simpan
            </button>
          </div>
          <input
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder="Keyword opsional, pisahkan koma"
            className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)]"
          />
        </div>
      )}

      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {visibleWallets.map(wallet => {
          const isEditing = editingId === wallet.id

          return (
            <div key={wallet.id} className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3.5 min-w-0 shadow-sm">
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={draft.label}
                      onChange={e => setDraft(prev => ({ ...prev, label: e.target.value }))}
                      className="min-w-0 bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]"
                      placeholder="Nama saku"
                    />
                    <select
                      value={draft.type}
                      onChange={e => setDraft(prev => ({ ...prev, type: e.target.value as WalletType }))}
                      className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]"
                    >
                      <option value="ewallet">E-wallet</option>
                      <option value="bank">Bank</option>
                      <option value="cash">Cash</option>
                      <option value="savings">Simpan</option>
                      <option value="card">Kartu</option>
                      <option value="other">Lainnya</option>
                    </select>
                  </div>
                  <RupiahInput
                    value={draft.balance}
                    onChange={(_num, str) => setDraft(prev => ({ ...prev, balance: str }))}
                    containerClassName="min-w-0 rounded-lg text-xs"
                    prefixClassName="text-xs pl-2.5 pr-0.5"
                    className="text-xs py-1.5 pr-2.5"
                    placeholder="Saldo"
                  />
                  <input
                    value={draft.keywords}
                    onChange={e => setDraft(prev => ({ ...prev, keywords: e.target.value }))}
                    className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]"
                    placeholder="Keyword, pisahkan koma"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={handleUpdate}
                      className="h-11 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold py-2 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                    >
                      <Check className="w-4 h-4" />
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="h-11 rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] text-xs font-semibold py-2 flex items-center justify-center gap-1.5 border border-[var(--sk-border)] active:scale-95 transition-transform"
                    >
                      <X className="w-4 h-4" />
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center flex-shrink-0 border border-[var(--sk-border)]">
                      <Landmark className="w-4 h-4 text-[var(--sk-text-muted)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-[var(--sk-text)] truncate">{wallet.label}</p>
                        <span className="text-[9px] text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] border border-[var(--sk-border)] rounded px-1.5 py-0.5 shrink-0">
                          {WALLET_TYPE_LABELS[wallet.type]}
                        </span>
                        {hasNeverBeenReconciled(wallet, reconciliations) && (
                          <span
                            data-testid={`unreconciled-badge-${wallet.id}`}
                            className="text-[9px] font-semibold text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border border-[var(--sk-amber)]/30 rounded px-1.5 py-0.5 shrink-0 flex items-center gap-1"
                            title="Saku ini belum pernah direkonsiliasi"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Belum Rekonsiliasi
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold tabular-nums text-[var(--sk-text-muted)] mt-0.5" data-amount>
                        {formatIDR(wallet.balance)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenReconcile?.(wallet.id)}
                      className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-cyan)] active:scale-95 flex items-center justify-center shrink-0 transition-all border border-[var(--sk-border)]"
                      aria-label={`Rekonsiliasi ${wallet.label}`}
                      title={`Rekonsiliasi saldo ${wallet.label}`}
                    >
                      <Scale className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(wallet)}
                      className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] active:scale-95 flex items-center justify-center shrink-0 transition-all border border-[var(--sk-border)]"
                      aria-label={`Edit ${wallet.label}`}
                      title={`Edit ${wallet.label}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    {confirmDeleteWalletId === wallet.id ? (
                      <div className="flex items-center gap-1 shrink-0 animate-fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            removeWallet(wallet.id)
                            setConfirmDeleteWalletId(null)
                          }}
                          className="h-10 px-3 rounded-xl bg-[var(--sk-red)] text-white text-[11px] font-bold active:scale-95 transition-transform flex items-center gap-1 shadow-sm"
                          aria-label={`Konfirmasi hapus ${wallet.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus?</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteWalletId(null)}
                          className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] active:scale-95 transition-all flex items-center justify-center border border-[var(--sk-border)]"
                          aria-label="Batal hapus"
                          title="Batal hapus"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWalletId(wallet.id)}
                        className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-[var(--sk-red-dim)] text-[var(--sk-red)] hover:bg-[rgba(248,113,113,0.22)] active:scale-95 flex items-center justify-center shrink-0 transition-all border border-[rgba(248,113,113,0.3)]"
                        aria-label={`Hapus ${wallet.label}`}
                        title={`Hapus ${wallet.label}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {(hasHiddenWallets || showAll) && (
        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          className="mt-2 w-full min-h-[44px] rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-4 py-3 text-xs font-semibold text-[var(--sk-cyan)] hover:bg-[var(--sk-surface-2)] transition-colors shadow-sm"
        >
          {showAll ? 'Ringkas daftar saku' : `Lihat semua ${wallets.length} saku`}
        </button>
      )}
    </section>
  )
}

export function MoneyMovePanel() {
  const { wallets, transferMoney, saveMoney } = useWalletStore()
  const [fromId, setFromId] = useState(wallets[0]?.id ?? '')
  const [toId, setToId] = useState(wallets[1]?.id ?? '')
  const [amount, setAmount] = useState('')
  const parsedAmount = parseAmountInput(amount)

  const handleTransfer = () => {
    if (transferMoney(fromId, toId, parsedAmount)) setAmount('')
  }

  const handleSave = () => {
    if (saveMoney(fromId, parsedAmount)) setAmount('')
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-green-dim)] flex items-center justify-center">
          <ArrowRightLeft className="w-4 h-4 text-[var(--sk-green)]" />
        </div>
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">Pindah & Simpan Saldo</h4>
      </div>

      <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3.5 flex flex-col gap-2.5 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <select value={fromId} onChange={e => setFromId(e.target.value)} className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]">
            {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>Dari {wallet.label}</option>)}
          </select>
          <select value={toId} onChange={e => setToId(e.target.value)} className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]">
            {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>Ke {wallet.label}</option>)}
          </select>
        </div>
        <RupiahInput
          value={amount}
          onChange={(_num, str) => setAmount(str)}
          placeholder="Nominal transfer"
          containerClassName="min-w-0 rounded-lg text-xs"
          prefixClassName="text-xs pl-2.5 pr-0.5"
          className="text-xs py-1.5 pr-2.5"
        />
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!parsedAmount || fromId === toId}
            className="h-11 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] disabled:bg-[var(--sk-surface-2)] disabled:text-[var(--sk-text-dim)] text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Pindah
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!parsedAmount || fromId === 'tabungan'}
            className="h-11 rounded-xl bg-[var(--sk-green)] text-[#090D16] disabled:bg-[var(--sk-surface-2)] disabled:text-[var(--sk-text-dim)] text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <PiggyBank className="w-4 h-4" />
            Simpan
          </button>
        </div>
      </div>
    </section>
  )
}

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  badge?: React.ReactNode
  children: React.ReactNode
  dataTestId?: string
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  badge,
  children,
  dataTestId,
}: BottomSheetProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={dataTestId}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 animate-fade-in p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--sk-border)] flex-shrink-0 bg-[var(--sk-surface)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] flex items-center justify-center border border-[var(--sk-cyan)]/25 shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--sk-text)] leading-tight truncate">
                  {title}
                </h3>
                {badge}
              </div>
              {subtitle && (
                <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            data-testid="layer-close-btn"
            onClick={onClose}
            aria-label={`Tutup ${title}`}
            className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 bg-[var(--sk-bg)]">
          {children}
        </div>
      </div>
    </div>
  )
}

export function UnimplementedSubmenuItem({ item }: { item: SubmenuItem }) {
  return (
    <div
      data-testid={`submenu-${item.id}`}
      data-submenu-id={item.id}
      data-implemented="false"
      aria-disabled="true"
      className="rounded-xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between opacity-75 cursor-not-allowed select-none min-h-[44px]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-[var(--sk-text-dim)]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--sk-text)] truncate">{item.label}</p>
          {item.description && (
            <p className="text-[11px] text-[var(--sk-text-dim)] truncate">{item.description}</p>
          )}
        </div>
      </div>
      <span className="shrink-0 text-[10px] font-medium text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2 py-0.5 rounded-full ml-2">
        {item.targetPhase ? `Segera Hadir (${item.targetPhase})` : 'Segera Hadir'}
      </span>
    </div>
  )
}

export interface SakuSubmenuNavigatorProps {
  className?: string
}

export function SakuSubmenuNavigator({ className }: SakuSubmenuNavigatorProps) {
  const { wallets, totalStored, reconciliations } = useWalletStore()
  const { monthlyBudget } = useBudgetStore()
  const { pendingInboxCount } = useRuleInboxStore()
  const { monthlyCloses } = useMonthlyCloseStore()
  const { debts, netWorthSummary } = useNetWorthStore()

  // Stacking Layer State
  const [activeLayer, setActiveLayer] = useState<ActiveSakuLayer>(null)

  // Subsystem Modals
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false)
  const [reconcileWalletId, setReconcileWalletId] = useState<string | undefined>(undefined)
  const [inboxDrawerOpen, setInboxDrawerOpen] = useState(false)
  const [monthlyCloseModalOpen, setMonthlyCloseModalOpen] = useState(false)
  const [monthlyCloseYear, setMonthlyCloseYear] = useState<number | undefined>(undefined)
  const [monthlyCloseMonth, setMonthlyCloseMonth] = useState<number | undefined>(undefined)
  const [netWorthModalOpen, setNetWorthModalOpen] = useState(false)

  // LIFO Back-Stack Lifecycle Integration
  const openLayer = useCallback((layer: NonNullable<ActiveSakuLayer>) => {
    setActiveLayer(layer)
    pushBackLayer({
      id: `saku-layer-${layer}`,
      type: 'sheet',
      onClose: () => setActiveLayer(null),
    })
  }, [])

  const closeLayer = useCallback(() => {
    if (activeLayer) {
      removeBackLayer(`saku-layer-${activeLayer}`)
    }
    setActiveLayer(null)
  }, [activeLayer])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeLayer) {
        removeBackLayer(`saku-layer-${activeLayer}`)
      }
    }
  }, [activeLayer])

  const handleOpenReconcile = useCallback((walletId?: string) => {
    setReconcileWalletId(walletId || wallets[0]?.id)
    setReconcileModalOpen(true)
  }, [wallets])

  const handleOpenMonthlyClose = useCallback((year?: number, month?: number) => {
    setMonthlyCloseYear(year)
    setMonthlyCloseMonth(month)
    setMonthlyCloseModalOpen(true)
  }, [])

  const handleOpenNetWorth = useCallback(() => {
    setNetWorthModalOpen(true)
  }, [])

  useEffect(() => {
    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      handleOpenReconcile(detail?.walletId)
    }
    window.addEventListener('sakukilat:open-reconciliation', handleCustomEvent)
    return () => {
      window.removeEventListener('sakukilat:open-reconciliation', handleCustomEvent)
    }
  }, [handleOpenReconcile])

  useEffect(() => {
    const handleCustomCloseEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      handleOpenMonthlyClose(detail?.year, detail?.month)
    }
    window.addEventListener('sakukilat:open-monthly-close', handleCustomCloseEvent)
    return () => {
      window.removeEventListener('sakukilat:open-monthly-close', handleCustomCloseEvent)
    }
  }, [handleOpenMonthlyClose])

  useEffect(() => {
    const handleOpenInbox = () => setInboxDrawerOpen(true)
    window.addEventListener('sakukilat:open-inbox-review', handleOpenInbox)
    return () => {
      window.removeEventListener('sakukilat:open-inbox-review', handleOpenInbox)
    }
  }, [])

  useEffect(() => {
    const handleOpenNetWorthEvent = () => setNetWorthModalOpen(true)
    window.addEventListener('sakukilat:open-net-worth', handleOpenNetWorthEvent)
    return () => {
      window.removeEventListener('sakukilat:open-net-worth', handleOpenNetWorthEvent)
    }
  }, [])

  const latestClosedRecord = useMemo(() => {
    return monthlyCloses.find(r => !r.isReopened)
  }, [monthlyCloses])

  const unreconciledWalletsCount = useMemo(() => {
    return wallets.filter(w => hasNeverBeenReconciled(w, reconciliations)).length
  }, [wallets, reconciliations])

  return (
    <div data-testid="saku-submenu-navigator" className={cn('flex flex-col gap-4', className)}>
      {/* 1. Saku & Pembayaran */}
      <section
        id="saku-pembayaran"
        data-testid="section-saku-pembayaran"
        data-section-id="saku-pembayaran"
        className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 flex flex-col gap-3 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center shrink-0 border border-[var(--sk-border)]">
            <Wallet className="w-4 h-4 text-[var(--sk-text)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Saku & Pembayaran</h3>
              <span className="text-[10px] font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full">
                {wallets.length} aktif
              </span>
            </div>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">
              Daftar saku, metode pembayaran & transfer antar-saku
            </p>
          </div>
        </div>

        {/* Quick Summary Total Tersimpan */}
        <div className="rounded-xl bg-[var(--sk-surface-2)]/60 border border-[var(--sk-border)] p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-[var(--sk-text-dim)] mb-0.5">Total tersimpan di {wallets.length} saku</p>
            <p className="text-xl font-bold tabular-nums text-[var(--sk-text)]" data-amount>
              {formatIDR(totalStored)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('sakukilat:open-manual-entry', { detail: { seed: 'pindah 0 bca ke gopay' } }))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]/25 text-xs font-semibold hover:bg-[var(--sk-cyan)] hover:text-[#090D16] transition-all shrink-0 min-h-[40px]"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Pindah Saldo
          </button>
        </div>

        {/* Menu Tile 1: Daftar Saku */}
        <button
          type="button"
          data-testid="submenu-daftar-saku"
          data-submenu-id="daftar-saku"
          data-implemented="true"
          onClick={() => openLayer('wallets')}
          className="w-full min-h-[44px] rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)] transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-cyan)]/25 text-[var(--sk-cyan)]">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                  Daftar Saku
                </p>
                <span className="text-[10px] font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full">
                  {wallets.length} saku
                </span>
              </div>
              <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
                Kelola saldo dompet kas, rekening bank, saldo e-wallet
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] shrink-0" />
        </button>

        {/* Menu Tile 2: Budget Bulanan */}
        <button
          type="button"
          data-testid="submenu-budget"
          data-submenu-id="budget"
          data-implemented="true"
          onClick={() => openLayer('budget')}
          className="w-full min-h-[44px] rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)] transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--sk-amber-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-amber)]/25 text-[var(--sk-amber)]">
              <Gauge className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                  Budget Bulanan
                </p>
                <span className="text-[10px] font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
                  {formatIDR(monthlyBudget)}
                </span>
              </div>
              <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
                Atur batas anggaran belanja untuk panduan jatah harian
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] shrink-0" />
        </button>

        {/* Menu Tile 3: Pindah Saldo (Transfer Antar-Saku) */}
        <button
          type="button"
          data-testid="submenu-transfer-antar-saku"
          data-submenu-id="transfer-antar-saku"
          data-implemented="true"
          onClick={() => openLayer('money-move')}
          className="w-full min-h-[44px] rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)] transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--sk-green-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-green)]/25 text-[var(--sk-green)]">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                Pindah Saldo
              </p>
              <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
                Transfer dana antar-saku atau alokasikan ke tabungan
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] shrink-0" />
        </button>

        {/* Menu Tile 4: Metode Pembayaran */}
        <button
          type="button"
          data-testid="submenu-metode-pembayaran"
          data-submenu-id="metode-pembayaran"
          data-implemented="true"
          onClick={() => openLayer('wallets')}
          className="w-full min-h-[44px] rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)] transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-cyan)]/25 text-[var(--sk-cyan)]">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                Metode Pembayaran
              </p>
              <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
                Atur opsi pembayaran aktif & visibilitas dompet
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] shrink-0" />
        </button>
      </section>

      {/* 2. Kategori & Subkategori */}
      <section
        id="kategori-subkategori"
        data-testid="section-kategori-subkategori"
        data-section-id="kategori-subkategori"
        className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 flex flex-col gap-3 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center shrink-0 border border-[var(--sk-border)]">
            <SlidersHorizontal className="w-4 h-4 text-[var(--sk-text)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Kategori & Subkategori</h3>
              <span className="text-[10px] font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
                Kategori & Sub
              </span>
            </div>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">
              Kategori pemasukan, kategori pengeluaran & subkategori
            </p>
          </div>
        </div>

        {/* Menu Tile: Kelola Kategori & Subkategori */}
        <button
          type="button"
          data-testid="submenu-kategori-subkategori"
          data-submenu-id="kategori-subkategori"
          data-implemented="true"
          onClick={() => openLayer('categories')}
          className="w-full min-h-[44px] rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)] transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--sk-amber-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-amber)]/25 text-[var(--sk-amber)]">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                Kelola Kategori & Subkategori
              </p>
              <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
                Buka panel manajemen kategori pemasukan, pengeluaran & subkategori
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] shrink-0" />
        </button>

        {/* Subcategories quick badges container */}
        <div className="flex flex-wrap gap-1.5" data-testid="saku-subcategories-badge-container">
          <span
            data-testid="submenu-kategori-pemasukan"
            data-submenu-id="kategori-pemasukan"
            data-implemented="true"
            className="text-[11px] font-medium text-[var(--sk-green)] bg-[var(--sk-green-dim)] px-2.5 py-1 rounded-lg border border-[var(--sk-green)]/20"
          >
            Kategori pemasukan
          </span>
          <span
            data-testid="submenu-kategori-pengeluaran"
            data-submenu-id="kategori-pengeluaran"
            data-implemented="true"
            className="text-[11px] font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2.5 py-1 rounded-lg border border-[var(--sk-amber)]/20"
          >
            Kategori pengeluaran
          </span>
          <span
            data-testid="submenu-subkategori"
            data-submenu-id="subkategori"
            data-implemented="true"
            className="text-[11px] font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2.5 py-1 rounded-lg border border-[var(--sk-cyan)]/20"
          >
            Subkategori
          </span>
        </div>

        {/* Inbox Review & Rules Entry Button */}
        <button
          type="button"
          data-testid="btn-open-inbox-review"
          onClick={() => setInboxDrawerOpen(true)}
          className="w-full min-h-[44px] rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50 p-3 flex items-center justify-between gap-2 hover:bg-[var(--sk-surface-2)] transition-colors text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0">
              <Inbox className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--sk-text)] leading-tight">
                Inbox Review & Aturan Otomatis
              </p>
              <p className="text-[10px] text-[var(--sk-text-dim)] truncate">
                Tinjau transaksi & kelola pola aturan kategori lokal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {pendingInboxCount > 0 ? (
              <span
                data-testid="saku-inbox-badge"
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] border border-[var(--sk-amber)]/30"
              >
                {pendingInboxCount} perlu cek
              </span>
            ) : (
              <span className="text-[10px] font-medium text-[var(--sk-green)] bg-[var(--sk-green-dim)] px-2 py-0.5 rounded-full">
                Bersih
              </span>
            )}
          </div>
        </button>
      </section>

      {/* 3. Perencanaan Keuangan (Telah Migrasi ke Tab Rencana) */}
      <section
        id="perencanaan-keuangan"
        data-testid="section-perencanaan-keuangan"
        data-section-id="perencanaan-keuangan"
        className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 flex flex-col gap-3 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center shrink-0 border border-[var(--sk-border)]">
            <PiggyBank className="w-4 h-4 text-[var(--sk-text)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Perencanaan Keuangan</h3>
              <span className="text-[10px] font-bold text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full border border-[var(--sk-cyan)]/30">
                Menu Rencana
              </span>
            </div>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">
              Goals target tabungan dan tagihan rutin (Menu Rencana)
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--sk-cyan)]/30 bg-[var(--sk-cyan-dim)]/30 p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--sk-text)] leading-tight">
              Telah Dipindahkan ke Menu Rencana
            </p>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5">
              Target tabungan (Goals) & tagihan rutin kini memiliki menu mandiri
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('sakukilat:navigate', { detail: { tab: 'rencana' } }))}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-sm min-h-[44px] flex items-center justify-center"
          >
            Buka Rencana
          </button>
        </div>

        {/* Preserved test anchors */}
        <div data-testid="submenu-goals" data-submenu-id="goals" data-implemented="true" className="hidden">
          <GoalPlanner />
        </div>
        <div data-testid="submenu-tagihan-langganan" data-submenu-id="tagihan-langganan" data-implemented="true" className="hidden">
          <BillManager />
        </div>
      </section>

      {/* 4. Kontrol Keuangan */}
      <section
        id="kontrol-keuangan"
        data-testid="section-kontrol-keuangan"
        data-section-id="kontrol-keuangan"
        className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 flex flex-col gap-3 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--sk-surface-2)] flex items-center justify-center shrink-0 border border-[var(--sk-border)]">
            <ShieldCheck className="w-4 h-4 text-[var(--sk-text)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Kontrol Keuangan</h3>
              {unreconciledWalletsCount > 0 ? (
                <span className="text-[10px] font-semibold text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
                  {unreconciledWalletsCount} perlu cek
                </span>
              ) : undefined}
            </div>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">
              Rekonsiliasi saldo, tutup bulan & net worth
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <div className="rounded-xl bg-[var(--sk-surface-2)]/40 border border-[var(--sk-border)] p-3">
            <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
              Modul kontrol keuangan membantu menjaga integritas catatan, mencocokkan saldo fisik dengan buku, dan mengunci pembukuan akhir bulan.
            </p>
          </div>

          {/* Submenu: Rekonsiliasi Saldo */}
          <div
            data-testid="submenu-rekonsiliasi-saldo"
            data-submenu-id="rekonsiliasi-saldo"
            data-implemented="true"
            className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)]/70 transition-colors min-h-[44px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-cyan)]/25">
                <Scale className="w-4 h-4 text-[var(--sk-cyan)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[var(--sk-text)] truncate">
                    Rekonsiliasi Saldo
                  </p>
                  {unreconciledWalletsCount > 0 ? (
                    <span
                      data-testid="kontrol-unreconciled-count-badge"
                      className="text-[10px] font-semibold text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border border-[var(--sk-amber)]/30 px-2 py-0.5 rounded-full shrink-0"
                    >
                      {unreconciledWalletsCount} saku belum cek
                    </span>
                  ) : (
                    <span
                      data-testid="kontrol-reconciled-count-badge"
                      className="text-[10px] font-medium text-[var(--sk-green)] bg-[var(--sk-green-dim)] border border-[var(--sk-green)]/25 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Semua sesuai
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                  Pencocokan saldo catatan dengan fisik/bank
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-open-reconciliation"
              onClick={() => handleOpenReconcile()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_8px_var(--sk-cyan-glow)] flex items-center gap-1.5 min-h-[44px]"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Mulai</span>
            </button>
          </div>

          {/* Submenu: Tutup Bulan */}
          <div
            data-testid="submenu-tutup-bulan"
            data-submenu-id="tutup-bulan"
            data-implemented="true"
            className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)]/70 transition-colors min-h-[44px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-cyan)]/25">
                <Lock className="w-4 h-4 text-[var(--sk-cyan)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[var(--sk-text)] truncate">
                    Tutup Bulan
                  </p>
                  {latestClosedRecord ? (
                    <span
                      data-testid="kontrol-closed-month-badge"
                      className="text-[10px] font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] border border-[var(--sk-cyan)]/25 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      {formatMonthLabel(latestClosedRecord.year, latestClosedRecord.month)} ditutup
                    </span>
                  ) : (
                    <span
                      data-testid="kontrol-unclosed-month-badge"
                      className="text-[10px] font-medium text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2 py-0.5 rounded-full shrink-0"
                    >
                      Siap evaluasi
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                  Kunci buku bulanan dan verifikasi laporan
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-open-monthly-close"
              onClick={() => handleOpenMonthlyClose()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_8px_var(--sk-cyan-glow)] flex items-center gap-1.5 min-h-[44px]"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kelola</span>
            </button>
          </div>

          {/* Submenu: Net Worth */}
          <div
            data-testid="submenu-net-worth"
            data-submenu-id="net-worth"
            data-implemented="true"
            className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--sk-surface-2)]/70 transition-colors min-h-[44px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-cyan)]/25">
                <Scale className="w-4 h-4 text-[var(--sk-cyan)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[var(--sk-text)] truncate">
                    Net Worth & Utang
                  </p>
                  <span
                    data-testid="kontrol-net-worth-badge"
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 border',
                      netWorthSummary.netWorth >= 0
                        ? 'text-[var(--sk-green)] bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30'
                        : 'text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border-[var(--sk-amber)]/30'
                    )}
                  >
                    {formatIDR(netWorthSummary.netWorth)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                  Total aset bersih dikurangi kewajiban/utang ({debts.filter(d => !d.isSettled).length} aktif)
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-open-net-worth"
              onClick={() => handleOpenNetWorth()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_8px_var(--sk-cyan-glow)] flex items-center gap-1.5 min-h-[44px]"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Kelola</span>
            </button>
          </div>
        </div>
      </section>

      {/* Standalone Stacking Layer Surfaces (BottomSheet / Modal) */}
      <BottomSheet
        open={activeLayer === 'wallets'}
        onClose={closeLayer}
        title="Daftar Saku & Metode Pembayaran"
        subtitle="Kelola dompet kas, rekening bank, saldo & e-wallet"
        icon={Wallet}
        badge={
          <span className="text-[10px] font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full">
            {wallets.length} aktif
          </span>
        }
        dataTestId="layer-wallets"
      >
        <WalletManager onOpenReconcile={handleOpenReconcile} />
        <div
          data-testid="submenu-metode-pembayaran-modal"
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5 mt-2"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-[var(--sk-cyan)]" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[var(--sk-text)]">Metode Pembayaran</h4>
              <p className="text-[10px] text-[var(--sk-text-dim)]">Atur dompet & opsi pembayaran aktif</p>
            </div>
          </div>
          <PersonalizationSettings showCategories={false} />
        </div>
      </BottomSheet>

      <BottomSheet
        open={activeLayer === 'budget'}
        onClose={closeLayer}
        title="Budget Bulanan"
        subtitle="Atur batas alokasi anggaran belanja bulanan"
        icon={Gauge}
        badge={
          <span className="text-xs font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
            {formatIDR(monthlyBudget)}
          </span>
        }
        dataTestId="layer-budget"
      >
        <BudgetSettings />
      </BottomSheet>

      <BottomSheet
        open={activeLayer === 'money-move'}
        onClose={closeLayer}
        title="Pindah & Simpan Saldo"
        subtitle="Transfer antar-rekening atau alokasikan ke tabungan"
        icon={ArrowRightLeft}
        dataTestId="layer-money-move"
      >
        <MoneyMovePanel />
      </BottomSheet>

      <BottomSheet
        open={activeLayer === 'categories'}
        onClose={closeLayer}
        title="Kategori & Subkategori"
        subtitle="Kelola kategori pemasukan, pengeluaran & subkategori"
        icon={SlidersHorizontal}
        badge={
          <span className="text-[10px] font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
            Kategori & Sub
          </span>
        }
        dataTestId="layer-categories"
      >
        <CategoryManager />
      </BottomSheet>

      <ReconciliationModal
        open={reconcileModalOpen}
        onClose={() => setReconcileModalOpen(false)}
        initialWalletId={reconcileWalletId}
      />

      <MonthlyCloseModal
        open={monthlyCloseModalOpen}
        onClose={() => setMonthlyCloseModalOpen(false)}
        initialYear={monthlyCloseYear}
        initialMonth={monthlyCloseMonth}
      />

      <NetWorthModal
        open={netWorthModalOpen}
        onClose={() => setNetWorthModalOpen(false)}
      />

      <InboxReviewDrawer
        open={inboxDrawerOpen}
        onClose={() => setInboxDrawerOpen(false)}
      />
    </div>
  )
}

export function TabSaku() {
  return (
    <div className="flex flex-col min-h-full md:ml-[72px]">
      <div className="sticky top-0 z-20 bg-[var(--sk-bg)] border-b border-[var(--sk-border)] px-4 md:px-8 py-4">
        <h2 className="text-base font-semibold text-[var(--sk-text)]">Saku</h2>
        <p className="text-xs text-[var(--sk-text-dim)] mt-0.5">
          Saldo, budget, pindah uang, kategori, dan perencanaan keuangan.
        </p>
      </div>

      <div className="flex-1 px-4 md:px-8 py-5 flex flex-col gap-4 pb-10">
        <SakuSubmenuNavigator />
      </div>
    </div>
  )
}
