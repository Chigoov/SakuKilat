'use client'

/**
 * SakuKilat local-first store
 * ---------------------------------
 * Semua data tersimpan lokal di localStorage perangkat ini. Tanpa login,
 * tanpa cloud sync — cepat, privat, dan jalan offline.
 */

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Context,
} from 'react'
import {
  createSeedWallets,
  generateId,
  type Transaction,
  type TransactionKind,
  type WalletAccount,
  type WalletType,
} from './mock-data'
import {
  type Bill,
  type RecurrencePeriod,
  computeNextDueDate,
  createBill,
} from './bills'
import {
  parseEntry,
  type ParserExtras,
  type CustomPayment,
  type CustomCategory,
  type TransactionType,
  getBuiltinCategoryType,
} from './parser'
import {
  registerCustomCategories,
  registerCustomPayments,
  CATEGORY_CONFIG,
  suggestCategoryIconKey,
} from '@/components/category-badge'
import {
  loadPersistedState,
  persistState,
  canMutateState,
  cleanupStaleStorageKeys,
  serializeTransactionDate,
  deserializeTransactionDate,
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  type StorageStatus,
  type LoadResult,
} from '@/lib/storage'
import { createComprehensiveCheckpoint } from '@/lib/data-restore'
import { StorageRecoveryScreen } from '@/components/storage-recovery-screen'
import { syncWidgetSnapshot } from '@/lib/widget-snapshot'
import {
  type WalletReconciliation,
  type ReconcileWalletParams,
  type ReconcileWalletResult,
  calculateReconciliationVariance,
  createReconciliationRecord,
  createAdjustmentTransaction,
  getWalletReconciliationHistory,
} from './reconciliation'
import {
  type LocalCategoryRule,
  type InboxTransactionItem,
  type CategoryMatchEvaluation,
  type CreateLocalRuleInput,
  type CreateInboxItemInput,
  createLocalRule,
  createInboxItem,
  evaluateTransactionForRules,
  routeToInboxIfNeeded,
  approveInboxTransaction,
  rejectInboxTransaction,
  incrementRuleUsage,
  getPendingInboxItems,
  isDuplicateRule,
  RuleInboxManager,
} from './rules-inbox'
import {
  type MonthlyCloseRecord,
  type MonthlyFinancialSummary,
  type PreClosingChecklistResult,
  type PreClosingChecklistOptions,
  type CreateMonthlyCloseParams,
  formatMonthId,
  formatMonthLabel,
  evaluatePreClosingChecklist,
  compileMonthlyFinancialSummary,
  createMonthlyCloseRecord,
  reopenMonthlyClose,
  recloseMonthlyClose,
  isMonthClosed,
  getMonthlyCloseRecord,
  MonthlyCloseManager,
} from './monthly-close'
import {
  type DebtItem,
  type DebtType,
  type DebtPayment,
  type CreateDebtInput,
  type RecordDebtPaymentParams,
  type RecordDebtPaymentResult,
  type NetWorthSummary,
  calculateTotalAssets,
  calculateTotalLiabilities,
  calculateNetWorth,
  compileNetWorthSummary,
  createDebtItem,
  updateDebtItem,
  recordDebtPayment,
  NetWorthTracker,
} from './net-worth'
import {
  type SplitLineItem,
  type SplitValidationResult,
  type DistributedReportingItem,
  createSplitLineItem,
  calculateSplitTotal,
  calculateSplitDiscrepancy,
  validateSplitTransaction,
  canSaveSplitTransaction,
  isSplitTransaction,
  expandTransactionForReporting,
  expandTransactionsForReporting,
  distributeCategoryAmounts,
  distributeCategorySlices,
  distributeSubcategoryAmounts,
  SplitTransactionValidator,
} from './split-transaction'
import {
  computeWalletBalanceFromLedger,
  reconcileWalletBalances,
  calculateLedgerImpact,
  type AuditLogEntry,
  type BalanceReconciliationResult,
} from './wallet-ledger'
import {
  isSyncingWalletPayment,
  setSyncingWalletPayment,
  syncWalletAndCustomPayment,
} from './wallet-sync'
import {
  sanitizeIntegerRupiah,
  validatePositiveMonetaryAmount,
  safeToISOString,
} from './sanitizer'
import {
  executeSafeUndo,
  type UndoSnapshot,
} from './undo-manager'

export {
  computeWalletBalanceFromLedger,
  reconcileWalletBalances,
  calculateLedgerImpact,
  isSyncingWalletPayment,
  setSyncingWalletPayment,
  syncWalletAndCustomPayment,
  sanitizeIntegerRupiah,
  validatePositiveMonetaryAmount,
  safeToISOString,
  executeSafeUndo,
}
export type { AuditLogEntry, BalanceReconciliationResult, UndoSnapshot }

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MockUser {
  name: string
  givenName: string
  email: string
  avatarUrl: string
}

export interface Toast {
  text: string
  type: 'success' | 'error'
  action?: {
    label: string
    onClick: () => void
  }
}

export interface TransactionUpdateInput {
  description: string
  amount: number
  paymentMethod?: string
  /** Waktu kejadian transaksi. Kalau tidak dikirim, transaksi.date tetap tidak berubah. */
  date?: Date
  /** ID kategori (built-in atau custom). Kalau tidak dikirim, category tetap. */
  category?: string
  /** Sub-kategori bebas. String kosong = hapus sub-kategori. */
  subcategory?: string
  /** Catatan opsional. */
  note?: string
  /** Phase P11: Multi-category split line items */
  splitItems?: SplitLineItem[]
}

/** Pre-validated transaction payload used by the manual-entry escape hatch.
 *  All fields required — the form must collect them or default sensibly. */
export interface ManualTransactionInput {
  description: string
  amount: number
  type: 'expense' | 'income'
  category: string
  subcategory?: string
  note?: string
  paymentMethod: string
  date?: Date
  /** Phase P11: Multi-category split line items */
  splitItems?: SplitLineItem[]
}

export type ThemeMode = 'system' | 'dark' | 'light'

export type {
  WalletReconciliation,
  ReconcileWalletParams,
  ReconcileWalletResult,
  Bill,
  RecurrencePeriod,
  LocalCategoryRule,
  InboxTransactionItem,
  CategoryMatchEvaluation,
  CreateLocalRuleInput,
  CreateInboxItemInput,
  MonthlyCloseRecord,
  MonthlyFinancialSummary,
  PreClosingChecklistResult,
  PreClosingChecklistOptions,
  CreateMonthlyCloseParams,
  DebtItem,
  DebtType,
  DebtPayment,
  CreateDebtInput,
  RecordDebtPaymentParams,
  RecordDebtPaymentResult,
  NetWorthSummary,
  SplitLineItem,
  SplitValidationResult,
  DistributedReportingItem,
}

interface StoreValue {
  // auth
  user: MockUser | null
  authReady: boolean

  // data
  transactions: Transaction[]
  addTransaction: (input: string) => Promise<boolean>
  /** Manual escape hatch: bypass the natural-language parser entirely. */
  addManualTransaction: (input: ManualTransactionInput) => Promise<boolean>
  updateTransaction: (id: string, updates: TransactionUpdateInput) => void
  deleteTransaction: (id: string) => void
  newTransactionId: string | null
  isSubmitting: boolean

  // wallets
  wallets: WalletAccount[]
  totalStored: number
  addWallet: (label: string, type: WalletType, balance: number, keywords: string[]) => void
  updateWallet: (id: string, updates: { label: string; type: WalletType; balance: number; keywords: string[] }) => void
  removeWallet: (id: string) => void
  archiveWallet: (id: string) => void
  transferMoney: (fromWalletId: string, toWalletId: string, amount: number, description?: string, kind?: TransactionKind, date?: Date, note?: string) => boolean
  saveMoney: (fromWalletId: string, amount: number, toWalletId?: string) => boolean

  // reconciliation (Phase P6)
  reconciliations: WalletReconciliation[]
  reconcileWallet: (params: ReconcileWalletParams) => ReconcileWalletResult | null
  getWalletReconciliations: (walletId: string) => WalletReconciliation[]

  // bills (Phase P5)
  bills: Bill[]
  addBill: (input: Omit<Bill, 'id' | 'nextDueDate'> & { nextDueDate?: string }) => string
  updateBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => void
  removeBill: (id: string) => void
  toggleBillActive: (id: string) => void
  markBillPaid: (billId: string, paidAmount?: number, walletId?: string, note?: string) => Transaction | null

  // rules & inbox (Phase P8)
  localRules: LocalCategoryRule[]
  inbox: InboxTransactionItem[]
  pendingInboxCount: number
  addLocalRule: (input: CreateLocalRuleInput) => LocalCategoryRule | null
  updateLocalRule: (id: string, updates: Partial<Omit<LocalCategoryRule, 'id' | 'createdAt'>>) => void
  removeLocalRule: (id: string) => void
  toggleLocalRuleActive: (id: string) => void
  addInboxItem: (input: CreateInboxItemInput) => InboxTransactionItem
  updateInboxItemStatus: (id: string, status: 'approved' | 'rejected', confirmedCategory?: { categoryId: string; subcategoryId?: string }) => void
  removeInboxItem: (id: string) => void
  matchDescriptionToRule: (description: string) => CategoryMatchEvaluation
  evaluateAndQueueTransaction: (transaction: { id?: string; description: string; amount: number; date?: Date | string }) => {
    match: CategoryMatchEvaluation
    inboxItem: InboxTransactionItem | null
  }

  // monthly close (Phase P9)
  monthlyCloses: MonthlyCloseRecord[]
  executePreClosingChecklist: (year: number, month: number, options?: PreClosingChecklistOptions) => PreClosingChecklistResult
  compileMonthlySummary: (year: number, month: number) => MonthlyFinancialSummary
  closeMonth: (params: { year: number; month: number; closedAt?: string | Date; overrideValidation?: boolean }) => MonthlyCloseRecord | null
  reopenMonth: (monthId: string, note: string, reopenedAt?: string | Date) => MonthlyCloseRecord | null
  isMonthClosed: (monthId: string) => boolean
  getMonthlyCloseRecord: (monthId: string) => MonthlyCloseRecord | undefined

  // net worth & debts (Phase P10)
  debts?: DebtItem[]
  netWorthSummary?: NetWorthSummary
  addDebt?: (input: CreateDebtInput) => DebtItem | null
  updateDebt?: (id: string, updates: Partial<Omit<DebtItem, 'id' | 'createdAt'>>) => void
  removeDebt?: (id: string) => void
  payDebt?: (params: RecordDebtPaymentParams) => RecordDebtPaymentResult | null
  getDebt?: (id: string) => DebtItem | undefined

  // budget
  monthlyBudget: number
  setMonthlyBudget: (amount: number) => void

  // custom slang
  customPayments: CustomPayment[]
  customCategories: CustomCategory[]
  hiddenPaymentIds: string[]
  hiddenCategoryIds: string[]
  addCustomPayment: (label: string, keywords: string[]) => void
  updateCustomPayment: (id: string, updates: { label: string; keywords: string[] }) => void
  removeCustomPayment: (id: string) => void
  restoreHiddenPayment: (id: string) => void
  addCustomCategory: (label: string, keywords: string[], subcategories?: string[], type?: TransactionType, monthlyBudget?: number, icon?: string) => void
  updateCustomCategory: (id: string, updates: { label: string; keywords: string[]; subcategories?: string[]; type?: TransactionType; monthlyBudget?: number; icon?: string }) => void
  removeCustomCategory: (id: string) => void
  restoreHiddenCategory: (id: string) => void
  parserExtras: ParserExtras

  // ergonomics
  zenMode: boolean
  themeMode: ThemeMode
  toggleZen: () => void
  setThemeMode: (mode: ThemeMode) => void
  updateProfile: (name: string) => void
  updateProfileAvatar: (avatarUrl: string | null) => void

  // feedback
  toast: Toast | null
  showToast: (text: string, type: 'success' | 'error', action?: Toast['action'], durationMs?: number) => void
  dismissToast: () => void
}

interface AuthStore {
  user: MockUser | null
  authReady: boolean
  updateProfile: (name: string) => void
  updateProfileAvatar: (avatarUrl: string | null) => void
}

interface TransactionDataStore {
  transactions: Transaction[]
}

interface TransactionActionsStore {
  addTransaction: (input: string) => Promise<boolean>
  /** Manual escape hatch: bypass the natural-language parser entirely. */
  addManualTransaction: (input: ManualTransactionInput) => Promise<boolean>
  updateTransaction: (id: string, updates: TransactionUpdateInput) => void
  deleteTransaction: (id: string) => void
}

interface TransactionStatusStore {
  newTransactionId: string | null
  isSubmitting: boolean
}

interface WalletStore {
  wallets: WalletAccount[]
  totalStored: number
  addWallet: (label: string, type: WalletType, balance: number, keywords: string[]) => void
  updateWallet: (id: string, updates: { label: string; type: WalletType; balance: number; keywords: string[] }) => void
  removeWallet: (id: string) => void
  archiveWallet: (id: string) => void
  transferMoney: (fromWalletId: string, toWalletId: string, amount: number, description?: string, kind?: TransactionKind, date?: Date, note?: string) => boolean
  saveMoney: (fromWalletId: string, amount: number, toWalletId?: string) => boolean
  reconciliations: WalletReconciliation[]
  reconcileWallet: (params: ReconcileWalletParams) => ReconcileWalletResult | null
  getWalletReconciliations: (walletId: string) => WalletReconciliation[]
}

