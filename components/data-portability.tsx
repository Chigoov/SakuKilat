'use client'

import { useRef, useState } from 'react'
import { Check, Download, FileJson, Upload } from 'lucide-react'
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  useBudgetStore,
  useCustomizationStore,
  useFeedbackStore,
  useTransactionData,
  useWalletStore,
} from '@/lib/store'
import type { Transaction } from '@/lib/mock-data'
import type { WalletAccount, WalletType } from '@/lib/mock-data'
import type { CustomCategory, CustomPayment, TransactionType } from '@/lib/parser'
import { CATEGORY_CONFIG, PAYMENT_METHOD_LABELS } from '@/components/category-badge'
import { GOAL_STORAGE_KEY, readGoalSnapshot } from '@/components/goal-tracker'
import {
  BACKUP_COUNT_KEY,
  IMPORT_COUNT_KEY,
  buildContext,
  bumpCount,
  evaluateBadges,
  queueUnlockCelebrations,
  syncUnlocks,
} from '@/lib/achievements'
import { cn } from '@/lib/utils'

// ── Auto-create saku & kategori dari data impor ───────────────────────────────
function slugifyId(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `x-${Date.now()}`
}

interface ImportAugment {
  transactions: Transaction[]
  wallets: WalletAccount[]
  customPayments: CustomPayment[]
  customCategories: CustomCategory[]
}

const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  parkir: 'transportasi',
  kereta: 'transportasi',
  kopi: 'makanan',
  kuota: 'tagihan',
  langganan: 'tagihan',
  paylater: 'tagihan',
  hutang: 'tagihan',
  kos: 'tagihan',
  fashion: 'belanja',
  skincare: 'belanja',
  parfum: 'belanja',
  kebutuhanharian: 'belanja',
  game: 'hiburan',
  sosiallife: 'hiburan',
  gym: 'kesehatan',
  kesehatan: 'kesehatan',
  kuliah: 'pendidikan',
}

const INCOME_CATEGORY_ALIASES: Record<string, string> = {
  uangjajan: 'hadiah',
  orangtua: 'hadiah',
  thr: 'hadiah',
  gaji: 'gaji',
  freelance: 'freelance',
  lainlain: 'lainnya',
  editsaldo: 'lainnya',
  hutang: 'lainnya',
  paylater: 'lainnya',
}

const PROMOTED_IMPORT_CATEGORIES: Record<string, string> = {
  bensin: 'Bensin',
  kouta: 'Kouta',
  thiara: 'Thiara',
}

function triggerPortableHaptic(pattern: number | number[] = [18, 40, 18]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}

/**
 * Pendekatan "minimum": untuk setiap dompet/kategori di data impor yang BELUM
 * dikenal, cocokkan dulu ke yang sudah ada (lewat id/keyword); kalau benar-benar
 * baru → buat otomatis. Transaksi di-remap ke id kanonik supaya saldo & kategori
 * terhitung benar. Tidak ada data yatim.
 */
