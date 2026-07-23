'use client'

import { useState } from 'react'
import { ArrowRightLeft, Check, ChevronDown, Gauge, Landmark, Pencil, PiggyBank, Plus, SlidersHorizontal, Trash2, Wallet, X } from 'lucide-react'
import { useBudgetStore, useWalletStore } from '@/lib/store'
import { GoalTracker } from '@/components/goal-tracker'
import { CategoryManager } from '@/components/category-manager'
import { PersonalizationSettings } from '@/components/personalization-settings'
import { formatIDR } from '@/lib/parser'
import { formatAmountFieldInput, parseAmountInput } from '@/lib/amount'
import type { WalletType } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-wallet',
  card: 'Kartu',
  savings: 'Simpan',
  other: 'Lainnya',
}

function BudgetSettings() {
  const { monthlyBudget, setMonthlyBudget } = useBudgetStore()
  const [raw, setRaw] = useState('')
  const parsedAmount = parseAmountInput(raw)

  const handleSave = () => {
    if (!parsedAmount) return
    setMonthlyBudget(parsedAmount)
    setRaw('')
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-amber-dim)] flex items-center justify-center">
          <Gauge className="w-4 h-4 text-[var(--sk-amber)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--sk-text)]">Budget Bulanan</h3>
        <span className="ml-auto text-xs font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
          {formatIDR(monthlyBudget)}
        </span>
      </div>

      <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3">
        <div className="flex items-center gap-2">
          <input
            value={raw}
            onChange={e => setRaw(formatAmountFieldInput(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="cth. 1,5jt"
            inputMode="decimal"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)]"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!parsedAmount}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
              parsedAmount
                ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_10px_var(--sk-cyan-glow)]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
            )}
            aria-label="Simpan budget"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  )
}

function WalletManager() {
  const { wallets, totalStored, addWallet, updateWallet, removeWallet } = useWalletStore()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<WalletType>('ewallet')
  const [balance, setBalance] = useState('')
  const [keywords, setKeywords] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [draft, setDraft] = useState({
    label: '',
    type: 'ewallet' as WalletType,
    balance: '',
    keywords: '',
  })
  const visibleWallets = showAll ? wallets : wallets.slice(0, 4)
  const hasHiddenWallets = wallets.length > visibleWallets.length

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
    <section data-tour="wallets">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center">
          <Wallet className="w-4 h-4 text-[var(--sk-cyan)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--sk-text)]">Saku Uang</h3>
        <span className="ml-auto text-xs font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-full">
          {wallets.length} aktif
        </span>
      </div>

      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 mb-3">
        <p className="text-xs text-[var(--sk-text-dim)] mb-1">Total tersimpan</p>
        <p className="text-2xl font-bold tabular-nums text-[var(--sk-text)]" data-amount>
          {formatIDR(totalStored)}
        </p>
      </div>

      <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Nama saku"
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
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={balance}
            onChange={e => setBalance(formatAmountFieldInput(e.target.value))}
            placeholder="Saldo awal, cth. 250rb"
            inputMode="decimal"
            className="min-w-0 bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!label.trim()}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-all',
              label.trim() ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
            )}
            aria-label="Tambah saku"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <input
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          placeholder="Keyword opsional, pisahkan koma"
          className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)]"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {visibleWallets.map(wallet => {
          const isEditing = editingId === wallet.id

          return (
            <div key={wallet.id} className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 min-w-0">
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
                  <input
                    value={draft.balance}
                    onChange={e => setDraft(prev => ({ ...prev, balance: formatAmountFieldInput(e.target.value) }))}
                    inputMode="decimal"
                    className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]"
                    placeholder="Saldo"
                  />
                  <input
                    value={draft.keywords}
                    onChange={e => setDraft(prev => ({ ...prev, keywords: e.target.value }))}
                    className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]"
                    placeholder="Keyword, pisahkan koma"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleUpdate}
                      className="rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center flex-shrink-0">
                    <Landmark className="w-4 h-4 text-[var(--sk-text-muted)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-[var(--sk-text)] truncate">{wallet.label}</p>
                      <span className="text-[9px] text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] rounded px-1.5 py-0.5 shrink-0">
                        {WALLET_TYPE_LABELS[wallet.type]}
                      </span>
                    </div>
                    <p className="text-xs font-semibold tabular-nums text-[var(--sk-text-muted)]" data-amount>
                      {formatIDR(wallet.balance)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(wallet)}
                    className="w-7 h-7 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] flex items-center justify-center shrink-0"
                    aria-label={`Edit ${wallet.label}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeWallet(wallet.id)}
                    className="w-7 h-7 rounded-lg bg-[var(--sk-red-dim)] text-[var(--sk-red)] flex items-center justify-center shrink-0"
                    aria-label={`Hapus ${wallet.label}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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
          className="mt-3 w-full rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3 py-2.5 text-xs font-semibold text-[var(--sk-cyan)] hover:bg-[var(--sk-surface-2)] transition-colors"
        >
          {showAll ? 'Ringkas daftar saku' : `Lihat semua ${wallets.length} saku`}
        </button>
      )}
    </section>
  )
}