interface ReconciliationStore {
  reconciliations: WalletReconciliation[]
  reconcileWallet: (params: ReconcileWalletParams) => ReconcileWalletResult | null
  getWalletReconciliations: (walletId: string) => WalletReconciliation[]
}

export interface BillStore {
  bills: Bill[]
  addBill: (input: Omit<Bill, 'id' | 'nextDueDate'> & { nextDueDate?: string }) => string
  updateBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => void
  removeBill: (id: string) => void
  toggleBillActive: (id: string) => void
  markBillPaid: (billId: string, paidAmount?: number, walletId?: string, note?: string) => Transaction | null
}

export interface RuleInboxStore {
  localRules: LocalCategoryRule[]
  inbox: InboxTransactionItem[]
  pendingInboxCount: number
  addLocalRule: (input: CreateLocalRuleInput) => LocalCategoryRule | null
  updateLocalRule: (id: string, updates: Partial<Omit<LocalCategoryRule, 'id' | 'createdAt'>>) => void
  removeLocalRule: (id: string) => void
  toggleLocalRuleActive: (id: string) => void
  addInboxItem: (input: CreateInboxItemInput) => InboxTransactionItem
  updateInboxItemStatus: (id: string, status: 'approved' | 'rejected', confirmedCategory?: { categoryId: string; subcategoryId?: string }) => void
  removeInboxItem: (id: string) => void
  matchDescriptionToRule: (description: string) => CategoryMatchEvaluation
  evaluateAndQueueTransaction: (transaction: { id?: string; description: string; amount: number; date?: Date | string }) => {
    match: CategoryMatchEvaluation
    inboxItem: InboxTransactionItem | null
  }
}

export interface MonthlyCloseStore {
  monthlyCloses: MonthlyCloseRecord[]
  executePreClosingChecklist: (year: number, month: number, options?: PreClosingChecklistOptions) => PreClosingChecklistResult
  compileMonthlySummary: (year: number, month: number) => MonthlyFinancialSummary
  closeMonth: (params: { year: number; month: number; closedAt?: string | Date; overrideValidation?: boolean }) => MonthlyCloseRecord | null
  reopenMonth: (monthId: string, note: string, reopenedAt?: string | Date) => MonthlyCloseRecord | null
  isMonthClosed: (monthId: string) => boolean
  getMonthlyCloseRecord: (monthId: string) => MonthlyCloseRecord | undefined
}

export interface NetWorthStore {
  debts: DebtItem[]
  netWorthSummary: NetWorthSummary
  addDebt: (input: CreateDebtInput) => DebtItem | null
  updateDebt: (id: string, updates: Partial<Omit<DebtItem, 'id' | 'createdAt'>>) => void
  removeDebt: (id: string) => void
  payDebt: (params: RecordDebtPaymentParams) => RecordDebtPaymentResult | null
  getDebt: (id: string) => DebtItem | undefined
}

interface BudgetStore {
  monthlyBudget: number
  setMonthlyBudget: (amount: number) => void
}

interface CustomizationStore {
  customPayments: CustomPayment[]
  customCategories: CustomCategory[]
  hiddenPaymentIds: string[]
  hiddenCategoryIds: string[]
  addCustomPayment: (label: string, keywords: string[]) => void
  updateCustomPayment: (id: string, updates: { label: string; keywords: string[] }) => void
  removeCustomPayment: (id: string) => void
  restoreHiddenPayment: (id: string) => void
  addCustomCategory: (label: string, keywords: string[], subcategories?: string[], type?: TransactionType, monthlyBudget?: number, icon?: string) => void
  updateCustomCategory: (id: string, updates: { label: string; keywords: string[]; subcategories?: string[]; type?: TransactionType; monthlyBudget?: number; icon?: string }) => void
  removeCustomCategory: (id: string) => void
  restoreHiddenCategory: (id: string) => void
  parserExtras: ParserExtras
}

interface PreferenceStore {
  zenMode: boolean
  themeMode: ThemeMode
  toggleZen: () => void
  setThemeMode: (mode: ThemeMode) => void
}

interface FeedbackStore {
  toast: Toast | null
  showToast: (text: string, type: 'success' | 'error', action?: Toast['action'], durationMs?: number) => void
  dismissToast: () => void
}

const StoreContext = createContext<StoreValue | null>(null)
const AuthContext = createContext<AuthStore | null>(null)
const TransactionDataContext = createContext<TransactionDataStore | null>(null)
const TransactionActionsContext = createContext<TransactionActionsStore | null>(null)
const TransactionStatusContext = createContext<TransactionStatusStore | null>(null)
const WalletContext = createContext<WalletStore | null>(null)
const ReconciliationContext = createContext<ReconciliationStore | null>(null)
const BillContext = createContext<BillStore | null>(null)
const RuleInboxContext = createContext<RuleInboxStore | null>(null)
const MonthlyCloseContext = createContext<MonthlyCloseStore | null>(null)
const NetWorthContext = createContext<NetWorthStore | null>(null)
const BudgetContext = createContext<BudgetStore | null>(null)
const CustomizationContext = createContext<CustomizationStore | null>(null)
const PreferenceContext = createContext<PreferenceStore | null>(null)
const FeedbackContext = createContext<FeedbackStore | null>(null)

// ── Seeds ──────────────────────────────────────────────────────────────────────
const SEED_PAYMENTS: CustomPayment[] = [
  { id: 'seabank', label: 'SeaBank', keywords: ['seabank', 'sea'] },
]
const SEED_CATEGORIES: CustomCategory[] = [
  { id: 'expense-peliharaan', label: 'Peliharaan', keywords: ['kucing', 'anjing', 'catfood', 'vet', 'grooming'], type: 'expense' },
]
const DEFAULT_MONTHLY_BUDGET = 0
const PRELOADED_STATE_URL = '/preloaded-state.json'
const ONBOARDING_STORAGE_KEY_PREFIX = 'sakukilat:v2:onboarding-completed-v'
const BUNDLE_SEED_TIMEOUT_MS = 1600
const KNOWN_STORAGE_KEYS = new Set([
  STORAGE_KEY,
  'sakukilat:v2:goals',
  'sakukilat:v2:celebrated-goals',
  'sakukilat:v2:recurring',
  'sakukilat:v2:celebrated-streak',
  'sakukilat:v2:onboarding-completed',
  'sakukilat:v2:debts',
])
// Prefix key yang BUKAN garbage & wajib dipertahankan saat pembersihan
// localStorage (counter & progress achievement, flag fitur, dll).
const PRESERVED_KEY_PREFIXES = [
  'sakukilat:v2:onboarding-completed',
  'sakukilat:v2:onboarding-completed-v',
  'sakukilat:onboarding:',
  'sakukilat:v2:backup-count',
  'sakukilat:v2:import-count',
  'sakukilat:v2:zen-used',
  'sakukilat:v2:edit-count',
  'sakukilat:v2:undo-count',
  'sakukilat:v2:guide-opened',
  'sakukilat:v2:photo-changed',
  'sakukilat:v2:tabs-seen',
  'sakukilat:v2:rekap-days',
  'sakukilat:v2:badge-unlock',
  'sakukilat:v2:badges-seen',
  'sakukilat:v2:budget-set',
  'sakukilat:v2:tren-seen',
  'sakukilat:v2:goal-deadline',
  'sakukilat:v2:ach-',
  'sakukilat:v2:notif-prefs',
  'sakukilat:v2:last-rollover',
  'sakukilat:v2:app-lock',
  'sakukilat:v2:demo',
  'sakukilat:v2:debts',
]
const DEMO_USER: MockUser = {
  name: 'Perangkat Ini',
  givenName: 'Kamu',
  email: 'local-device@sakukilat.local',
  avatarUrl: '/avatar.png',
}

interface PersistedState {
  schemaVersion?: number
  transactions?: Array<Omit<Transaction, 'date'> & { date: string }>
  wallets?: WalletAccount[]
  monthlyBudget?: number
  customPayments?: CustomPayment[]
  customCategories?: CustomCategory[]
  hiddenPaymentIds?: string[]
  hiddenCategoryIds?: string[]
  reconciliations?: WalletReconciliation[]
  bills?: Bill[]
  localRules?: LocalCategoryRule[]
  inbox?: InboxTransactionItem[]
  monthlyCloses?: MonthlyCloseRecord[]
  debts?: DebtItem[]
  zenMode?: boolean
  themeMode?: ThemeMode
  profileName?: string | null
  profileAvatarUrl?: string | null
}

// ── v2 → v3 demo-data purge helpers ─────────────────────────────────────────
// Old builds shipped with hard-coded seed transactions and pre-filled wallet
// balances. Any user / tester who opened the previous version still has that
// data in localStorage, so even after the clean-slate commit they keep seeing
// dummy entries. v3 migrates them away — surgically, never destructively.

/** Old createMockTransactions used ids `txn-001`..`txn-010`. Old
 *  generateHistory used `seed-{daysAgo}-{j}` and `seed-income-{m}`. Live
 *  user input goes through generateId() which uses `txn-{epochMs}-{random}`,
 *  so the patterns below cannot collide with real data. */
function isLegacySeedTransactionId(id: unknown): boolean {
  if (typeof id !== 'string') return false
  return /^txn-0\d{2}$/.test(id) || id.startsWith('seed-')
}

/** Exact balances shipped with the previous SEED_WALLETS. If every wallet in
 *  the persisted state matches verbatim, the user never touched the wallet
 *  manager → it's safe to zero them. The moment any value differs we leave
 *  ALL of them alone, because at that point real bookkeeping is at stake. */
const LEGACY_WALLET_BALANCES: Record<string, number> = {
  tunai:     650_000,
  bca:       4_850_000,
  seabank:   1_200_000,
  gopay:     240_000,
  ovo:       185_000,
  dana:      165_000,
  shopeepay: 90_000,
  tabungan:  2_500_000,
}

const PARENT_INCOME_CATEGORY_ID = 'orangtua'
const PARENT_INCOME_CATEGORY: CustomCategory = {
  id: PARENT_INCOME_CATEGORY_ID,
  label: 'Orang tua',
  keywords: [PARENT_INCOME_CATEGORY_ID, 'orang tua'],
  type: 'income',
}
const GENERIC_INCOME_BUCKETS = new Set(['hadiah', 'lainnya'])

function compactKey(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}

function promoteParentIncomeCategory(state: PersistedState): PersistedState {
  if (!Array.isArray(state.transactions)) return state
  let changed = false
  const transactions = state.transactions.map(transaction => {
    const isParentIncome = transaction.type === 'income'
      && transaction.category === 'hadiah'
      && compactKey(transaction.subcategory) === PARENT_INCOME_CATEGORY_ID
    if (!isParentIncome) return transaction
    changed = true
    return { ...transaction, category: PARENT_INCOME_CATEGORY_ID, subcategory: undefined }
  })
  if (!changed) return state

  const customCategories = Array.isArray(state.customCategories) ? state.customCategories : []
  return {
    ...state,
    transactions,
    customCategories: customCategories.some(category => category.id === PARENT_INCOME_CATEGORY_ID && category.type === 'income')
      ? customCategories
      : [...customCategories, PARENT_INCOME_CATEGORY],
  }
}

function reviveTransactions(items: PersistedState['transactions']): Transaction[] | null {
  if (!Array.isArray(items)) return null

  return items
    .map(item => ({
      ...item,
      date: deserializeTransactionDate(item.date),
    }))
    .filter(item => Number.isFinite(item.date.getTime()))
}

function migratePersistedState(state: PersistedState): PersistedState {
  const prevVersion = state.schemaVersion ?? 1
  const next: PersistedState = { ...state }

  if (prevVersion < 4) {
    // 1. Strip leftover seed transactions. User-entered ones (timestamp ids)
    //    survive untouched — `isLegacySeedTransactionId` only matches the
    //    fixed pre-baked patterns.
    if (Array.isArray(next.transactions)) {
      next.transactions = next.transactions.filter(t => !isLegacySeedTransactionId(t.id))
    }

    // 2. Zero out wallet balances ONLY if every wallet still has the exact
    //    pre-baked seed amount. Any divergence → user has been bookkeeping
    //    here, leave the whole thing alone.
    if (Array.isArray(next.wallets) && next.wallets.length > 0) {
      const allPristine = next.wallets.every(w => {
        const expected = LEGACY_WALLET_BALANCES[w.id]
        // Wallets the user has added themselves won't appear in the legacy
        // table — those don't count as "untouched seed" so we treat them
        // as user data and bail out of the reset.
        return expected !== undefined && w.balance === expected
      })
      if (allPristine) {
        next.wallets = next.wallets.map(w => ({ ...w, balance: 0 }))
      }
    }

    // 3. Reset monthlyBudget only if it's still the old hard-coded default.
    if (next.monthlyBudget === 1_500_000) {
      next.monthlyBudget = 0
    }
  }

  if (prevVersion < 5 && Array.isArray(next.customCategories)) {
    next.customCategories = next.customCategories.map(category => ({
      ...category,
      type: customCategoryType(category),
    }))
  }

  if (prevVersion < 6) {
    Object.assign(next, rebalanceLegacyCustomCategories(next))
  }

  if (prevVersion < 7) {
    Object.assign(next, promoteParentIncomeCategory(next))
  }

  if (prevVersion < 8) {
    Object.assign(next, promoteGenericIncomeSubcategories(next))
  }

  if (!Array.isArray(next.reconciliations)) {
    next.reconciliations = []
  }

  if (!Array.isArray(next.bills)) {
    next.bills = []
  }

  if (!Array.isArray(next.localRules)) {
    next.localRules = []
  }

  if (!Array.isArray(next.inbox)) {
    next.inbox = []
  }

  if (!Array.isArray(next.monthlyCloses)) {
    next.monthlyCloses = []
  }

  if (!Array.isArray(next.debts)) {
    next.debts = []
  }

  Object.assign(next, deduplicatePersistedCategories(next))

  return { ...next, schemaVersion: CURRENT_SCHEMA_VERSION }
}