function augmentFromImport(
  imported: Transaction[],
  existingWallets: WalletAccount[],
  existingPayments: CustomPayment[],
  existingCategories: CustomCategory[],
): ImportAugment {
  const wallets = [...existingWallets]
  const customPayments = [...existingPayments]
  const customCategories = [...existingCategories]

  function matchesCategoryType(category: CustomCategory, type: TransactionType): boolean {
    return (category.type ?? 'expense') === type
  }

  // ── Lookup pembayaran ──────────────────────────────────────────────────────
  const builtinPaymentIds = new Set(Object.keys(PAYMENT_METHOD_LABELS))
  const paymentKeywordToId = new Map<string, string>()
  const knownPaymentIds = new Set<string>(builtinPaymentIds)
  for (const w of wallets) {
    knownPaymentIds.add(w.id)
    paymentKeywordToId.set(w.id, w.id)
    for (const k of w.keywords) paymentKeywordToId.set(k.toLowerCase(), w.id)
  }
  for (const p of customPayments) {
    knownPaymentIds.add(p.id)
    paymentKeywordToId.set(p.id, p.id)
    for (const k of p.keywords) paymentKeywordToId.set(k.toLowerCase(), p.id)
  }

  function resolvePayment(raw: string): string {
    const value = (raw ?? '').trim()
    if (!value) return 'tunai'
    const lower = value.toLowerCase()
    if (knownPaymentIds.has(lower)) return lower
    if (paymentKeywordToId.has(lower)) return paymentKeywordToId.get(lower)!
    const slug = slugifyId(value)
    if (knownPaymentIds.has(slug)) return slug
    // Benar-benar baru → buat saku baru.
    const newWallet: WalletAccount = {
      id: slug,
      label: value,
      type: 'other' as WalletType,
      balance: 0,
      keywords: [slug, lower],
    }
    wallets.push(newWallet)
    knownPaymentIds.add(slug)
    paymentKeywordToId.set(lower, slug)
    paymentKeywordToId.set(slug, slug)
    return slug
  }

  // ── Lookup kategori ────────────────────────────────────────────────────────
  const builtinCategoryIds = new Set(Object.keys(CATEGORY_CONFIG))
  const categoryKeywordToId = new Map<string, string>()
  const knownCategoryIds = new Set<string>(builtinCategoryIds)
  for (const id of builtinCategoryIds) categoryKeywordToId.set(id, id)
  for (const c of customCategories) knownCategoryIds.add(c.id)

  function ensurePromotedCategory(id: string, type: TransactionType): string {
    const existing = customCategories.find(category => category.id === id && matchesCategoryType(category, type))
    if (existing) return existing.id
    const label = PROMOTED_IMPORT_CATEGORIES[id]
    if (!label) return id
    const newCat: CustomCategory = { id, label, keywords: [id], type }
    customCategories.push(newCat)
    knownCategoryIds.add(id)
    categoryKeywordToId.set(id, id)
    return id
  }

  function resolveCategory(raw: string, type: Transaction['type'], currentSubcategory?: string): Pick<Transaction, 'category' | 'subcategory'> {
    const value = (raw ?? '').trim()
    const rawSubcategory = (currentSubcategory ?? '').trim()
    if (!value) return { category: 'lainnya', subcategory: rawSubcategory || undefined }
    const lower = value.toLowerCase()
    const normalized = normalizeHeader(value)
    const matchingCustom = customCategories.find(category =>
      matchesCategoryType(category, type) &&
      [category.id, category.label, ...category.keywords].some(keyword => keyword.toLowerCase() === lower || normalizeHeader(keyword) === normalized)
    )
    if (PROMOTED_IMPORT_CATEGORIES[normalized]) {
      return {
        category: ensurePromotedCategory(normalized, type),
        subcategory: rawSubcategory || undefined,
      }
    }
    const direct = matchingCustom?.id
      ?? (knownCategoryIds.has(lower) ? lower : undefined)
      ?? categoryKeywordToId.get(lower)
      ?? categoryKeywordToId.get(normalized)
    const alias = type === 'income'
      ? INCOME_CATEGORY_ALIASES[normalized]
      : EXPENSE_CATEGORY_ALIASES[normalized]
    const category = direct ?? alias ?? 'lainnya'
    if (direct && rawSubcategory) return { category, subcategory: rawSubcategory }
    if (direct) return { category }

    const parts = [value, rawSubcategory].filter(Boolean)
    return {
      category,
      subcategory: parts.length > 0 ? parts.join(' · ') : undefined,
    }
  }

  const remapped = imported.map(t => {
    const isMove = t.kind === 'transfer' || t.kind === 'saving'
    const categoryState = isMove
      ? { category: t.category, subcategory: t.subcategory }
      : resolveCategory(t.category, t.type, t.subcategory)
    return {
      ...t,
      paymentMethod: resolvePayment(t.paymentMethod),
      category: categoryState.category,
      subcategory: categoryState.subcategory,
    }
  })

  return { transactions: remapped, wallets, customPayments, customCategories }
}

type RawRecord = Record<string, unknown>

const FIELD_ALIASES = {
  description: ['description', 'deskripsi', 'keterangan', 'catatan', 'nama', 'name'],
  amount: ['amount', 'nominal', 'jumlah', 'nilai', 'total', 'value'],
  income: ['income', 'masuk', 'pemasukan', 'credit', 'kredit'],
  expense: ['expense', 'keluar', 'pengeluaran', 'debit'],
  type: ['type', 'tipe', 'jenis', 'pendapatanpengeluaran'],
  category: ['category', 'kategori'],
  subcategory: ['subcategory', 'subkategori', 'sub_category', 'subkategoriopsional', 'rincian'],
  paymentMethod: ['paymentmethod', 'payment', 'metode', 'metodebayar', 'dompet', 'saku', 'wallet', 'account', 'aset'],
  date: ['date', 'tanggal', 'waktu', 'time'],
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}

