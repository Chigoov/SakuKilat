'use client'

import { useRef, useState, useEffect } from 'react'
import { Check, Download, FileJson, Upload, Undo2, AlertTriangle } from 'lucide-react'
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  useBudgetStore,
  useCustomizationStore,
  useFeedbackStore,
  useTransactionData,
  useWalletStore,
} from '@/lib/store'
import {
  planImport,
  executeImportTransaction,
  executeRollback,
  canRollback,
  type ImportPlanSuccess,
} from '@/lib/data-restore'
import { parseDelimited as parseDelimitedShared } from '@/lib/csv-parser'
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
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'

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
  orangtua: 'Orang tua',
  thiara: 'Thiara',
}

const PARENT_INCOME_CATEGORY_ID = 'orangtua'
const GENERIC_INCOME_BUCKETS = new Set(['hadiah', 'lainnya'])
const GENERIC_INCOME_IMPORT_LABELS = new Set(['hadiah', 'lainnya', 'lainlain', 'pemasukan', 'pendapatan', 'income', 'masuk'])

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
  for (const id of builtinCategoryIds) {
    categoryKeywordToId.set(id, id)
    categoryKeywordToId.set(normalizeHeader(CATEGORY_CONFIG[id as keyof typeof CATEGORY_CONFIG].label), id)
  }
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

  function ensureImportedCategory(label: string, type: TransactionType): string {
    const baseId = slugifyId(label)
    const id = knownCategoryIds.has(baseId) ? `${baseId}-${type}` : baseId
    const existing = customCategories.find(category => category.id === id && matchesCategoryType(category, type))
    if (existing) return existing.id
    const newCat: CustomCategory = { id, label, keywords: [id, label.toLowerCase()], type }
    customCategories.push(newCat)
    knownCategoryIds.add(id)
    categoryKeywordToId.set(id, id)
    categoryKeywordToId.set(label.toLowerCase(), id)
    categoryKeywordToId.set(normalizeHeader(label), id)
    return id
  }

  function findExistingCategory(label: string, type: TransactionType): string | undefined {
    const lower = label.toLowerCase()
    const normalized = normalizeHeader(label)
    const matchingCustom = customCategories.find(category =>
      matchesCategoryType(category, type) &&
      [category.id, category.label, ...category.keywords].some(keyword => keyword.toLowerCase() === lower || normalizeHeader(keyword) === normalized)
    )
    return matchingCustom?.id
      ?? (knownCategoryIds.has(lower) ? lower : undefined)
      ?? categoryKeywordToId.get(lower)
      ?? categoryKeywordToId.get(normalized)
  }

  function resolveIncomeDetailCategory(label: string): string {
    const normalized = normalizeHeader(label)
    if (normalized === PARENT_INCOME_CATEGORY_ID) return ensurePromotedCategory(PARENT_INCOME_CATEGORY_ID, 'income')
    return findExistingCategory(label, 'income') ?? ensureImportedCategory(label, 'income')
  }

  function resolveCategory(raw: string, type: Transaction['type'], currentSubcategory?: string): Pick<Transaction, 'category' | 'subcategory'> {
    const value = (raw ?? '').trim()
    const rawSubcategory = (currentSubcategory ?? '').trim()
    if (!value) return { category: 'lainnya', subcategory: rawSubcategory || undefined }
    const lower = value.toLowerCase()
    const normalized = normalizeHeader(value)
    if (type === 'income' && (normalized === PARENT_INCOME_CATEGORY_ID || normalizeHeader(rawSubcategory) === PARENT_INCOME_CATEGORY_ID)) {
      return { category: ensurePromotedCategory(PARENT_INCOME_CATEGORY_ID, type) }
    }
    if (PROMOTED_IMPORT_CATEGORIES[normalized]) {
      return {
        category: ensurePromotedCategory(normalized, type),
        subcategory: rawSubcategory || undefined,
      }
    }
    const direct = findExistingCategory(value, type)
    const alias = type === 'income'
      ? INCOME_CATEGORY_ALIASES[normalized]
      : EXPENSE_CATEGORY_ALIASES[normalized]
    const category = direct ?? alias
    if (
      type === 'income' &&
      rawSubcategory &&
      (
        GENERIC_INCOME_BUCKETS.has(category ?? '') ||
        GENERIC_INCOME_IMPORT_LABELS.has(normalized)
      )
    ) {
      return { category: resolveIncomeDetailCategory(rawSubcategory) }
    }
    if (direct && rawSubcategory) return { category, subcategory: rawSubcategory }
    if (direct) return { category }
    if (alias) return { category, subcategory: rawSubcategory || undefined }
    return {
      category: ensureImportedCategory(value, type),
      subcategory: rawSubcategory || undefined,
    }

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
    category: String(pick(record, 'category') ?? (type === 'income' ? 'gaji' : 'lainnya')).trim(),
    subcategory: String(pick(record, 'subcategory') ?? '').trim() || undefined,
    paymentMethod: String(pick(record, 'paymentMethod') ?? 'tunai').trim().toLowerCase(),
    fromWalletId: typeof record.fromWalletId === 'string' ? record.fromWalletId : undefined,
    toWalletId: typeof record.toWalletId === 'string' ? record.toWalletId : undefined,
    date: Number.isFinite(date.getTime()) ? date : new Date(),
  }
}