export {
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  type StorageStatus,
  type LoadResult,
}

function deduplicatePersistedCategories(state: PersistedState): PersistedState {
  if (!Array.isArray(state.customCategories)) return state
  const dedupeMap = new Map<string, CustomCategory>()
  let changed = false

  for (const cat of state.customCategories) {
    const norm = compactKey(cat.label) || compactKey(cat.id)
    const isLainnya = norm === 'lainnya' || norm === 'lainlain'
    const key = isLainnya ? 'lainnya' : `${cat.type ?? 'expense'}-${norm}`

    const existing = dedupeMap.get(key)
    if (!existing) {
      dedupeMap.set(key, { ...cat, id: isLainnya ? 'lainnya' : cat.id })
    } else {
      changed = true
      existing.subcategories = Array.from(new Set([
        ...(existing.subcategories ?? []),
        ...(cat.subcategories ?? []),
      ].map(s => s.trim()).filter(Boolean)))
      existing.keywords = Array.from(new Set([
        ...(existing.keywords ?? []),
        ...(cat.keywords ?? []),
      ].map(k => k.toLowerCase().trim()).filter(Boolean)))
    }
  }

  if (!changed) return state
  return {
    ...state,
    customCategories: Array.from(dedupeMap.values()),
  }
}

function loadPersistedStateForStore(): LoadResult {
  const result = loadPersistedState()
  // Only clean up stale keys when storage status is safe (valid/missing).
  // For corrupt/incompatible, unknown keys might belong to a newer version.
  if ((result.status === 'valid' || result.status === 'missing') && typeof window !== 'undefined') {
    cleanupStaleStorageKeys(window.localStorage)
  }
  if (result.status === 'valid' && result.state) {
    const prevVersion = typeof result.state.schemaVersion === 'number' ? result.state.schemaVersion : 1
    if (prevVersion < CURRENT_SCHEMA_VERSION && typeof window !== 'undefined') {
      try {
        createComprehensiveCheckpoint(
          window.localStorage,
          'migration',
          `Sebelum migrasi skema v${prevVersion} ke v${CURRENT_SCHEMA_VERSION}`
        )
      } catch {
        // Non-blocking checkpoint creation
      }
    }
    return {
      ...result,
      state: migratePersistedState(result.state),
    }
  }
  return result
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Teman'
}