function pick(record: RawRecord, field: keyof typeof FIELD_ALIASES): unknown {
  for (const alias of FIELD_ALIASES[field]) {
    if (record[alias] !== undefined) return record[alias]
    const entry = Object.entries(record).find(([key]) => normalizeHeader(key) === alias)
    if (entry) return entry[1]
  }
  return undefined
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') return Math.max(0, Math.round(value))
  const raw = String(value ?? '').toLowerCase().trim()
  if (!raw) return 0

  const suffix = raw.match(/\b(k|rb|ribu|jt|juta)\b/)?.[1]
  const numberPart = raw.replace(/[^0-9,.-]/g, '')
  if (!numberPart) return 0

  const decimalSuffix = Boolean(suffix) && /^\d+[,.]\d+$/.test(numberPart)
  const normalized = decimalSuffix
    ? numberPart.replace(',', '.')
    : numberPart.replace(/[.,]/g, '')
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) return 0

  if (suffix === 'k' || suffix === 'rb' || suffix === 'ribu') return Math.round(numeric * 1_000)
  if (suffix === 'jt' || suffix === 'juta') return Math.round(numeric * 1_000_000)
  return Math.max(0, Math.round(numeric))
}

function parseImportedDate(value: unknown): Date {
  const raw = String(value ?? '').trim()
  if (!raw) return new Date(NaN)

  const direct = new Date(raw)
  if (Number.isFinite(direct.getTime())) return direct

  const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return new Date(NaN)

  const [, dayRaw, monthRaw, yearRaw, hourRaw = '0', minuteRaw = '0', secondRaw = '0'] = match
  const day = Number(dayRaw)
  const month = Number(monthRaw) - 1
  const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const second = Number(secondRaw)
  const parsed = new Date(year, month, day, hour, minute, second)

  return parsed.getFullYear() === year
    && parsed.getMonth() === month
    && parsed.getDate() === day
    && parsed.getHours() === hour
    && parsed.getMinutes() === minute
    && parsed.getSeconds() === second
    ? parsed
    : new Date(NaN)
}

function normalizeTransaction(raw: unknown, index: number): Transaction | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as RawRecord
  const incomeAmount = parseMoney(pick(record, 'income'))
  const expenseAmount = parseMoney(pick(record, 'expense'))
  const amount = parseMoney(pick(record, 'amount')) || incomeAmount || expenseAmount
  if (amount <= 0) return null

  const typeText = String(pick(record, 'type') ?? '').toLowerCase()
  const type: Transaction['type'] =
    incomeAmount > 0 || ['income', 'masuk', 'pemasukan', 'credit', 'kredit'].some(token => typeText.includes(token))
      ? 'income'
      : 'expense'
  const date = parseImportedDate(pick(record, 'date'))
  const kindText = String(record.kind ?? '').toLowerCase()

  return {
    id: String(record.id ?? `txn-import-${Date.now()}-${index}`),
    kind: kindText === 'transfer' || kindText === 'saving' ? kindText as Transaction['kind'] : 'transaction',
    description: String(pick(record, 'description') ?? 'Impor transaksi').trim(),
    amount,
    type,
    category: String(pick(record, 'category') ?? (type === 'income' ? 'gaji' : 'lainnya')).trim().toLowerCase(),
    subcategory: String(pick(record, 'subcategory') ?? '').trim() || undefined,
    paymentMethod: String(pick(record, 'paymentMethod') ?? 'tunai').trim().toLowerCase(),
    fromWalletId: typeof record.fromWalletId === 'string' ? record.fromWalletId : undefined,
    toWalletId: typeof record.toWalletId === 'string' ? record.toWalletId : undefined,
    date: Number.isFinite(date.getTime()) ? date : new Date(),
  }
}

function detectDelimiter(firstLine: string): string {
  return [',', ';', '\t'].reduce((best, delimiter) =>
    firstLine.split(delimiter).length > firstLine.split(best).length ? delimiter : best
  )
}

function parseDelimited(text: string): string[][] {
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows.filter(items => items.some(item => item.trim()))
}