function MoneyMovePanel() {
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
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-green-dim)] flex items-center justify-center">
          <ArrowRightLeft className="w-4 h-4 text-[var(--sk-green)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--sk-text)]">Pindah & Simpan</h3>
      </div>

      <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={fromId} onChange={e => setFromId(e.target.value)} className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]">
            {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>Dari {wallet.label}</option>)}
          </select>
          <select value={toId} onChange={e => setToId(e.target.value)} className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)]">
            {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>Ke {wallet.label}</option>)}
          </select>
        </div>
        <input
          value={amount}
          onChange={e => setAmount(formatAmountFieldInput(e.target.value))}
          placeholder="Nominal, cth. 100k"
          inputMode="decimal"
          className="bg-[var(--sk-surface-2)] rounded-lg px-3 py-2 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!parsedAmount || fromId === toId}
            className="rounded-lg bg-[var(--sk-cyan)] text-[#090D16] disabled:bg-[var(--sk-surface-2)] disabled:text-[var(--sk-text-dim)] text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Pindah
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!parsedAmount || fromId === 'tabungan'}
            className="rounded-lg bg-[var(--sk-green)] text-[#090D16] disabled:bg-[var(--sk-surface-2)] disabled:text-[var(--sk-text-dim)] text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
          >
            <PiggyBank className="w-3.5 h-3.5" />
            Simpan
          </button>
        </div>
      </div>
    </section>
  )
}

function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3.5 py-3 text-left hover:bg-[var(--sk-surface-2)] transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-[var(--sk-text-muted)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">{title}</p>
          {subtitle && <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">{subtitle}</p>}
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-[var(--sk-text-dim)] flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </section>
  )
}

export function TabSaku() {
  return (
    <div className="flex flex-col min-h-full md:ml-[72px]">
      <div className="sticky top-0 z-20 bg-[var(--sk-bg)] border-b border-[var(--sk-border)] px-4 md:px-8 py-4">
        <h2 className="text-base font-semibold text-[var(--sk-text)]">Saku</h2>
        <p className="text-xs text-[var(--sk-text-dim)] mt-0.5">
          Saldo, budget, pindah uang, dan kategori.
        </p>
      </div>

      <div className="flex-1 px-4 md:px-8 py-5 flex flex-col gap-6 pb-10">
        <BudgetSettings />
        <WalletManager />
        <MoneyMovePanel />
        <GoalTracker />
        <CollapsibleSection
          title="Metode Bayar"
          subtitle="Atur dompet & metode pembayaran"
          icon={Wallet}
        >
          <PersonalizationSettings showCategories={false} />
        </CollapsibleSection>
        <CollapsibleSection
          title="Kategori"
          subtitle="Atur kategori & sub kategori"
          icon={SlidersHorizontal}
        >
          <CategoryManager />
        </CollapsibleSection>
      </div>
    </div>
  )
}