function applyProfileSettings(user: MockUser, profileName: string | null, profileAvatarUrl: string | null): MockUser {
  const name = profileName?.trim()
  const avatarUrl = profileAvatarUrl?.trim()
  return {
    ...user,
    name: name || user.name,
    givenName: name ? firstName(name) : user.givenName,
    avatarUrl: avatarUrl || user.avatarUrl,
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `c-${Date.now()}`
}

function customCategoryType(category: Pick<CustomCategory, 'id' | 'type'>): TransactionType {
  return category.type === 'income' || category.type === 'expense'
    ? category.type
    : getBuiltinCategoryType(category.id)
}

function buildCustomCategoryId(label: string, type: TransactionType): string {
  const slug = slugify(label)
  return getBuiltinCategoryType(slug) === type ? slug : `${type}-${slug}`
}

function findIncomeCategoryByLabel(label: string, customCategories: CustomCategory[]): string | null {
  const normalized = compactKey(label)
  if (!normalized) return null
  if (normalized === PARENT_INCOME_CATEGORY_ID) return PARENT_INCOME_CATEGORY_ID

  for (const [id, config] of Object.entries(CATEGORY_CONFIG)) {
    if (getBuiltinCategoryType(id) !== 'income') continue
    if (compactKey(id) === normalized || compactKey(config.label) === normalized) return id
  }

  for (const category of customCategories) {
    if (customCategoryType(category) !== 'income') continue
    if ([category.id, category.label, ...category.keywords].some(keyword => compactKey(keyword) === normalized)) return category.id
  }

  return null
}

function ensureIncomeCategoryFromLabel(label: string, customCategories: CustomCategory[]): { id: string; customCategories: CustomCategory[] } {
  const existing = findIncomeCategoryByLabel(label, customCategories)
  if (existing) return { id: existing, customCategories }

  const id = buildCustomCategoryId(label, 'income')
  return {
    id,
    customCategories: [
      ...customCategories,
      {
        id,
        label: label.trim(),
        keywords: [id, label.toLowerCase().trim()],
        type: 'income',
        icon: suggestCategoryIconKey(label),
      },
    ],
  }
}

function promoteGenericIncomeSubcategories(state: PersistedState): PersistedState {
  if (!Array.isArray(state.transactions)) return state

  let changed = false
  let customCategories = Array.isArray(state.customCategories) ? state.customCategories : []
  const transactions = state.transactions.map(transaction => {
    const subcategory = transaction.subcategory?.trim()
    if (
      transaction.type !== 'income' ||
      !subcategory ||
      !GENERIC_INCOME_BUCKETS.has(transaction.category) ||
      GENERIC_INCOME_BUCKETS.has(compactKey(subcategory))
    ) {
      return transaction
    }

    const result = ensureIncomeCategoryFromLabel(subcategory, customCategories)
    customCategories = result.customCategories
    changed = true
    return { ...transaction, category: result.id, subcategory: undefined }
  })

  return changed ? { ...state, transactions, customCategories } : state
}

function rebalanceLegacyCustomCategories(state: PersistedState): PersistedState {
  if (!Array.isArray(state.customCategories) || !Array.isArray(state.transactions)) return state

  const customCategories = state.customCategories.map(category => ({
    ...category,
    type: customCategoryType(category),
  }))
  const customById = new Map(customCategories.map(category => [category.id, category]))
  const usage = new Map<string, { income: number; expense: number }>()

  for (const transaction of state.transactions) {
    if (transaction.kind && transaction.kind !== 'transaction') continue
    if (!customById.has(transaction.category)) continue
    const stats = usage.get(transaction.category) ?? { income: 0, expense: 0 }
    stats[transaction.type] += 1
    usage.set(transaction.category, stats)
  }

  const nextCategories = [...customCategories]
  const categoryIds = new Set(nextCategories.map(category => category.id))
  const remappedTransactions = state.transactions.map(transaction => ({ ...transaction }))

  for (const category of customCategories) {
    const stats = usage.get(category.id)
    if (!stats) continue

    if (stats.income > 0 && stats.expense === 0) {
      category.type = 'income'
      continue
    }

    if (stats.expense > 0 && stats.income === 0) {
      category.type = 'expense'
      continue
    }

    if (stats.income === 0 || stats.expense === 0) continue

    const incomeCategoryId = buildCustomCategoryId(category.label, 'income')
    if (!categoryIds.has(incomeCategoryId)) {
      nextCategories.push({
        ...category,
        id: incomeCategoryId,
        type: 'income',
      })
      categoryIds.add(incomeCategoryId)
    }
    category.type = 'expense'
    for (const transaction of remappedTransactions) {
      if (transaction.category === category.id && transaction.type === 'income') {
        transaction.category = incomeCategoryId
      }
    }
  }

  return {
    ...state,
    transactions: remappedTransactions,
    customCategories: nextCategories,
  }
}

function normalizeKeywords(id: string, keywords: string[]): string[] {
  return Array.from(new Set([id, ...keywords.map(k => k.toLowerCase().trim()).filter(Boolean)]))
}

function createWallet(label: string, type: WalletType, balance: number, keywords: string[]): WalletAccount {
  const id = slugify(label)
  return {
    id,
    label: label.trim(),
    type,
    balance: Math.max(0, Math.round(balance)),
    keywords: normalizeKeywords(id, keywords),
  }
}

export function validateWalletPayload(payload: {
  label?: string
  openingBalance?: number
  currentBalance?: number
  balance?: number
}): void {
  if (payload.label !== undefined && payload.label.trim().length === 0) {
    throw new Error('Nama saku tidak boleh kosong.')
  }
  if (payload.openingBalance !== undefined) {
    if (!Number.isFinite(payload.openingBalance) || Number.isNaN(payload.openingBalance) || payload.openingBalance < 0) {
      throw new Error('Saldo awal harus berupa bilangan bulat valid dan tidak boleh negatif.')
    }
  }
  if (payload.currentBalance !== undefined) {
    if (!Number.isFinite(payload.currentBalance) || Number.isNaN(payload.currentBalance)) {
      throw new Error('Saldo saat ini harus berupa bilangan bulat valid.')
    }
  }
  if (payload.balance !== undefined) {
    if (!Number.isFinite(payload.balance) || Number.isNaN(payload.balance) || payload.balance < 0) {
      throw new Error('Saldo harus berupa bilangan bulat valid dan tidak boleh negatif.')
    }
  }
}

export function validateMonthlyBudget(budget: unknown): number {
  const sanitized = sanitizeIntegerRupiah(budget, 'Anggaran bulanan')
  if (sanitized < 0) {
    throw new Error('Anggaran bulanan tidak boleh bernilai negatif.')
  }
  return sanitized
}

export function archiveWallet(walletId: string, wallets: WalletAccount[]): WalletAccount[] {
  return wallets.map(w => (w.id === walletId ? { ...w, isArchived: true, archivedAt: new Date().toISOString() } : w))
}

export function ensureWallet(
  first: string | WalletAccount[],
  second: string | WalletAccount[],
  options?: { allowCreate?: boolean; fallbackWalletId?: string }
): any {
  let nameOrId: string
  let wallets: WalletAccount[]

  if (typeof first === 'string') {
    nameOrId = first
    wallets = Array.isArray(second) ? second : []
  } else {
    wallets = Array.isArray(first) ? first : []
    nameOrId = typeof second === 'string' ? second : ''
  }

  const trimmed = (nameOrId || '').trim().toLowerCase()
  const existing = wallets.find(w => w.id === nameOrId || w.label.toLowerCase() === trimmed)

  if (existing) {
    if (existing.isDeleted || existing.isArchived) {
      // Guard against resurrecting deleted or archived wallets
      const fallbackWallet =
        wallets.find(w => w.id === options?.fallbackWalletId && !w.isDeleted && !w.isArchived) ||
        wallets.find(w => (w.id === 'cash' || w.id === 'tunai') && !w.isDeleted && !w.isArchived) ||
        wallets.find(w => !w.isDeleted && !w.isArchived)

      if (!fallbackWallet) {
        throw new Error('Tidak ada saku aktif yang dapat digunakan sebagai fallback.')
      }
      return { wallet: fallbackWallet, wasCreated: false, wasRejected: true, walletResurrected: false }
    }
    return { wallet: existing, wasCreated: false, wasRejected: false, walletResurrected: false }
  }

  if (!options?.allowCreate) {
    const fallbackWallet =
      wallets.find(w => w.id === options?.fallbackWalletId && !w.isDeleted && !w.isArchived) ||
      wallets.find(w => (w.id === 'cash' || w.id === 'tunai') && !w.isDeleted && !w.isArchived) ||
      wallets.find(w => !w.isDeleted && !w.isArchived)
    return { wallet: fallbackWallet!, wasCreated: false, wasRejected: true, walletResurrected: false }
  }

  const newWallet: WalletAccount = {
    id: slugify(nameOrId.trim()) || `wallet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    label: nameOrId.trim(),
    type: 'other',
    balance: 0,
    openingBalance: 0,
    currentBalance: 0,
    isArchived: false,
    isDeleted: false,
    keywords: [trimmed],
    createdAt: new Date().toISOString(),
  }
  return { wallet: newWallet, wasCreated: true, wasRejected: false, walletResurrected: false }
}

export function deleteCategoryPreservingLabels(
  categoryId: string,
  categories: CustomCategory[],
  transactions: Transaction[],
  fallbackCategory = { id: 'lainnya', label: 'Lain-lain' }
): { updatedCategories: CustomCategory[]; updatedTransactions: Transaction[] } {
  const catToDelete = categories.find(c => c.id === categoryId)
  const preservedLabel = catToDelete?.label || fallbackCategory.label

  const updatedCategories = categories.filter(c => c.id !== categoryId)
  const updatedTransactions = transactions.map(tx => {
    if (tx.category === categoryId) {
      return {
        ...tx,
        category: fallbackCategory.id,
        historicalCategoryLabel: preservedLabel,
      }
    }
    return tx
  })

  return { updatedCategories, updatedTransactions }
}

export function deduplicateCategories(
  categories: CustomCategory[],
  transactions: Transaction[]
): { uniqueCategories: CustomCategory[]; remappedTransactions: Transaction[] } {
  const canonicalMap = new Map<string, CustomCategory>()
  const idRemapTable = new Map<string, string>()

  for (const cat of categories) {
    const key = `${cat.label.trim().toLowerCase()}-${cat.type || 'expense'}`
    if (!canonicalMap.has(key)) {
      canonicalMap.set(key, cat)
      idRemapTable.set(cat.id, cat.id)
    } else {
      const canonical = canonicalMap.get(key)!
      idRemapTable.set(cat.id, canonical.id)
    }
  }

  const uniqueCategories = Array.from(canonicalMap.values())
  const remappedTransactions = transactions.map(tx => {
    const canonicalId = idRemapTable.get(tx.category)
    return canonicalId && canonicalId !== tx.category ? { ...tx, category: canonicalId } : tx
  })

  return { uniqueCategories, remappedTransactions }
}

function adjustWallets(wallets: WalletAccount[], deltas: Record<string, number>): WalletAccount[] {
  const withMissing = Object.keys(deltas).reduce((current, id) => {
    if (current.some(w => w.id === id)) return current
    const res = ensureWallet(id, current, { allowCreate: true })
    return res.wasCreated ? [...current, res.wallet] : current
  }, wallets)
  return withMissing.map(wallet => ({
    ...wallet,
    balance: wallet.balance + (deltas[wallet.id] ?? 0),
    currentBalance: (wallet.currentBalance ?? wallet.balance) + (deltas[wallet.id] ?? 0),
  }))
}

function transactionImpact(transaction: Transaction, direction: 1 | -1): Record<string, number> {
  const kind = transaction.kind ?? 'transaction'

  if ((kind === 'transfer' || kind === 'saving') && transaction.fromWalletId && transaction.toWalletId) {
    return {
      [transaction.fromWalletId]: -transaction.amount * direction,
      [transaction.toWalletId]: transaction.amount * direction,
    }
  }

  if (transaction.type === 'expense') {
    return { [transaction.paymentMethod]: -transaction.amount * direction }
  }

  return { [transaction.paymentMethod]: transaction.amount * direction }
}

function walletDropsBelowZero(wallets: WalletAccount[], transaction: Transaction): boolean {
  const impacts = transactionImpact(transaction, 1)

  return Object.entries(impacts).some(([walletId, delta]) => {
    if (delta >= 0) return false
    const wallet = wallets.find(item => item.id === walletId)
    return (wallet?.balance ?? 0) + delta < 0
  })
}

function triggerHaptic(duration = 35) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(duration)
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function StoreProvider({ children }: { children: ReactNode }) {
  const loadResultRef = useRef<LoadResult | null>(null)
  if (loadResultRef.current === null) {
    loadResultRef.current = loadPersistedStateForStore()
  }
  const { status: storageStatus, state: persisted } = loadResultRef.current
  const needsBundleSeed =
    !Array.isArray(persisted.transactions) &&
    !Array.isArray(persisted.wallets) &&
    typeof persisted.monthlyBudget !== 'number' &&
    !Array.isArray(persisted.customPayments) &&
    !Array.isArray(persisted.customCategories) &&
    !Array.isArray(persisted.hiddenPaymentIds) &&
    !Array.isArray(persisted.hiddenCategoryIds) &&
    !Array.isArray(persisted.bills) &&
    !Array.isArray(persisted.localRules) &&
    !Array.isArray(persisted.inbox) &&
    !Array.isArray(persisted.monthlyCloses) &&
    !Array.isArray(persisted.debts) &&
    typeof persisted.zenMode !== 'boolean' &&
    !persisted.themeMode &&
    persisted.profileName === undefined &&
    persisted.profileAvatarUrl === undefined

  const [user, setUser] = useState<MockUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [bundleSeedResolved, setBundleSeedResolved] = useState(() => !needsBundleSeed)

  const [transactions, setTransactions] = useState<Transaction[]>(() => reviveTransactions(persisted.transactions) ?? [])
  const [wallets, setWallets] = useState<WalletAccount[]>(() => {
    const rawWallets = Array.isArray(persisted.wallets) && persisted.wallets.length > 0
      ? persisted.wallets
      : createSeedWallets().map(wallet => ({ ...wallet, balance: 0 }))
    const initialTxs = reviveTransactions(persisted.transactions) ?? []
    const { reconciledWallets } = reconcileWalletBalances(rawWallets, initialTxs)
    return reconciledWallets
  })
  const mutationSequenceIdRef = useRef(0)
  const isUndoneRef = useRef<Record<string, boolean>>({})
  const [lastActiveWalletId, setLastActiveWalletId] = useState('tunai')
  const [newTransactionId, setNewTransactionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [monthlyBudget, setMonthlyBudgetState] = useState(() =>
    typeof persisted.monthlyBudget === 'number' ? persisted.monthlyBudget : DEFAULT_MONTHLY_BUDGET
  )

  const [customPayments, setCustomPayments] = useState<CustomPayment[]>(() =>
    Array.isArray(persisted.customPayments) ? persisted.customPayments : SEED_PAYMENTS
  )
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() =>
    Array.isArray(persisted.customCategories) ? persisted.customCategories : SEED_CATEGORIES
  )
  const [hiddenPaymentIds, setHiddenPaymentIds] = useState<string[]>(() =>
    Array.isArray(persisted.hiddenPaymentIds) ? persisted.hiddenPaymentIds : []
  )
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>(() =>
    Array.isArray(persisted.hiddenCategoryIds) ? persisted.hiddenCategoryIds : []
  )
  const [reconciliations, setReconciliations] = useState<WalletReconciliation[]>(() =>
    Array.isArray(persisted.reconciliations) ? persisted.reconciliations : []
  )
  const [bills, setBills] = useState<Bill[]>(() =>
    Array.isArray(persisted.bills) ? persisted.bills : []
  )
  const [localRules, setLocalRules] = useState<LocalCategoryRule[]>(() =>
    Array.isArray(persisted.localRules) ? persisted.localRules : []
  )
  const [inbox, setInbox] = useState<InboxTransactionItem[]>(() =>
    Array.isArray(persisted.inbox) ? persisted.inbox : []
  )
  const [monthlyCloses, setMonthlyCloses] = useState<MonthlyCloseRecord[]>(() =>
    Array.isArray(persisted.monthlyCloses) ? persisted.monthlyCloses : []
  )
  const [debts, setDebts] = useState<DebtItem[]>(() =>
    Array.isArray(persisted.debts) ? persisted.debts : []
  )

  const [zenMode, setZenMode] = useState(() => Boolean(persisted.zenMode))
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => persisted.themeMode ?? 'dark')
  const [profileName, setProfileName] = useState<string | null>(() => persisted.profileName ?? null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => persisted.profileAvatarUrl ?? null)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const profileNameRef = useRef(profileName)
  const profileAvatarRef = useRef(profileAvatarUrl)

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(null)
    toastTimerRef.current = null
  }, [])

  const showToast = useCallback((text: string, type: 'success' | 'error', action?: Toast['action'], durationMs?: number) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type, action })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, durationMs ?? (action ? 5500 : 3000))
  }, [])

  useEffect(() => {
    profileNameRef.current = profileName
  }, [profileName])

  useEffect(() => {
    profileAvatarRef.current = profileAvatarUrl
  }, [profileAvatarUrl])

  const applyPersistedSnapshot = useCallback((state: PersistedState) => {
    const next = migratePersistedState(state)
    const revivedTransactions = reviveTransactions(next.transactions)
    if (revivedTransactions) setTransactions(revivedTransactions)
    if (Array.isArray(next.wallets) && next.wallets.length > 0) setWallets(next.wallets)
    if (typeof next.monthlyBudget === 'number') setMonthlyBudgetState(next.monthlyBudget)
    if (Array.isArray(next.customPayments)) setCustomPayments(next.customPayments)
    if (Array.isArray(next.customCategories)) setCustomCategories(next.customCategories)
    if (Array.isArray(next.hiddenPaymentIds)) setHiddenPaymentIds(next.hiddenPaymentIds)
    if (Array.isArray(next.hiddenCategoryIds)) setHiddenCategoryIds(next.hiddenCategoryIds)
    if (Array.isArray(next.reconciliations)) setReconciliations(next.reconciliations)
    if (Array.isArray(next.bills)) setBills(next.bills)
    if (Array.isArray(next.localRules)) setLocalRules(next.localRules)
    if (Array.isArray(next.inbox)) setInbox(next.inbox)
    if (Array.isArray(next.monthlyCloses)) setMonthlyCloses(next.monthlyCloses)
    if (Array.isArray(next.debts)) setDebts(next.debts)
    if (typeof next.zenMode === 'boolean') setZenMode(next.zenMode)
    if (next.themeMode) setThemeModeState(next.themeMode)
    if ('profileName' in next) setProfileName(next.profileName ?? null)
    if ('profileAvatarUrl' in next) setProfileAvatarUrl(next.profileAvatarUrl ?? null)
  }, [])

  const persistedSnapshot = useMemo<PersistedState>(() => ({
    transactions: transactions.map(transaction => ({
      ...transaction,
      date: serializeTransactionDate(transaction.date),
    })),
    wallets,
    monthlyBudget,
    customPayments,
    customCategories,
    hiddenPaymentIds,
    hiddenCategoryIds,
    reconciliations,
    bills,
    localRules,
    inbox,
    monthlyCloses,
    debts,
    zenMode,
    themeMode,
    profileName,
    profileAvatarUrl,
  }), [
    transactions,
    wallets,
    monthlyBudget,
    customPayments,
    customCategories,
    hiddenPaymentIds,
    hiddenCategoryIds,
    reconciliations,
    bills,
    localRules,
    inbox,
    monthlyCloses,
    debts,
    zenMode,
    themeMode,
    profileName,
    profileAvatarUrl,
  ])

  useEffect(() => {
    if (!bundleSeedResolved) return
    setUser(applyProfileSettings(DEMO_USER, profileName, profileAvatarUrl))
    setAuthReady(true)
  }, [bundleSeedResolved, profileName, profileAvatarUrl])

  useEffect(() => {
    if (!needsBundleSeed || typeof window === 'undefined') return
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setBundleSeedResolved(true)
    }, BUNDLE_SEED_TIMEOUT_MS)

    const loadBundledState = async () => {
      try {
        const response = await fetch(PRELOADED_STATE_URL, { cache: 'no-store' })
        if (!response.ok) return
        const bundled = await response.json() as PersistedState
        if (cancelled) return
        applyPersistedSnapshot(bundled)
      } catch {
        // ponytail: bundled seed is optional; blank local state is a safe fallback.
      } finally {
        window.clearTimeout(timeoutId)
        if (!cancelled) setBundleSeedResolved(true)
      }
    }

    void loadBundledState()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [applyPersistedSnapshot, needsBundleSeed])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const forcedTheme = new URLSearchParams(window.location.search).get('demo') === '1' ? 'dark' : null

    const applyTheme = () => {
      const resolved = forcedTheme ?? (
        themeMode === 'system'
          ? media.matches ? 'dark' : 'light'
          : themeMode
      )

      root.dataset.theme = resolved
      root.classList.toggle('dark', resolved === 'dark')
      root.classList.toggle('light', resolved === 'light')
      root.style.colorScheme = resolved
    }

    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [themeMode])

  const netWorthSummary = useMemo(
    () => compileNetWorthSummary(wallets, debts),
    [wallets, debts]
  )

  useEffect(() => {
    if (!bundleSeedResolved || typeof window === 'undefined') return
    persistState(window.localStorage, persistedSnapshot, storageStatus)
    void syncWidgetSnapshot({
      transactions,
      wallets,
      bills,
      debts,
      netWorth: netWorthSummary.netWorth,
    }).catch(() => {
      /* non-blocking widget snapshot sync */
    })
  }, [bundleSeedResolved, persistedSnapshot, storageStatus, transactions, wallets, bills, debts, netWorthSummary.netWorth])

  // Keep the display registry in sync with custom slang
  useEffect(() => {
    registerCustomCategories(customCategories)
    registerCustomPayments([
      ...wallets
        .filter(wallet => !hiddenPaymentIds.includes(wallet.id))
        .map(wallet => ({ id: wallet.id, label: wallet.label })),
      ...customPayments,
    ])
  }, [customCategories, customPayments, hiddenPaymentIds, wallets])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const parserExtras = useMemo<ParserExtras>(
    () => ({
      payments: [
        ...wallets
          .filter(wallet => !hiddenPaymentIds.includes(wallet.id))
          .map(wallet => ({ id: wallet.id, label: wallet.label, keywords: wallet.keywords })),
        ...customPayments.map(p => ({ id: p.id, label: p.label, keywords: p.keywords })),
      ],
      categories: customCategories.map(c => ({
        id: c.id,
        label: c.label,
        keywords: c.keywords,
        subcategories: c.subcategories,
        type: c.type,
        icon: c.icon,
      })),
      lastActiveWalletId,
    }),
    [wallets, customPayments, customCategories, hiddenPaymentIds, lastActiveWalletId]
  )

  // ── Profil lokal ──────────────────────────────────────────────────────────
  const updateProfile = useCallback((name: string) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Profil tidak dapat diubah.', 'error')
      return
    }
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('Nama profil tidak boleh kosong.', 'error')
      return
    }

    setProfileName(trimmed)
    setUser(prev => prev ? applyProfileSettings(DEMO_USER, trimmed, profileAvatarRef.current) : prev)
    showToast('Profil diperbarui.', 'success')
  }, [showToast, storageStatus])

  const updateProfileAvatar = useCallback((avatarUrl: string | null) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Profil tidak dapat diubah.', 'error')
      return
    }
    const trimmed = avatarUrl?.trim() || null
    setProfileAvatarUrl(trimmed)
    setUser(prev => prev ? applyProfileSettings(DEMO_USER, profileNameRef.current, trimmed) : prev)
    showToast(trimmed ? 'Foto profil diperbarui.' : 'Foto profil dikembalikan ke bawaan.', 'success')
  }, [showToast, storageStatus])

  const totalStored = useMemo(
    () =>
      wallets
        .filter(wallet => !wallet.isArchived && !wallet.isDeleted)
        .reduce((sum, wallet) => {
          const bal = wallet.currentBalance !== undefined ? wallet.currentBalance : wallet.balance
          return sum + (Number.isFinite(bal) ? bal : 0)
        }, 0),
    [wallets]
  )

  const setMonthlyBudget = useCallback((amount: number) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Budget tidak dapat diubah.', 'error')
      return
    }
    let validBudget: number
    try {
      validBudget = validateMonthlyBudget(amount)
    } catch (err: any) {
      showToast(err?.message || 'Nominal budget tidak valid.', 'error')
      return
    }
    const hadBudget = monthlyBudget > 0
    setMonthlyBudgetState(validBudget)
    void import('./achievements').then(m => {
      m.setFlag('sakukilat:v2:budget-set')
      if (hadBudget) m.setFlag('sakukilat:v2:ach-budget-up')
    })
    showToast('Budget bulanan diperbarui.', 'success')
  }, [showToast, monthlyBudget, storageStatus])

  const addWallet = useCallback(
    (label: string, type: WalletType, balance: number, keywords: string[]) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Saku tidak dapat diubah.', 'error')
        return
      }
      try {
        validateWalletPayload({ label, balance, openingBalance: balance })
      } catch (err: any) {
        showToast(err?.message || 'Data saku tidak valid.', 'error')
        return
      }

      const wallet = createWallet(label, type, balance, keywords)
      const opening = Number.isFinite(balance) ? Math.max(0, Math.round(balance)) : 0
      const enrichedWallet: WalletAccount = {
        ...wallet,
        openingBalance: opening,
        currentBalance: opening,
        isArchived: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
      }

      setWallets(prev => (prev.some(item => item.id === enrichedWallet.id) ? prev : [...prev, enrichedWallet]))

      // Idempotency guard for mutual creation loop
      if (!isSyncingWalletPayment) {
        setSyncingWalletPayment(true)
        try {
          setCustomPayments(prev =>
            prev.some(payment => payment.id === enrichedWallet.id)
              ? prev
              : [...prev, { id: enrichedWallet.id, label: enrichedWallet.label, keywords: enrichedWallet.keywords }]
          )
        } finally {
          setSyncingWalletPayment(false)
        }
      }

      showToast(`Saku "${wallet.label}" ditambahkan.`, 'success')
    },
    [showToast, storageStatus]
  )

  const updateWallet = useCallback(
    (id: string, updates: { label: string; type: WalletType; balance: number; keywords: string[] }) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Saku tidak dapat diubah.', 'error')
        return
      }

      // Parity validation (Task 3.10)
      try {
        validateWalletPayload({
          label: updates.label,
          balance: updates.balance,
          currentBalance: updates.balance,
        })
      } catch (err: any) {
        showToast(err?.message || 'Data saku tidak valid.', 'error')
        return
      }

      const label = updates.label.trim()
      const normalizedKeywords = normalizeKeywords(id, updates.keywords)
      const roundedBalance = Math.round(updates.balance)

      setWallets(prev =>
        prev.map(wallet =>
          wallet.id === id
            ? {
                ...wallet,
                label,
                type: updates.type,
                balance: roundedBalance,
                currentBalance: roundedBalance,
                openingBalance: wallet.openingBalance ?? roundedBalance,
                keywords: normalizedKeywords,
              }
            : wallet
        )
      )

      if (!isSyncingWalletPayment) {
        setSyncingWalletPayment(true)
        try {
          setCustomPayments(prev => {
            const payment = { id, label, keywords: normalizedKeywords }
            return prev.some(item => item.id === id)
              ? prev.map(item => item.id === id ? payment : item)
              : [...prev, payment]
          })
        } finally {
          setSyncingWalletPayment(false)
        }
      }

      showToast(`Saku "${label}" diperbarui.`, 'success')
    },
    [showToast, storageStatus]
  )

  const removeWallet = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Saku tidak dapat diubah.', 'error')
        return
      }
      const wallet = wallets.find(item => item.id === id)
      if (!wallet) return
      // Soft-delete: preserve historical transactions and references
      setWallets(prev => archiveWallet(id, prev))
      setCustomPayments(prev => prev.filter(payment => payment.id !== id))
      showToast(`Saku "${wallet.label}" diarsipkan.`, 'success')
    },
    [wallets, showToast, storageStatus]
  )

  const createMove = useCallback(
    (fromWalletId: string, toWalletId: string, amount: number, description = 'Pindah uang', kind: TransactionKind = 'transfer', date = new Date(), note?: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Transfer tidak dapat disimpan.', 'error')
        return null
      }
      const roundedAmount = Math.round(amount)
      if (!fromWalletId || !toWalletId || fromWalletId === toWalletId || roundedAmount <= 0) {
        if (fromWalletId && toWalletId && fromWalletId === toWalletId) {
          showToast('Dompet asal dan tujuan tidak boleh sama.', 'error')
        }
        return null
      }

      const id = generateId()
      const moveDate = date && !Number.isNaN(date.getTime()) ? new Date(date.getTime()) : new Date()
      const move: Transaction = {
        id,
        kind,
        description,
        amount: roundedAmount,
        type: 'expense',
        category: 'transfer',
        paymentMethod: fromWalletId,
        fromWalletId,
        toWalletId,
        date: moveDate,
        note: note?.trim() || undefined,
      }

      if (walletDropsBelowZero(wallets, move)) return null

      setWallets(prev => adjustWallets(prev, transactionImpact(move, 1)))
      setTransactions(prev => [move, ...prev])
      setLastActiveWalletId(fromWalletId)
      setNewTransactionId(id)
      triggerHaptic()
      setTimeout(() => setNewTransactionId(null), 700)
      return move
    },
    [wallets, storageStatus, showToast]
  )

  const transferMoney = useCallback(
    (fromWalletId: string, toWalletId: string, amount: number, description = 'Pindah uang', kind: TransactionKind = 'transfer', date?: Date, note?: string) => {
      const move = createMove(fromWalletId, toWalletId, amount, description, kind, date, note)
      if (!move) {
        showToast('Pindah uang belum valid atau saldo saku asal tidak cukup.', 'error')
        return false
      }
      showToast(kind === 'saving' ? 'Uang disimpan. Pelan-pelan jadi tebal.' : 'Uang dipindahkan.', 'success')
      return true
    },
    [createMove, showToast]
  )

  const saveMoney = useCallback(
    (fromWalletId: string, amount: number, toWalletId = 'tabungan') =>
      transferMoney(fromWalletId, toWalletId, amount, 'Simpan uang', 'saving'),
    [transferMoney]
  )

  // ── Reconciliation (Phase P6) ────────────────────────────────────────────────
  const reconcileWallet = useCallback(
    (params: ReconcileWalletParams): ReconcileWalletResult | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Rekonsiliasi tidak dapat disimpan.', 'error')
        return null
      }
      const wallet = wallets.find(w => w.id === params.walletId)
      if (!wallet) {
        showToast('Saku tidak ditemukan.', 'error')
        return null
      }
      const actualBalance = Math.round(Number(params.actualBalance))
      if (!Number.isFinite(actualBalance) || Number.isNaN(actualBalance)) {
        showToast('Nominal saldo fisik tidak valid.', 'error')
        return null
      }

      const expectedBalance = wallet.balance
      const difference = calculateReconciliationVariance(actualBalance, expectedBalance)
      const reconcileDate = params.date && !Number.isNaN(params.date.getTime())
        ? new Date(params.date.getTime())
        : new Date()
      const reconciledAt = reconcileDate.toISOString()

      const shouldCreateAdjustment = params.createAdjustment !== false && difference !== 0
      let adjustmentTx: Transaction | null = null

      if (shouldCreateAdjustment) {
        adjustmentTx = createAdjustmentTransaction(
          wallet.id,
          wallet.label,
          difference,
          params.note,
          reconcileDate
        )
      }

      const reconciliation = createReconciliationRecord({
        walletId: wallet.id,
        expectedBalance,
        actualBalance,
        difference,
        note: params.note,
        adjustmentTransactionId: adjustmentTx?.id,
        reconciledAt,
      })

      // Non-destructive: Existing historical transactions are never modified or deleted.
      if (adjustmentTx) {
        setTransactions(prev => [adjustmentTx!, ...prev])
        setWallets(prev =>
          adjustWallets(
            prev.map(w => w.id === wallet.id ? { ...w, lastReconciledAt: reconciledAt } : w),
            transactionImpact(adjustmentTx!, 1)
          )
        )
      } else {
        setWallets(prev =>
          prev.map(w => w.id === wallet.id ? { ...w, lastReconciledAt: reconciledAt } : w)
        )
      }

      setReconciliations(prev => [reconciliation, ...prev])
      triggerHaptic(30)
      showToast(
        difference === 0
          ? `Saldo "${wallet.label}" terverifikasi cocok.`
          : shouldCreateAdjustment
            ? `Rekonsiliasi & penyesuaian saldo "${wallet.label}" dicatat.`
            : `Catatan rekonsiliasi saldo "${wallet.label}" disimpan.`,
        'success'
      )

      return {
        reconciliation,
        adjustmentTransaction: adjustmentTx ?? undefined,
      }
    },
    [wallets, storageStatus, showToast]
  )

  const getWalletReconciliations = useCallback(
    (walletId: string): WalletReconciliation[] => {
      return getWalletReconciliationHistory(walletId, reconciliations)
    },
    [reconciliations]
  )

  // ── Optimistic add ──────────────────────────────────────────────────────────
  const addTransaction = useCallback(
    async (input: string): Promise<boolean> => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Transaksi tidak dapat disimpan.', 'error')
        return false
      }
      const parsed = parseEntry(input, parserExtras)
      if (!parsed || parsed.amount === 0) {
        showToast('Belum paham. Coba: "makan 25k gopay" atau "pindah 100k ovo ke gopay"', 'error')
        return false
      }

      if (parsed.warning) {
        showToast(parsed.warning, 'error')
      }

      if (parsed.kind === 'transfer' || parsed.kind === 'saving') {
        return transferMoney(
          parsed.fromWalletId,
          parsed.toWalletId,
          parsed.amount,
          parsed.description,
          parsed.kind
        )
      }

      setIsSubmitting(true)
      const optimisticId = generateId()
      const optimistic: Transaction = {
        id: optimisticId,
        kind: 'transaction',
        description: parsed.description,
        amount: parsed.amount,
        type: parsed.type,
        category: parsed.category,
        subcategory: parsed.subcategory,
        paymentMethod: parsed.paymentMethod,
        date: parsed.date && !Number.isNaN(parsed.date.getTime()) ? new Date(parsed.date.getTime()) : new Date(),
      }

      // Soft balance gate. We INTENTIONALLY no longer block submission when
      // a wallet would drop below zero — credit cards exist, debt happens,
      // and users routinely log expenses before income lands. The transaction
      // is recorded silently even if the wallet goes minus (no minus warning).
      setTransactions(prev => [optimistic, ...prev])
      setWallets(prev => adjustWallets(prev, transactionImpact(optimistic, 1)))
      setLastActiveWalletId(optimistic.paymentMethod)
      setNewTransactionId(optimisticId)
      setIsSubmitting(false)

      // Evaluate and queue to Inbox if unclassified or low confidence (Phase P8, Req 8.3)
      const ruleEval = evaluateTransactionForRules(optimistic.description, localRules)
      if (ruleEval.requiresInboxReview) {
        const queueEval = {
          ...ruleEval,
          suggestedCategoryId: ruleEval.suggestedCategoryId || (optimistic.category !== 'lainnya' ? optimistic.category : undefined),
          suggestedSubcategoryId: ruleEval.suggestedSubcategoryId || optimistic.subcategory,
        }
        const routeResult = routeToInboxIfNeeded(
          { id: optimisticId, description: optimistic.description, amount: optimistic.amount, date: optimistic.date },
          queueEval,
          inbox
        )
        if (routeResult.routed) {
          setInbox(routeResult.updatedInbox)
        }
      }

      mutationSequenceIdRef.current += 1
      const currentMutationSeq = mutationSequenceIdRef.current

      // Haptic thumb feedback
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(40)
      }
      setTimeout(() => setNewTransactionId(null), 700)
      showToast(
        'Tercatat di perangkat ini.',
        'success',
        {
          label: 'Urungkan',
          onClick: () => {
            if (isUndoneRef.current[optimisticId]) return
            isUndoneRef.current[optimisticId] = true

            setTransactions(prev => {
              const undoResult = executeSafeUndo(
                {
                  mutationSequenceId: currentMutationSeq,
                  timestamp: Date.now(),
                  transaction: optimistic,
                  actionType: 'CREATE',
                },
                mutationSequenceIdRef.current,
                { transactions: prev, wallets }
              )
              if (!undoResult.success) {
                showToast(undoResult.reason || 'Pembatalan gagal.', 'error')
                return prev.filter(t => t.id !== optimisticId)
              }
              setWallets(undoResult.state.wallets)
              return undoResult.state.transactions
            })
            setInbox(prev => prev.filter(i => i.id !== `inbox-${optimisticId}`))
            void import('./achievements').then(m => m.bumpCount(m.UNDO_COUNT_KEY))
            showToast('Transaksi diurungkan.', 'success')
          },
        },
        5500
      )
      return true
    },
    [parserExtras, showToast, transferMoney, wallets, storageStatus, localRules, inbox]
  )

  /** Manual entry — bypasses the parser entirely. Used by the modal form
   *  surfaced from SmartInput when the NL parser fails or the user wants
   *  precise wallet assignment. Same soft-balance semantics. */
  const addManualTransaction = useCallback(
    async (input: ManualTransactionInput): Promise<boolean> => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Transaksi tidak dapat disimpan.', 'error')
        return false
      }
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        showToast('Lengkapi nominal dulu.', 'error')
        return false
      }
      setIsSubmitting(true)
      const optimisticId = generateId()
      const description = input.description.trim() || (input.type === 'income' ? 'Pemasukan manual' : 'Pengeluaran manual')
      const optimistic: Transaction = {
        id: optimisticId,
        kind: 'transaction',
        description,
        amount: Math.round(input.amount),
        type: input.type,
        category: input.category,
        subcategory: input.subcategory,
        note: input.note?.trim() || undefined,
        paymentMethod: input.paymentMethod,
        date: input.date && !Number.isNaN(input.date.getTime()) ? new Date(input.date.getTime()) : new Date(),
        splitItems: input.splitItems && input.splitItems.length > 0 ? input.splitItems : undefined,
      }

      // Soft balance gate — a wallet may go minus; we record silently without
      // showing any minus warning.
      setTransactions(prev => [optimistic, ...prev])
      setWallets(prev => adjustWallets(prev, transactionImpact(optimistic, 1)))
      setLastActiveWalletId(optimistic.paymentMethod)
      setNewTransactionId(optimisticId)
      setIsSubmitting(false)

      // Evaluate and queue to Inbox if unclassified or low confidence (Phase P8, Req 8.3)
      const ruleEval = evaluateTransactionForRules(optimistic.description, localRules)
      if (ruleEval.requiresInboxReview) {
        const queueEval = {
          ...ruleEval,
          suggestedCategoryId: ruleEval.suggestedCategoryId || (optimistic.category !== 'lainnya' ? optimistic.category : undefined),
          suggestedSubcategoryId: ruleEval.suggestedSubcategoryId || optimistic.subcategory,
        }
        const routeResult = routeToInboxIfNeeded(
          { id: optimisticId, description: optimistic.description, amount: optimistic.amount, date: optimistic.date },
          queueEval,
          inbox
        )
        if (routeResult.routed) {
          setInbox(routeResult.updatedInbox)
        }
      }

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(28)
      }
      return true
    },
    [wallets, showToast, storageStatus, localRules, inbox]
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Transaksi tidak dapat dihapus.', 'error')
        return
      }
      const transaction = transactions.find(t => t.id === id)
      if (!transaction) return

      mutationSequenceIdRef.current += 1
      const currentMutationSeq = mutationSequenceIdRef.current
      const deleteId = `del-${id}-${currentMutationSeq}`

      setWallets(prev => adjustWallets(prev, transactionImpact(transaction, -1)))
      setTransactions(prev => prev.filter(t => t.id !== id))
      setInbox(prev => prev.filter(i => i.id !== `inbox-${id}`))
      triggerHaptic(25)
      showToast(
        'Transaksi dihapus.',
        'success',
        {
          label: 'Urungkan',
          onClick: () => {
            if (isUndoneRef.current[deleteId]) return
            isUndoneRef.current[deleteId] = true

            setTransactions(prev => {
              const undoResult = executeSafeUndo(
                {
                  mutationSequenceId: currentMutationSeq,
                  timestamp: Date.now(),
                  transaction,
                  actionType: 'DELETE',
                },
                mutationSequenceIdRef.current,
                { transactions: prev, wallets }
              )
              if (!undoResult.success) {
                showToast(undoResult.reason || 'Pembatalan gagal.', 'error')
                return prev.some(t => t.id === transaction.id) ? prev : [transaction, ...prev]
              }
              setWallets(undoResult.state.wallets)
              return undoResult.state.transactions
            })
            void import('./achievements').then(m => m.bumpCount(m.UNDO_COUNT_KEY))
            showToast('Transaksi dikembalikan.', 'success')
          },
        },
        5500
      )
    },
    [transactions, wallets, showToast, storageStatus]
  )

  // ── Custom slang management ──────────────────────────────────────────────────
  const updateTransaction = useCallback(
    (id: string, updates: TransactionUpdateInput) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Perubahan tidak dapat disimpan.', 'error')
        return
      }
      const transaction = transactions.find(t => t.id === id)
      if (!transaction) return

      const description = updates.description.trim()
      const amount = Math.round(updates.amount)
      if (!description || !Number.isFinite(amount) || amount <= 0) {
        showToast('Deskripsi dan nominal harus valid.', 'error')
        return
      }

      const isMove = (transaction.kind ?? 'transaction') !== 'transaction'
      const nextPaymentMethod = !isMove && updates.paymentMethod
        ? updates.paymentMethod
        : transaction.paymentMethod

      if (!isMove && updates.paymentMethod) {
        const targetWallet = wallets.find(w => w.id === updates.paymentMethod)
        if (targetWallet && (targetWallet.isArchived || targetWallet.isDeleted)) {
          showToast('Tidak dapat memindahkan transaksi ke dompet yang diarsipkan atau tidak aktif.', 'error')
          return
        }
      }

      // Kategori & sub-kategori hanya boleh berubah untuk transaksi normal (bukan
      // transfer/tabungan yang kind !== 'transaction').
      const nextCategory = !isMove && updates.category
        ? updates.category
        : transaction.category
      const nextSubcategory = isMove
        ? transaction.subcategory
        : updates.subcategory === undefined
          ? transaction.subcategory
          : updates.subcategory.trim() === ''
            ? undefined
            : updates.subcategory.trim()

      // Tanggal: kalau input valid, gunakan salinan Date baru untuk isolasi.
      // Jika tidak dikirim atau tidak valid, pertahankan salinan tanggal transaksi lama tanpa mutasi.
      const nextDate = updates.date instanceof Date && !Number.isNaN(updates.date.getTime())
        ? new Date(updates.date.getTime())
        : new Date(transaction.date.getTime())

      const updated: Transaction = {
        ...transaction,
        description,
        amount,
        paymentMethod: nextPaymentMethod,
        category: nextCategory,
        subcategory: nextSubcategory,
        note: updates.note !== undefined ? updates.note : transaction.note,
        date: nextDate,
        isPending: false,
        splitItems: updates.splitItems !== undefined ? updates.splitItems : transaction.splitItems,
      }
      // Soft balance gate — editing may push a wallet minus; we allow it
      // silently (consistent with adding a transaction) and no longer block.

      setTransactions(prev => prev.map(t => (t.id === id ? updated : t)))
      setWallets(prev =>
        adjustWallets(
          adjustWallets(prev, transactionImpact(transaction, -1)),
          transactionImpact(updated, 1)
        )
      )
      triggerHaptic(25)
      void import('./achievements').then(m => m.bumpCount(m.EDIT_COUNT_KEY))
      showToast('Transaksi diperbarui.', 'success')
    },
    [transactions, wallets, showToast, storageStatus]
  )

  // ── Bill management (Phase P5) ──────────────────────────────────────────────
  const addBill = useCallback(
    (input: Omit<Bill, 'id' | 'nextDueDate'> & { nextDueDate?: string }): string => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Tagihan tidak dapat disimpan.', 'error')
        return ''
      }
      const bill = createBill(input)
      setBills(prev => [bill, ...prev])
      showToast(`Tagihan "${bill.name}" ditambahkan.`, 'success')
      return bill.id
    },
    [showToast, storageStatus]
  )

  const updateBill = useCallback(
    (id: string, updates: Partial<Omit<Bill, 'id'>>) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Tagihan tidak dapat diubah.', 'error')
        return
      }
      setBills(prev =>
        prev.map(bill => {
          if (bill.id !== id) return bill
          const nextRecurrence = updates.recurrence ?? bill.recurrence
          const nextDueDay = updates.dueDay !== undefined ? Math.max(1, Math.round(updates.dueDay)) : bill.dueDay
          const nextDueMonth = updates.dueMonth ?? bill.dueMonth
          let nextDueDate = updates.nextDueDate ?? bill.nextDueDate
          if (
            (updates.recurrence !== undefined || updates.dueDay !== undefined || updates.dueMonth !== undefined) &&
            updates.nextDueDate === undefined
          ) {
            nextDueDate = computeNextDueDate(nextRecurrence, nextDueDay, new Date(), { dueMonth: nextDueMonth })
          }
          return {
            ...bill,
            ...updates,
            recurrence: nextRecurrence,
            dueDay: nextDueDay,
            dueMonth: nextDueMonth,
            nextDueDate,
            name: updates.name !== undefined ? updates.name.trim() : bill.name,
            amount: updates.amount !== undefined ? Math.max(0, Math.round(updates.amount)) : bill.amount,
          }
        })
      )
      showToast('Tagihan diperbarui.', 'success')
    },
    [showToast, storageStatus]
  )

  const removeBill = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Tagihan tidak dapat diubah.', 'error')
        return
      }
      const bill = bills.find(b => b.id === id)
      setBills(prev => prev.filter(b => b.id !== id))
      if (bill) {
        showToast(`Tagihan "${bill.name}" dihapus.`, 'success')
      }
    },
    [bills, showToast, storageStatus]
  )

  const toggleBillActive = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Tagihan tidak dapat diubah.', 'error')
        return
      }
      setBills(prev => prev.map(b => (b.id === id ? { ...b, isActive: !b.isActive } : b)))
    },
    [storageStatus]
  )

  const markBillPaid = useCallback(
    (billId: string, paidAmount?: number, walletId?: string, note?: string): Transaction | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Pembayaran tidak dapat disimpan.', 'error')
        return null
      }
      const bill = bills.find(b => b.id === billId)
      if (!bill) {
        showToast('Tagihan tidak ditemukan.', 'error')
        return null
      }
      const amount = paidAmount !== undefined && paidAmount > 0 ? Math.round(paidAmount) : bill.amount
      const paymentWallet = walletId || bill.paymentMethodId || 'tunai'
      const txId = generateId()
      const now = new Date()

      const tx: Transaction = {
        id: txId,
        kind: 'transaction',
        description: `Bayar tagihan: ${bill.name}`,
        amount,
        type: 'expense',
        category: bill.categoryId || 'tagihan',
        paymentMethod: paymentWallet,
        date: now,
        note: note?.trim() || bill.note,
        billId: bill.id,
      }

      setTransactions(prev => [tx, ...prev])
      setWallets(prev => adjustWallets(prev, transactionImpact(tx, 1)))

      const nextDueDate = computeNextDueDate(bill.recurrence, bill.dueDay, bill.nextDueDate || now, {
        dueMonth: bill.dueMonth,
      })

      setBills(prev =>
        prev.map(b =>
          b.id === billId
            ? {
                ...b,
                nextDueDate,
                lastPaidTransactionId: txId,
                lastPaidAt: now.toISOString(),
              }
            : b
        )
      )

      triggerHaptic(30)
      showToast(`Tagihan "${bill.name}" dicatat sudah dibayar.`, 'success')
      return tx
    },
    [bills, showToast, storageStatus]
  )

  // ── Rules & Inbox management (Phase P8) ──────────────────────────────────
  const pendingInboxCount = useMemo(
    () => inbox.filter(item => item.status === 'pending').length,
    [inbox]
  )

  const matchDescriptionToRule = useCallback(
    (description: string): CategoryMatchEvaluation => {
      return evaluateTransactionForRules(description, localRules)
    },
    [localRules]
  )

  const addLocalRule = useCallback(
    (input: CreateLocalRuleInput): LocalCategoryRule | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Aturan tidak dapat disimpan.', 'error')
        return null
      }
      try {
        const rule = createLocalRule(input, localRules)
        setLocalRules(prev => [rule, ...prev])
        showToast(`Aturan kategori "${rule.keyword}" ditambahkan.`, 'success')
        return rule
      } catch (err: any) {
        showToast(err?.message || 'Gagal menambahkan aturan kategori.', 'error')
        return null
      }
    },
    [localRules, showToast, storageStatus]
  )

  const updateLocalRule = useCallback(
    (id: string, updates: Partial<Omit<LocalCategoryRule, 'id' | 'createdAt'>>) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Aturan tidak dapat diubah.', 'error')
        return
      }
      setLocalRules(prev =>
        prev.map(rule => {
          if (rule.id !== id) return rule
          const nextKeyword = updates.keyword !== undefined ? updates.keyword.trim().toLowerCase() : rule.keyword
          return {
            ...rule,
            ...updates,
            keyword: nextKeyword || rule.keyword,
            categoryId: updates.categoryId !== undefined ? updates.categoryId.trim() : rule.categoryId,
            subcategoryId: updates.subcategoryId !== undefined ? updates.subcategoryId.trim() || undefined : rule.subcategoryId,
          }
        })
      )
      showToast('Aturan kategori diperbarui.', 'success')
    },
    [showToast, storageStatus]
  )

  const removeLocalRule = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Aturan tidak dapat dihapus.', 'error')
        return
      }
      const rule = localRules.find(r => r.id === id)
      setLocalRules(prev => prev.filter(r => r.id !== id))
      if (rule) {
        showToast(`Aturan "${rule.keyword}" dihapus.`, 'success')
      }
    },
    [localRules, showToast, storageStatus]
  )

  const toggleLocalRuleActive = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Aturan tidak dapat diubah.', 'error')
        return
      }
      setLocalRules(prev => prev.map(r => (r.id === id ? { ...r, isActive: !r.isActive } : r)))
    },
    [storageStatus]
  )

  const addInboxItem = useCallback(
    (input: CreateInboxItemInput): InboxTransactionItem => {
      const item = createInboxItem(input)
      setInbox(prev => [item, ...prev])
      return item
    },
    []
  )

  const updateInboxItemStatus = useCallback(
    (id: string, status: 'approved' | 'rejected', confirmedCategory?: { categoryId: string; subcategoryId?: string }) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Status inbox tidak dapat diubah.', 'error')
        return
      }
      setInbox(prev =>
        prev.map(item => {
          if (item.id !== id) return item
          return status === 'approved'
            ? approveInboxTransaction(item, confirmedCategory)
            : rejectInboxTransaction(item)
        })
      )
    },
    [showToast, storageStatus]
  )

  const removeInboxItem = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Item inbox tidak dapat dihapus.', 'error')
        return
      }
      setInbox(prev => prev.filter(inboxItem => inboxItem.id !== id))
    },
    [storageStatus]
  )

  const evaluateAndQueueTransaction = useCallback(
    (transaction: { id?: string; description: string; amount: number; date?: Date | string }): {
      match: CategoryMatchEvaluation
      inboxItem: InboxTransactionItem | null
    } => {
      const match = evaluateTransactionForRules(transaction.description, localRules)
      if (match.requiresInboxReview) {
        const routeResult = routeToInboxIfNeeded(transaction, match, inbox)
        if (routeResult.routed && routeResult.inboxItem) {
          setInbox(routeResult.updatedInbox)
          return { match, inboxItem: routeResult.inboxItem }
        }
      }
      return { match, inboxItem: null }
    },
    [localRules, inbox]
  )

  // ── Monthly close management (Phase P9) ──────────────────────────────────
  const executePreClosingChecklistCallback = useCallback(
    (year: number, month: number, options?: PreClosingChecklistOptions): PreClosingChecklistResult => {
      return evaluatePreClosingChecklist({
        year,
        month,
        transactions,
        inbox,
        wallets,
        reconciliations,
        bills,
        options: {
          hiddenWalletIds: hiddenPaymentIds,
          ...options,
        },
      })
    },
    [transactions, inbox, wallets, reconciliations, bills, hiddenPaymentIds]
  )

  const compileMonthlySummaryCallback = useCallback(
    (year: number, month: number): MonthlyFinancialSummary => {
      return compileMonthlyFinancialSummary({
        year,
        month,
        transactions,
        reconciliations,
      })
    },
    [transactions, reconciliations]
  )

  const closeMonthCallback = useCallback(
    (params: { year: number; month: number; closedAt?: string | Date; overrideValidation?: boolean }): MonthlyCloseRecord | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Tutup bulan tidak dapat disimpan.', 'error')
        return null
      }

      const { year, month, closedAt, overrideValidation } = params
      const monthId = formatMonthId(year, month)

      if (!overrideValidation) {
        const checklist = evaluatePreClosingChecklist({
          year,
          month,
          transactions,
          inbox,
          wallets,
          reconciliations,
          bills,
          options: { hiddenWalletIds: hiddenPaymentIds },
        })

        if (!checklist.isReadyToClose) {
          showToast(`Tutup buku belum siap: terdapat ${checklist.totalIssuesCount} item yang belum diselesaikan.`, 'error')
          return null
        }
      }

      const record = createMonthlyCloseRecord({
        year,
        month,
        transactions,
        reconciliations,
        closedAt,
        overrideValidation,
      })

      setMonthlyCloses(prev => {
        const existingIndex = prev.findIndex(r => r.id === monthId)
        if (existingIndex >= 0) {
          const next = [...prev]
          next[existingIndex] = record
          return next
        }
        return [record, ...prev]
      })

      triggerHaptic(35)
      showToast(`Periode ${formatMonthLabel(year, month)} berhasil ditutup.`, 'success')
      return record
    },
    [transactions, inbox, wallets, reconciliations, bills, hiddenPaymentIds, storageStatus, showToast]
  )

  const reopenMonthCallback = useCallback(
    (monthId: string, note: string, reopenedAt?: string | Date): MonthlyCloseRecord | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Status tutup buku tidak dapat diubah.', 'error')
        return null
      }

      const trimmedNote = note?.trim()
      if (!trimmedNote) {
        showToast('Catatan alasan pembukaan kembali wajib diisi.', 'error')
        return null
      }

      const existingRecord = monthlyCloses.find(r => r.id === monthId)
      if (!existingRecord) {
        showToast('Catatan tutup buku tidak ditemukan.', 'error')
        return null
      }

      const updated = reopenMonthlyClose(existingRecord, trimmedNote, reopenedAt)
      setMonthlyCloses(prev => prev.map(r => r.id === monthId ? updated : r))

      triggerHaptic(25)
      showToast(`Periode ${formatMonthLabel(existingRecord.year, existingRecord.month)} dibuka kembali.`, 'success')
      return updated
    },
    [monthlyCloses, storageStatus, showToast]
  )

  const isMonthClosedCallback = useCallback(
    (monthId: string): boolean => {
      return isMonthClosed(monthId, monthlyCloses)
    },
    [monthlyCloses]
  )

  const getMonthlyCloseRecordCallback = useCallback(
    (monthId: string): MonthlyCloseRecord | undefined => {
      return getMonthlyCloseRecord(monthId, monthlyCloses)
    },
    [monthlyCloses]
  )

  // ── Net Worth & Debts management (Phase P10) ─────────────────────────────
  const addDebt = useCallback(
    (input: CreateDebtInput): DebtItem | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Utang tidak dapat disimpan.', 'error')
        return null
      }
      try {
        const debt = createDebtItem(input)
        setDebts(prev => [debt, ...prev])
        showToast(`${debt.type === 'receivable' ? 'Piutang' : 'Utang'} "${debt.name}" dicatat.`, 'success')
        return debt
      } catch (err: any) {
        showToast(err?.message || 'Gagal mencatat utang.', 'error')
        return null
      }
    },
    [storageStatus, showToast]
  )

  const updateDebt = useCallback(
    (id: string, updates: Partial<Omit<DebtItem, 'id' | 'createdAt'>>) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Utang tidak dapat diubah.', 'error')
        return
      }
      try {
        setDebts(prev =>
          prev.map(debt => {
            if (debt.id !== id) return debt
            return updateDebtItem(debt, updates)
          })
        )
        showToast('Catatan utang diperbarui.', 'success')
      } catch (err: any) {
        showToast(err?.message || 'Gagal memperbarui utang.', 'error')
      }
    },
    [storageStatus, showToast]
  )

  const removeDebt = useCallback(
    (id: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Utang tidak dapat dihapus.', 'error')
        return
      }
      const debt = debts.find(d => d.id === id)
      setDebts(prev => prev.filter(d => d.id !== id))
      if (debt) {
        showToast(`${debt.type === 'receivable' ? 'Piutang' : 'Utang'} "${debt.name}" dihapus.`, 'success')
      }
    },
    [debts, storageStatus, showToast]
  )

  const payDebt = useCallback(
    (params: RecordDebtPaymentParams): RecordDebtPaymentResult | null => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Pembayaran tidak dapat disimpan.', 'error')
        return null
      }
      const debt = debts.find(d => d.id === params.debtId)
      if (!debt) {
        showToast('Catatan utang tidak ditemukan.', 'error')
        return null
      }

      try {
        const result = recordDebtPayment(debt, params)
        setDebts(prev => prev.map(d => d.id === debt.id ? result.updatedDebt : d))

        if (result.transaction) {
          const tx = result.transaction
          setTransactions(prev => [tx, ...prev])
          setWallets(prev => adjustWallets(prev, transactionImpact(tx, 1)))
        }

        triggerHaptic(30)
        showToast(
          result.updatedDebt.isSettled
            ? `${debt.type === 'receivable' ? 'Piutang' : 'Utang'} "${debt.name}" lunas!`
            : `Pembayaran ${debt.type === 'receivable' ? 'piutang' : 'utang'} "${debt.name}" dicatat.`,
          'success'
        )
        return result
      } catch (err: any) {
        showToast(err?.message || 'Gagal mencatat pembayaran utang.', 'error')
        return null
      }
    },
    [debts, storageStatus, showToast]
  )

  const getDebt = useCallback(
    (id: string): DebtItem | undefined => {
      return debts.find(d => d.id === id)
    },
    [debts]
  )

  const addCustomPayment = useCallback(
    (label: string, keywords: string[]) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
        return
      }
      const id = slugify(label)
      const kws = Array.from(new Set([id, ...keywords.map(k => k.toLowerCase().trim()).filter(Boolean)]))
      setHiddenPaymentIds(prev => prev.filter(item => item !== id))
      setCustomPayments(prev =>
        prev.some(p => p.id === id) ? prev : [...prev, { id, label: label.trim(), keywords: kws }]
      )

      if (!isSyncingWalletPayment) {
        setSyncingWalletPayment(true)
        try {
          setWallets(prev =>
            prev.some(wallet => wallet.id === id)
              ? prev
              : [
                  ...prev,
                  {
                    id,
                    label: label.trim(),
                    type: 'other',
                    balance: 0,
                    openingBalance: 0,
                    currentBalance: 0,
                    keywords: kws,
                    isArchived: false,
                    isDeleted: false,
                    createdAt: new Date().toISOString(),
                  },
                ]
          )
        } finally {
          setSyncingWalletPayment(false)
        }
      }

      showToast(`Metode "${label.trim()}" ditambahkan.`, 'success')
    },
    [showToast, storageStatus]
  )

  const updateCustomPayment = useCallback(
    (id: string, updates: { label: string; keywords: string[] }) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
        return
      }
      const label = updates.label.trim()
      if (!label) {
        showToast('Nama metode bayar tidak boleh kosong.', 'error')
        return
      }
      const kws = normalizeKeywords(id, updates.keywords)
      setHiddenPaymentIds(prev => prev.filter(item => item !== id))
      setCustomPayments(prev =>
        prev.some(payment => payment.id === id)
          ? prev.map(payment => payment.id === id ? { id, label, keywords: kws } : payment)
          : [...prev, { id, label, keywords: kws }]
      )
      setWallets(prev =>
        prev.map(wallet => wallet.id === id ? { ...wallet, label, keywords: kws } : wallet)
      )
      showToast(`Metode "${label}" diperbarui.`, 'success')
    },
    [showToast, storageStatus]
  )

  const removeCustomPayment = useCallback((id: string) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
      return
    }
    const isBuiltin = [
      'gopay', 'ovo', 'dana', 'shopeepay',
      'bca', 'bni', 'bri', 'mandiri',
      'jago', 'qris', 'kartu', 'transfer', 'tunai',
    ].includes(id)

    setCustomPayments(prev => prev.filter(p => p.id !== id))
    if (isBuiltin) {
      setHiddenPaymentIds(prev => prev.includes(id) ? prev : [...prev, id])
      showToast('Metode bawaan disembunyikan.', 'success')
      return
    }
    showToast('Metode dihapus.', 'success')
  }, [showToast, storageStatus])

  const restoreHiddenPayment = useCallback((id: string) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
      return
    }
    setHiddenPaymentIds(prev => prev.filter(item => item !== id))
    showToast('Metode bawaan dimunculkan lagi.', 'success')
  }, [showToast, storageStatus])

  const addCustomCategory = useCallback(
    (label: string, keywords: string[], subcategories: string[] = [], type: TransactionType = 'expense', monthlyBudget = 0, icon?: string) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
        return
      }
      const id = buildCustomCategoryId(label, type)
      const kws = Array.from(new Set(keywords.map(k => k.toLowerCase().trim()).filter(Boolean)))
      const subs = Array.from(new Set(subcategories.map(item => item.trim()).filter(Boolean)))
      const budget = Number.isFinite(monthlyBudget) && monthlyBudget > 0 ? monthlyBudget : 0
      const iconKey = icon?.trim() || suggestCategoryIconKey(label, kws)
      setHiddenCategoryIds(prev => prev.filter(item => item !== id))
      setCustomCategories(prev =>
        prev.some(c => c.id === id)
          ? prev
          : [...prev, { id, label: label.trim(), keywords: kws, subcategories: subs, type, monthlyBudget: budget, icon: iconKey }]
      )
      showToast(`Kategori "${label.trim()}" ditambahkan.`, 'success')
    },
    [showToast, storageStatus]
  )

  const updateCustomCategory = useCallback(
    (id: string, updates: { label: string; keywords: string[]; subcategories?: string[]; type?: TransactionType; monthlyBudget?: number; icon?: string }) => {
      if (!canMutateState(storageStatus)) {
        showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
        return
      }
      const label = updates.label.trim()
      if (!label) return
      const kws = Array.from(new Set(updates.keywords.map(k => k.toLowerCase().trim()).filter(Boolean)))
      const subs = updates.subcategories?.map(item => item.trim()).filter(Boolean)
      const budget = updates.monthlyBudget !== undefined
        ? (Number.isFinite(updates.monthlyBudget) && updates.monthlyBudget > 0 ? updates.monthlyBudget : 0)
        : undefined
      setHiddenCategoryIds(prev => prev.filter(item => item !== id))
      setCustomCategories(prev =>
        prev.some(c => c.id === id)
          ? prev.map(c => (c.id === id ? {
            ...c,
            label,
            keywords: kws,
            subcategories: subs ?? c.subcategories ?? [],
            type: updates.type ?? c.type ?? customCategoryType(c),
            monthlyBudget: budget ?? c.monthlyBudget ?? 0,
            icon: updates.icon?.trim() || c.icon || suggestCategoryIconKey(label, kws),
          } : c))
          : [...prev, {
            id,
            label,
            keywords: kws,
            subcategories: subs ?? [],
            type: updates.type ?? getBuiltinCategoryType(id),
            monthlyBudget: budget ?? 0,
            icon: updates.icon?.trim() || suggestCategoryIconKey(label, kws),
          }]
      )
      showToast(`Kategori "${label}" diperbarui.`, 'success')
    },
    [showToast, storageStatus]
  )

  const removeCustomCategory = useCallback((id: string) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
      return
    }
    const isBuiltin = id in CATEGORY_CONFIG
    if (isBuiltin && (id === 'lainnya' || id === 'transfer')) {
      showToast('Kategori inti tidak bisa disembunyikan.', 'error')
      return
    }

    // Preserve historicalCategoryLabel on past transactions (Task 3.16)
    const { updatedCategories, updatedTransactions } = deleteCategoryPreservingLabels(
      id,
      customCategories,
      transactions
    )
    setCustomCategories(updatedCategories)
    setTransactions(updatedTransactions)

    if (isBuiltin) {
      setHiddenCategoryIds(prev => prev.includes(id) ? prev : [...prev, id])
      showToast('Kategori bawaan disembunyikan.', 'success')
      return
    }
    showToast('Kategori dihapus.', 'success')
  }, [showToast, storageStatus, customCategories, transactions])

  const restoreHiddenCategory = useCallback((id: string) => {
    if (!canMutateState(storageStatus)) {
      showToast('Penyimpanan terkunci (mode recovery). Operasi dibatalkan.', 'error')
      return
    }
    setHiddenCategoryIds(prev => prev.filter(item => item !== id))
    showToast('Kategori bawaan dimunculkan lagi.', 'success')
  }, [showToast, storageStatus])

  const toggleZen = useCallback(() => setZenMode(z => {
    const next = !z
    if (next) { void import('./achievements').then(m => m.markZenUsed()) }
    return next
  }), [])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode)
    showToast(`Tema ${mode === 'system' ? 'mengikuti perangkat' : mode === 'dark' ? 'gelap' : 'terang'} diaktifkan.`, 'success')
  }, [showToast])

  const authValue = useMemo<AuthStore>(
    () => ({ user, authReady, updateProfile, updateProfileAvatar }),
    [user, authReady, updateProfile, updateProfileAvatar]
  )

  const transactionDataValue = useMemo<TransactionDataStore>(
    () => ({ transactions }),
    [transactions]
  )

  const transactionActionsValue = useMemo<TransactionActionsStore>(
    () => ({ addTransaction, addManualTransaction, updateTransaction, deleteTransaction }),
    [addTransaction, addManualTransaction, updateTransaction, deleteTransaction]
  )

  const transactionStatusValue = useMemo<TransactionStatusStore>(
    () => ({ newTransactionId, isSubmitting }),
    [newTransactionId, isSubmitting]
  )

  const walletValue = useMemo<WalletStore>(
    () => ({
      wallets,
      totalStored,
      addWallet,
      updateWallet,
      removeWallet,
      archiveWallet: removeWallet,
      transferMoney,
      saveMoney,
      reconciliations,
      reconcileWallet,
      getWalletReconciliations,
    }),
    [wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney, reconciliations, reconcileWallet, getWalletReconciliations]
  )

  const reconciliationValue = useMemo<ReconciliationStore>(
    () => ({
      reconciliations,
      reconcileWallet,
      getWalletReconciliations,
    }),
    [reconciliations, reconcileWallet, getWalletReconciliations]
  )

  const billValue = useMemo<BillStore>(
    () => ({
      bills,
      addBill,
      updateBill,
      removeBill,
      toggleBillActive,
      markBillPaid,
    }),
    [bills, addBill, updateBill, removeBill, toggleBillActive, markBillPaid]
  )

  const ruleInboxValue = useMemo<RuleInboxStore>(
    () => ({
      localRules,
      inbox,
      pendingInboxCount,
      addLocalRule,
      updateLocalRule,
      removeLocalRule,
      toggleLocalRuleActive,
      addInboxItem,
      updateInboxItemStatus,
      removeInboxItem,
      matchDescriptionToRule,
      evaluateAndQueueTransaction,
    }),
    [
      localRules,
      inbox,
      pendingInboxCount,
      addLocalRule,
      updateLocalRule,
      removeLocalRule,
      toggleLocalRuleActive,
      addInboxItem,
      updateInboxItemStatus,
      removeInboxItem,
      matchDescriptionToRule,
      evaluateAndQueueTransaction,
    ]
  )

  const monthlyCloseValue = useMemo<MonthlyCloseStore>(
    () => ({
      monthlyCloses,
      executePreClosingChecklist: executePreClosingChecklistCallback,
      compileMonthlySummary: compileMonthlySummaryCallback,
      closeMonth: closeMonthCallback,
      reopenMonth: reopenMonthCallback,
      isMonthClosed: isMonthClosedCallback,
      getMonthlyCloseRecord: getMonthlyCloseRecordCallback,
    }),
    [
      monthlyCloses,
      executePreClosingChecklistCallback,
      compileMonthlySummaryCallback,
      closeMonthCallback,
      reopenMonthCallback,
      isMonthClosedCallback,
      getMonthlyCloseRecordCallback,
    ]
  )

  const netWorthValue = useMemo<NetWorthStore>(
    () => ({
      debts,
      netWorthSummary,
      addDebt,
      updateDebt,
      removeDebt,
      payDebt,
      getDebt,
    }),
    [debts, netWorthSummary, addDebt, updateDebt, removeDebt, payDebt, getDebt]
  )

  const budgetValue = useMemo<BudgetStore>(
    () => ({ monthlyBudget, setMonthlyBudget }),
    [monthlyBudget, setMonthlyBudget]
  )

  const customizationValue = useMemo<CustomizationStore>(
    () => ({
      customPayments,
      customCategories,
      hiddenPaymentIds,
      hiddenCategoryIds,
      addCustomPayment,
      updateCustomPayment,
      removeCustomPayment,
      restoreHiddenPayment,
      addCustomCategory,
      updateCustomCategory,
      removeCustomCategory,
      restoreHiddenCategory,
      parserExtras,
    }),
    [
      customPayments,
      customCategories,
      hiddenPaymentIds,
      hiddenCategoryIds,
      addCustomPayment,
      updateCustomPayment,
      removeCustomPayment,
      restoreHiddenPayment,
      addCustomCategory,
      updateCustomCategory,
      removeCustomCategory,
      restoreHiddenCategory,
      parserExtras,
    ]
  )

  const preferenceValue = useMemo<PreferenceStore>(
    () => ({ zenMode, themeMode, toggleZen, setThemeMode }),
    [zenMode, themeMode, toggleZen, setThemeMode]
  )

  const feedbackValue = useMemo<FeedbackStore>(
    () => ({ toast, showToast, dismissToast }),
    [toast, showToast, dismissToast]
  )

  const value = useMemo<StoreValue>(
    () => ({
      user,
      authReady,
      updateProfile,
      updateProfileAvatar,
      transactions,
      addTransaction,
      addManualTransaction,
      updateTransaction,
      deleteTransaction,
      newTransactionId,
      isSubmitting,
      wallets,
      totalStored,
      addWallet,
      updateWallet,
      removeWallet,
      archiveWallet: removeWallet,
      transferMoney,
      saveMoney,
      reconciliations,
      reconcileWallet,
      getWalletReconciliations,
      bills,
      addBill,
      updateBill,
      removeBill,
      toggleBillActive,
      markBillPaid,
      localRules,
      inbox,
      pendingInboxCount,
      addLocalRule,
      updateLocalRule,
      removeLocalRule,
      toggleLocalRuleActive,
      addInboxItem,
      updateInboxItemStatus,
      removeInboxItem,
      matchDescriptionToRule,
      evaluateAndQueueTransaction,
      monthlyCloses,
      executePreClosingChecklist: executePreClosingChecklistCallback,
      compileMonthlySummary: compileMonthlySummaryCallback,
      closeMonth: closeMonthCallback,
      reopenMonth: reopenMonthCallback,
      isMonthClosed: isMonthClosedCallback,
      getMonthlyCloseRecord: getMonthlyCloseRecordCallback,
      debts,
      netWorthSummary,
      addDebt,
      updateDebt,
      removeDebt,
      payDebt,
      getDebt,
      monthlyBudget,
      setMonthlyBudget,
      customPayments,
      customCategories,
      hiddenPaymentIds,
      hiddenCategoryIds,
      addCustomPayment,
      removeCustomPayment,
      updateCustomPayment,
      restoreHiddenPayment,
      addCustomCategory,
      updateCustomCategory,
      removeCustomCategory,
      restoreHiddenCategory,
      parserExtras,
      zenMode,
      themeMode,
      toggleZen,
      setThemeMode,
      toast,
      showToast,
      dismissToast,
    }),
    [
      user, authReady, updateProfile, updateProfileAvatar,
      transactions, addTransaction, addManualTransaction, updateTransaction, deleteTransaction, newTransactionId, isSubmitting,
      wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney,
      reconciliations, reconcileWallet, getWalletReconciliations,
      bills, addBill, updateBill, removeBill, toggleBillActive, markBillPaid,
      localRules, inbox, pendingInboxCount, addLocalRule, updateLocalRule, removeLocalRule, toggleLocalRuleActive,
      addInboxItem, updateInboxItemStatus, removeInboxItem, matchDescriptionToRule, evaluateAndQueueTransaction,
      monthlyCloses, executePreClosingChecklistCallback, compileMonthlySummaryCallback, closeMonthCallback, reopenMonthCallback, isMonthClosedCallback, getMonthlyCloseRecordCallback,
      debts, netWorthSummary, addDebt, updateDebt, removeDebt, payDebt, getDebt,
      monthlyBudget, setMonthlyBudget,
      customPayments, customCategories, hiddenPaymentIds, hiddenCategoryIds, addCustomPayment, updateCustomPayment, removeCustomPayment,
      restoreHiddenPayment, addCustomCategory, updateCustomCategory, removeCustomCategory, restoreHiddenCategory, parserExtras,
      zenMode, themeMode, toggleZen, setThemeMode, toast, showToast, dismissToast,
    ]
  )

  const content = !canMutateState(storageStatus) && loadResultRef.current ? (
    <StorageRecoveryScreen loadResult={loadResultRef.current} />
  ) : (
    children
  )

  return (
    <AuthContext.Provider value={authValue}>
      <TransactionDataContext.Provider value={transactionDataValue}>
        <TransactionActionsContext.Provider value={transactionActionsValue}>
          <TransactionStatusContext.Provider value={transactionStatusValue}>
            <WalletContext.Provider value={walletValue}>
              <ReconciliationContext.Provider value={reconciliationValue}>
                <BillContext.Provider value={billValue}>
                  <RuleInboxContext.Provider value={ruleInboxValue}>
                    <MonthlyCloseContext.Provider value={monthlyCloseValue}>
                      <NetWorthContext.Provider value={netWorthValue}>
                        <BudgetContext.Provider value={budgetValue}>
                          <CustomizationContext.Provider value={customizationValue}>
                            <PreferenceContext.Provider value={preferenceValue}>
                              <FeedbackContext.Provider value={feedbackValue}>
                                <StoreContext.Provider value={value}>{content}</StoreContext.Provider>
                              </FeedbackContext.Provider>
                            </PreferenceContext.Provider>
                          </CustomizationContext.Provider>
                        </BudgetContext.Provider>
                      </NetWorthContext.Provider>
                    </MonthlyCloseContext.Provider>
                  </RuleInboxContext.Provider>
                </BillContext.Provider>
              </ReconciliationContext.Provider>
            </WalletContext.Provider>
          </TransactionStatusContext.Provider>
        </TransactionActionsContext.Provider>
      </TransactionDataContext.Provider>
    </AuthContext.Provider>
  )
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

function useRequiredContext<T>(context: Context<T | null>, name: string): T {
  const ctx = useContext(context)
  if (!ctx) throw new Error(`${name} must be used within StoreProvider`)
  return ctx
}

export function useAuthStore(): AuthStore {
  return useRequiredContext(AuthContext, 'useAuthStore')
}

export function useTransactionData(): TransactionDataStore {
  return useRequiredContext(TransactionDataContext, 'useTransactionData')
}

export function useTransactionActions(): TransactionActionsStore {
  return useRequiredContext(TransactionActionsContext, 'useTransactionActions')
}

export function useTransactionStatus(): TransactionStatusStore {
  return useRequiredContext(TransactionStatusContext, 'useTransactionStatus')
}

export function useWalletStore(): WalletStore {
  return useRequiredContext(WalletContext, 'useWalletStore')
}

export function useReconciliationStore(): ReconciliationStore {
  return useRequiredContext(ReconciliationContext, 'useReconciliationStore')
}

export function useBillStore(): BillStore {
  return useRequiredContext(BillContext, 'useBillStore')
}

export function useRuleInboxStore(): RuleInboxStore {
  return useRequiredContext(RuleInboxContext, 'useRuleInboxStore')
}

export function useMonthlyCloseStore(): MonthlyCloseStore {
  return useRequiredContext(MonthlyCloseContext, 'useMonthlyCloseStore')
}

export function useNetWorthStore(): NetWorthStore {
  return useRequiredContext(NetWorthContext, 'useNetWorthStore')
}

export function useBudgetStore(): BudgetStore {
  return useRequiredContext(BudgetContext, 'useBudgetStore')
}

export function useCustomizationStore(): CustomizationStore {
  return useRequiredContext(CustomizationContext, 'useCustomizationStore')
}

export function usePreferenceStore(): PreferenceStore {
  return useRequiredContext(PreferenceContext, 'usePreferenceStore')
}

export function useFeedbackStore(): FeedbackStore {
  return useRequiredContext(FeedbackContext, 'useFeedbackStore')
}