function csvToTransactions(text: string): Transaction[] {
  const { rows } = parseDelimitedShared(text)
  const headers = rows[0]?.map(normalizeHeader) ?? []
  return rows.slice(1)
    .map((cells: string[], index: number) => {
      const record = headers.reduce<RawRecord>((acc: RawRecord, header: string, cellIndex: number) => {
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

function isParentIncome(transaction: Transaction): boolean {
  return transaction.type === 'income'
    && transaction.category === 'hadiah'
    && normalizeHeader(transaction.subcategory ?? '') === PARENT_INCOME_CATEGORY_ID
}

function normalizeParentIncome(transaction: Transaction): Transaction {
  return isParentIncome(transaction)
    ? { ...transaction, category: PARENT_INCOME_CATEGORY_ID, subcategory: undefined }
    : transaction
}

function ensureParentIncomeCategory(categories: CustomCategory[], transactions: Transaction[]): CustomCategory[] {
  if (!transactions.some(transaction => transaction.category === PARENT_INCOME_CATEGORY_ID)) return categories
  if (categories.some(category => category.id === PARENT_INCOME_CATEGORY_ID && category.type === 'income')) return categories
  return [
    ...categories,
    {
      id: PARENT_INCOME_CATEGORY_ID,
      label: 'Orang tua',
      keywords: [PARENT_INCOME_CATEGORY_ID, 'orang tua'],
      type: 'income',
    },
  ]
}

type FileExportResult = 'shared' | 'downloaded' | 'cancelled' | 'failed'

function isShareCancel(error: unknown): boolean {
  const name = error instanceof DOMException ? error.name.toLowerCase() : ''
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
  return name === 'aborterror' || message.includes('cancel')
}

async function shareNativeFile(name: string, text: string, type: string): Promise<FileExportResult | null> {
  try {
    const [{ Capacitor }, { Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/core'),
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    if (!Capacitor.isNativePlatform()) return null

    const saved = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })

    await Share.share({
      title: name,
      text: `SakuKilat: ${name}`,
      files: [saved.uri],
      dialogTitle: 'Bagikan atau simpan file SakuKilat',
    })
    return 'shared'
  } catch (error) {
    return isShareCancel(error) ? 'cancelled' : null
  }
}

async function shareWebFile(name: string, text: string, type: string): Promise<FileExportResult | null> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return null
    const file = new File([text], name, { type })
    const data: ShareData = { title: name, text: `SakuKilat: ${name}`, files: [file] }
    if (navigator.canShare && !navigator.canShare(data)) return null
    await navigator.share(data)
    return 'shared'
  } catch (error) {
    return isShareCancel(error) ? 'cancelled' : null
  }
}

async function saveOrShareFile(name: string, text: string, type: string): Promise<FileExportResult> {
  const shared = await shareNativeFile(name, text, type) ?? await shareWebFile(name, text, type)
  if (shared) return shared
  return downloadFile(name, text, type) ? 'downloaded' : 'failed'
}

function exportMessage(label: string, result: FileExportResult): string {
  if (result === 'shared') return `${label} siap dibagikan atau disimpan.`
  if (result === 'downloaded') return `${label} dibuat. Cek folder Download.`
  if (result === 'cancelled') return 'Ekspor dibatalkan.'
  return `${label} gagal dibuat di perangkat ini.`
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
  const [pendingPlan, setPendingPlan] = useState<ImportPlanSuccess | null>(null)
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false)
  const [hasRollback, setHasRollback] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasRollback(canRollback(window.localStorage))
    }
  }, [lastAction])

  useEffect(() => {
    if (pendingPlan) {
      pushBackLayer({ id: 'import-preview-modal', type: 'modal', onClose: () => setPendingPlan(null) })
    } else {
      removeBackLayer('import-preview-modal')
    }
    return () => removeBackLayer('import-preview-modal')
  }, [pendingPlan])

  useEffect(() => {
    if (showRollbackConfirm) {
      pushBackLayer({ id: 'rollback-confirm-modal', type: 'dialog', onClose: () => setShowRollbackConfirm(false) })
    } else {
      removeBackLayer('rollback-confirm-modal')
    }
    return () => removeBackLayer('rollback-confirm-modal')
  }, [showRollbackConfirm])

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

  const exportJson = async () => {
    const result = await saveOrShareFile(
      `sakukilat-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup(), null, 2),
      'application/json'
    )
    if (result === 'failed') {
      showToast('Backup gagal dibuat di perangkat ini.', 'error')
      return
    }
    if (result === 'cancelled') {
      showToast('Ekspor dibatalkan.', 'error')
      return
    }
    bumpCount(BACKUP_COUNT_KEY)
    pulseAction('json')
    showToast(exportMessage('Backup JSON', result), 'success')
  }

  const exportCsv = async () => {
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
    const result = await saveOrShareFile(
      `sakukilat-transaksi-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map(row => row.map(csvEscape).join(',')).join('\n'),
      'text/csv'
    )
    if (result === 'failed') {
      showToast('Ekspor CSV gagal di perangkat ini.', 'error')
      return
    }
    if (result === 'cancelled') {
      showToast('Ekspor dibatalkan.', 'error')
      return
    }
    bumpCount(BACKUP_COUNT_KEY)
    pulseAction('csv')
    showToast(exportMessage('CSV', result), 'success')
  }

  const performExecution = (plan: ImportPlanSuccess, confirmed: boolean) => {
    setIsExecuting(true)
    try {
      const result = executeImportTransaction(window.localStorage, plan, { confirmed })
      if (!result.success) {
        showToast(result.error || 'Gagal mengimpor data.', 'error')
        setPendingPlan(null)
        setIsExecuting(false)
        return
      }

      if (result.noNewTransactions) {
        setPendingPlan(null)
        setIsExecuting(false)
        showToast('Tidak ada transaksi baru yang ditambahkan (seluruh transaksi sudah ada atau duplikat).', 'success', undefined, 4000)
        return
      }

      bumpCount(IMPORT_COUNT_KEY)
      pulseAction('import')
      setPendingPlan(null)
      const added = result.addedCount ?? plan.newTransactionCount
      const dupCount = (result.duplicateCount ?? 0) + (result.internalDuplicateCount ?? 0)
      showToast(
        plan.mode === 'replace'
          ? `${added} transaksi dipulihkan. Memuat ulang...`
          : `${added} transaksi baru berhasil digabungkan.${dupCount > 0 ? ` (${dupCount} duplikat dilewati)` : ''} Memuat ulang...`,
        'success',
        undefined,
        4000
      )
      setTimeout(() => window.location.reload(), 700)
    } catch {
      showToast('Gagal memproses impor transaksi.', 'error')
      setPendingPlan(null)
      setIsExecuting(false)
    }
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    const trimmed = text.trim()
    const isJson = file.name.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')

    const plan = planImport(text, window.localStorage, { isCsv: !isJson })
    if (!plan.valid) {
      showToast(plan.error, 'error')
      return
    }

    if (plan.mode === 'replace') {
      setPendingPlan(plan)
      return
    }

    if (plan.mode === 'merge' && plan.newTransactionCount === 0) {
      showToast('Tidak ada transaksi baru yang ditemukan (seluruh transaksi dalam berkas sudah ada / duplikat).', 'success', undefined, 4000)
      return
    }

    performExecution(plan, true)
  }

  const handleRollback = () => {
    try {
      const result = executeRollback(window.localStorage)
      if (result.success) {
        showToast(`Data dipulihkan dari cadangan (${result.restoredKeys.join(', ')}). Memuat ulang...`, 'success')
        setTimeout(() => window.location.reload(), 700)
      } else {
        showToast(result.error || 'Gagal melakukan rollback.', 'error')
      }
    } catch {
      showToast('Terjadi kesalahan saat memulihkan cadangan.', 'error')
    } finally {
      setShowRollbackConfirm(false)
    }
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

      {hasRollback && (
        <button
          type="button"
          onClick={() => setShowRollbackConfirm(true)}
          className="min-h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 mt-1"
        >
          <Undo2 className="w-4 h-4" />
          Batalkan Impor Terakhir (Rollback)
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--sk-text-dim)]">
        Backup JSON menggantikan seluruh data aplikasi setelah konfirmasi. CSV menambah transaksi tanpa menghapus data lama; duplikat dilewati. Cadangan checkpoint otomatis dibuat sebelum penulisan.
      </p>

      {/* Confirmation & Preview Modal for Replace Mode */}
      {pendingPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--sk-card,#141A29)] border border-amber-500/30 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Pratinjau Impor Cadangan</h3>
                <p className="text-[11px] text-amber-400 font-medium">Mode: Ganti Seluruh Data (Replace)</p>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 text-xs space-y-2 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Transaksi Saat Ini:</span>
                <span className="font-mono font-bold text-white">{pendingPlan.currentTransactionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Transaksi Baru (Cadangan):</span>
                <span className="font-mono font-bold text-emerald-400">{pendingPlan.newTransactionCount}</span>
              </div>
              {pendingPlan.dateRange.start && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Rentang Tanggal:</span>
                  <span className="font-mono text-[11px] text-slate-300">
                    {new Date(pendingPlan.dateRange.start).toLocaleDateString('id-ID')} s/d {pendingPlan.dateRange.end ? new Date(pendingPlan.dateRange.end).toLocaleDateString('id-ID') : '?'}
                  </span>
                </div>
              )}
              {pendingPlan.hasGoals && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Tabungan (Goals):</span>
                  <span className="font-mono text-cyan-400 font-semibold">{pendingPlan.goals?.length ?? 0} target</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tindakan ini akan <strong className="text-amber-400 font-semibold">menggantikan seluruh data</strong> yang ada saat ini dengan data cadangan ini. Checkpoint otomatis dibuat dan dapat dibatalkan (rollback) kapan saja.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isExecuting}
                onClick={() => setPendingPlan(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isExecuting}
                onClick={() => performExecution(pendingPlan, true)}
                className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg"
              >
                {isExecuting ? 'Memproses...' : 'Lanjutkan Impor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback Confirmation Modal */}
      {showRollbackConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--sk-card,#141A29)] border border-cyan-500/30 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-cyan-400">
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                <Undo2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Batalkan Impor (Rollback)</h3>
                <p className="text-[11px] text-cyan-400 font-medium">Pulihkan Checkpoint Sebelumnya</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin membatalkan impor terakhir dan mengembalikan semua data transaksi dan target ke kondisi persis sebelum impor dilakukan?
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRollbackConfirm(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleRollback}
                className="py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg"
              >
                Ya, Pulihkan Data
              </button>
            </div>
          </div>
        </div>
      )}

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