function csvToTransactions(text: string): Transaction[] {
  const rows = parseDelimited(text)
  const headers = rows[0]?.map(normalizeHeader) ?? []
  return rows.slice(1)
    .map((cells, index) => {
      const record = headers.reduce<RawRecord>((acc, header, cellIndex) => {
        if (!header || acc[header] !== undefined) return acc
        acc[header] = cells[cellIndex] ?? ''
        return acc
      }, {})
      return normalizeTransaction(record, index)
    })
    .filter((item): item is Transaction => Boolean(item))
}

function extractRows(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (!input || typeof input !== 'object') return []
  const record = input as RawRecord
  for (const key of ['transactions', 'data', 'records', 'items']) {
    if (Array.isArray(record[key])) return record[key]
  }
  return []
}

function transactionSignature(transaction: Transaction): string {
  return [
    transaction.description.toLowerCase(),
    transaction.amount,
    transaction.type,
    transaction.category,
    transaction.subcategory ?? '',
    transaction.paymentMethod,
    transaction.date.toISOString(),
  ].join('|')
}

function serializeTransaction(transaction: Transaction) {
  return {
    ...transaction,
    date: transaction.date.toISOString(),
  }
}

function downloadFile(name: string, text: string, type: string): boolean {
  try {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.rel = 'noopener'
    // Beberapa WebView mengabaikan click() pada elemen yang belum ter-attach.
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    // Revoke ditunda supaya WebView sempat memproses unduhan.
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  } catch {
    // Fallback: data URL. Membantu di WebView yang memblokir blob: download.
    try {
      const encoded = `data:${type};charset=utf-8,${encodeURIComponent(text)}`
      const link = document.createElement('a')
      link.href = encoded
      link.download = name
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return true
    } catch {
      return false
    }
  }
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function DataPortability() {
  const { transactions } = useTransactionData()
  const { wallets } = useWalletStore()
  const { monthlyBudget } = useBudgetStore()
  const { customPayments, customCategories } = useCustomizationStore()
  const { showToast } = useFeedbackStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastAction, setLastAction] = useState<'json' | 'csv' | 'import' | null>(null)

  const pulseAction = (action: 'json' | 'csv' | 'import') => {
    triggerPortableHaptic()
    setLastAction(action)
    window.setTimeout(() => {
      setLastAction(current => current === action ? null : current)
    }, 1800)
  }

  const backup = () => ({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: transactions.map(serializeTransaction),
    goals: readGoalSnapshot(),
    wallets,
    monthlyBudget,
    customPayments,
    customCategories,
  })

  const exportJson = () => {
    const ok = downloadFile(
      `sakukilat-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup(), null, 2),
      'application/json'
    )
    if (!ok) {
      showToast('Backup gagal dibuat di perangkat ini.', 'error')
      return
    }
    bumpCount(BACKUP_COUNT_KEY)
    pulseAction('json')
    showToast('Backup JSON tersimpan.', 'success')
  }

  const exportCsv = () => {
    const rows = [
      ['tanggal', 'tipe', 'deskripsi', 'nominal', 'kategori', 'subkategori', 'dompet'],
      ...transactions.map(t => [
        t.date.toISOString(),
        t.type === 'income' ? 'masuk' : 'keluar',
        t.description,
        t.amount,
        t.category,
        t.subcategory ?? '',
        t.paymentMethod,
      ]),
    ]
    const ok = downloadFile(
      `sakukilat-transaksi-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map(row => row.map(csvEscape).join(',')).join('\n'),
      'text/csv'
    )
    if (ok) bumpCount(BACKUP_COUNT_KEY)
    if (ok) pulseAction('csv')
    showToast(ok ? 'Ekspor CSV tersimpan.' : 'Ekspor CSV gagal di perangkat ini.', ok ? 'success' : 'error')
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    const trimmed = text.trim()
    const isJson = file.name.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')
    const parsed = isJson ? JSON.parse(trimmed) as unknown : null
    const imported = isJson
      ? extractRows(parsed).map(normalizeTransaction).filter((item): item is Transaction => Boolean(item))
      : csvToTransactions(text)

    if (imported.length === 0) {
      showToast('File tidak berisi transaksi yang bisa dibaca.', 'error')
      return
    }

    const currentRaw = window.localStorage.getItem(STORAGE_KEY)
    const current = currentRaw ? JSON.parse(currentRaw) as RawRecord : {}
    const backupRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RawRecord : null
    const isSakuKilatBackup = backupRecord?.app === 'SakuKilat' || backupRecord?.schemaVersion === CURRENT_SCHEMA_VERSION
    const existingSignatures = new Set(transactions.map(transactionSignature))

    // Untuk impor non-SakuKilat: auto-buat saku & kategori yang belum ada,
    // lalu remap transaksi ke id kanonik supaya tidak ada data yatim.
    const augment = isSakuKilatBackup
      ? null
      : augmentFromImport(imported, wallets, customPayments, customCategories)
    const importedFinal = augment ? augment.transactions : imported

    const merged = isSakuKilatBackup
      ? importedFinal
      : [...importedFinal.filter(t => !existingSignatures.has(transactionSignature(t))), ...transactions]

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      ...(isSakuKilatBackup ? backupRecord : {}),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      transactions: merged.map(serializeTransaction),
      wallets: Array.isArray(backupRecord?.wallets) ? backupRecord.wallets : (augment ? augment.wallets : wallets),
      monthlyBudget: typeof backupRecord?.monthlyBudget === 'number' ? backupRecord.monthlyBudget : monthlyBudget,
      customPayments: Array.isArray(backupRecord?.customPayments) ? backupRecord.customPayments : (augment ? augment.customPayments : customPayments),
      customCategories: Array.isArray(backupRecord?.customCategories) ? backupRecord.customCategories : (augment ? augment.customCategories : customCategories),
    }))
    if (isSakuKilatBackup && Array.isArray(backupRecord?.goals)) {
      window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(backupRecord.goals))
    }
    bumpCount(IMPORT_COUNT_KEY)
    const goals = isSakuKilatBackup && Array.isArray(backupRecord?.goals)
      ? backupRecord.goals
      : readGoalSnapshot()
    const badges = evaluateBadges(buildContext({
      transactions: merged,
      walletsCount: (Array.isArray(backupRecord?.wallets) ? backupRecord.wallets : (augment ? augment.wallets : wallets)).length,
      customPaymentsCount: (Array.isArray(backupRecord?.customPayments) ? backupRecord.customPayments : (augment ? augment.customPayments : customPayments)).length,
      customCategoriesCount: (Array.isArray(backupRecord?.customCategories) ? backupRecord.customCategories : (augment ? augment.customCategories : customCategories)).length,
      goalsTotal: goals.length,
      goalsCompleted: goals.filter(goal => goal.saved >= goal.target).length,
    }))
    const freshBadges = syncUnlocks(badges)
    if (freshBadges.length > 0) queueUnlockCelebrations(freshBadges)
    pulseAction('import')
    showToast(`${imported.length} transaksi diimpor. Memuat ulang...`, 'success')
    setTimeout(() => window.location.reload(), 700)
  }

  return (
    <div className="flex flex-col gap-2" data-tour="data-portability">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportJson}
          className="min-h-11 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] text-[var(--sk-text)] text-xs font-semibold flex items-center justify-center gap-2"
        >
          {lastAction === 'json' ? <Check className="w-4 h-4 text-[var(--sk-green)]" /> : <FileJson className="w-4 h-4 text-[var(--sk-cyan)]" />}
          {lastAction === 'json' ? 'Backup siap' : 'Backup JSON'}
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="min-h-11 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] text-[var(--sk-text)] text-xs font-semibold flex items-center justify-center gap-2"
        >
          {lastAction === 'csv' ? <Check className="w-4 h-4 text-[var(--sk-green)]" /> : <Download className="w-4 h-4 text-[var(--sk-green)]" />}
          {lastAction === 'csv' ? 'CSV siap' : 'Ekspor CSV'}
        </button>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'min-h-11 rounded-xl bg-[var(--sk-surface)] border border-dashed border-[var(--sk-border-2)]',
          'text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] text-xs font-semibold flex items-center justify-center gap-2'
        )}
      >
        {lastAction === 'import' ? <Check className="w-4 h-4 text-[var(--sk-green)]" /> : <Upload className="w-4 h-4" />}
        {lastAction === 'import' ? 'Impor siap' : 'Impor JSON / CSV'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,.txt,application/json,text/csv,text/plain"
        className="hidden"
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          void importFile(file).catch(() => showToast('Impor gagal. Cek format file.', 'error'))
        }}
      />
    </div>
  )
}
