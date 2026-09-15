/**
 * SakuKilat — Production Storage & Recovery Helper
 * Centralizes persistence, structural validation, and corrupt-state recovery.
 */

import { validatePersistedStateSchema, type PersistedNotificationPreferences } from './schema-validator.ts'
import { persistStateAtomic } from './storage-resilience.ts'

export { validatePersistedStateSchema, persistStateAtomic }
export type { PersistedNotificationPreferences }

export const CURRENT_SCHEMA_VERSION = 8
export const STORAGE_KEY = 'sakukilat:v2:local-state'
export const CHECKPOINT_KEY = 'sakukilat:v2:import-checkpoint'
export const GOAL_STORAGE_KEY = 'sakukilat:v2:goals'
export const RECURRING_STORAGE_KEY = 'sakukilat:v2:recurring'
export const RECONCILIATION_STORAGE_KEY = 'sakukilat:v2:reconciliations'
export const RULES_STORAGE_KEY = 'sakukilat:v2:rules'
export const INBOX_STORAGE_KEY = 'sakukilat:v2:inbox'
export const MONTHLY_CLOSE_STORAGE_KEY = 'sakukilat:v2:monthly-closes'
export const DEBT_STORAGE_KEY = 'sakukilat:v2:debts'
export const QUARANTINE_KEY_PREFIX = `${STORAGE_KEY}:quarantine:`

/**
 * Legacy & variant fallback storage keys to preserve backward compatibility
 * across app upgrades, variant testing, or earlier releases.
 */
export const STORAGE_KEY_FALLBACKS = [
  'sakukilat-user:v2:local-state',
  'sakukilat:local-state',
  'sakukilat:v1:local-state',
] as const

export const GOAL_STORAGE_KEY_FALLBACKS = [
  'sakukilat-user:v2:goals',
  'sakukilat:goals',
] as const

export const RECURRING_STORAGE_KEY_FALLBACKS = [
  'sakukilat-user:v2:recurring',
  'sakukilat:recurring',
] as const

export const KNOWN_STORAGE_KEYS = new Set<string>([
  STORAGE_KEY,
  CHECKPOINT_KEY,
  GOAL_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  RECONCILIATION_STORAGE_KEY,
  RULES_STORAGE_KEY,
  INBOX_STORAGE_KEY,
  MONTHLY_CLOSE_STORAGE_KEY,
  DEBT_STORAGE_KEY,
  'sakukilat:v2:goals:checkpoint',
  'sakukilat:v2:budget-set',
  'sakukilat:v2:ach-budget-up',
  'sakukilat:v2:achievements',
  'sakukilat:v2:app-lock',
  'sakukilat:v2:lock-pin-hash',
  'sakukilat:v2:lock-pin-salt',
  'sakukilat:v2:lock-biometric-enabled',
  'sakukilat:v2:notification-settings',
  'sakukilat:v2:celebrated-goals',
  'sakukilat:v2:celebrated-streak',
  'sakukilat:v2:onboarding-completed',
  ...STORAGE_KEY_FALLBACKS,
  ...GOAL_STORAGE_KEY_FALLBACKS,
  ...RECURRING_STORAGE_KEY_FALLBACKS,
  'sakukilat-user:v2:app-lock',
  'sakukilat:app-lock',
])

export const ONBOARDING_STORAGE_KEY_PREFIX = 'sakukilat:v2:onboarding-completed-v'
export const ONBOARDING_STORAGE_KEY_PREFIXES = [
  'sakukilat:v2:onboarding-completed-v',
  'sakukilat:v2:onboarding-completed',
  'sakukilat:onboarding:',
] as const

export const PRESERVED_KEY_PREFIXES = [
  'sakukilat:v2:onboarding-completed',
  'sakukilat:v2:onboarding-completed-v',
  'sakukilat:onboarding:',
  'sakukilat:v2:local-state:quarantine:',
  'sakukilat:v2:import-checkpoint',
  'sakukilat:v2:goals:checkpoint',
  'sakukilat:v2:goals',
  'sakukilat:v2:recurring',
  'sakukilat:v2:reconciliations',
  'sakukilat:v2:rules',
  'sakukilat:v2:inbox',
  'sakukilat:v2:monthly-closes',
  'sakukilat:v2:debts',
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
  'sakukilat-user:v2:',
  'sakukilat-owner:',
  'sakukilat:local-state',
  'sakukilat:v1:',
]

export type StorageStatus = 'valid' | 'missing' | 'corrupt' | 'incompatible'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys?(): string[]
  length?: number
  key?(index: number): string | null
}

export interface LoadResult {
  status: StorageStatus
  state: Record<string, any>
  quarantinedRaw?: string
  quarantineKey?: string
  quarantineFailed?: boolean
  error?: string
  detectedVersion?: number
  /** Raw payload string preserved for incompatible states (export/download) */
  incompatibleRaw?: string
}

function getStorage(custom?: StorageLike): StorageLike | null {
  if (custom) return custom
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

/**
 * Validates that the parsed state has an acceptable structure.
 * Rejects JSON arrays, primitives, null, or corrupted field types.
 */
export function validatePersistedStateStructure(parsed: unknown): { valid: boolean; error?: string } {
  if (parsed === null || typeof parsed !== 'object') {
    return { valid: false, error: 'Parsed value is null or not an object' }
  }

  if (Array.isArray(parsed)) {
    return { valid: false, error: 'Parsed value is an array, expected state record object' }
  }

  const record = parsed as Record<string, unknown>

  if (record.transactions !== undefined && !Array.isArray(record.transactions)) {
    return { valid: false, error: 'Field "transactions" must be an array' }
  }

  if (record.wallets !== undefined && !Array.isArray(record.wallets)) {
    return { valid: false, error: 'Field "wallets" must be an array' }
  }

  if (record.monthlyBudget !== undefined && (typeof record.monthlyBudget !== 'number' || Number.isNaN(record.monthlyBudget))) {
    return { valid: false, error: 'Field "monthlyBudget" must be a valid number' }
  }

  if (record.customPayments !== undefined && !Array.isArray(record.customPayments)) {
    return { valid: false, error: 'Field "customPayments" must be an array' }
  }

  if (record.customCategories !== undefined && !Array.isArray(record.customCategories)) {
    return { valid: false, error: 'Field "customCategories" must be an array' }
  }

  if (record.hiddenPaymentIds !== undefined && !Array.isArray(record.hiddenPaymentIds)) {
    return { valid: false, error: 'Field "hiddenPaymentIds" must be an array' }
  }

  if (record.hiddenCategoryIds !== undefined && !Array.isArray(record.hiddenCategoryIds)) {
    return { valid: false, error: 'Field "hiddenCategoryIds" must be an array' }
  }

  if (record.bills !== undefined && !Array.isArray(record.bills)) {
    return { valid: false, error: 'Field "bills" must be an array' }
  }

  if (record.reconciliations !== undefined && !Array.isArray(record.reconciliations)) {
    return { valid: false, error: 'Field "reconciliations" must be an array' }
  }

  if (record.localRules !== undefined && !Array.isArray(record.localRules)) {
    return { valid: false, error: 'Field "localRules" must be an array' }
  }

  if (record.inbox !== undefined && !Array.isArray(record.inbox)) {
    return { valid: false, error: 'Field "inbox" must be an array' }
  }

  if (record.monthlyCloses !== undefined && !Array.isArray(record.monthlyCloses)) {
    return { valid: false, error: 'Field "monthlyCloses" must be an array' }
  }

  if (record.debts !== undefined && !Array.isArray(record.debts)) {
    return { valid: false, error: 'Field "debts" must be an array' }
  }

  return { valid: true }
}

/**
 * Attempts to save corrupt raw payload to a timestamped quarantine key.
 * If storage quota is exceeded, returns { success: false } without throwing,
 * and leaves the primary raw data untouched.
 */
export function quarantineCorrupt(storage: StorageLike, raw: string): { success: boolean; quarantineKey?: string } {
  try {
    const quarantineKey = `${QUARANTINE_KEY_PREFIX}${Date.now()}`
    storage.setItem(quarantineKey, raw)
    return { success: true, quarantineKey }
  } catch (error) {
    // Best effort — storage might be full.
    // Primary corrupt data in STORAGE_KEY is preserved regardless.
    return { success: false }
  }
}

/**
 * Cleans up stale legacy storage keys, preserving known keys and quarantine records.
 */
export function cleanupStaleStorageKeys(storage: StorageLike): void {
  try {
    const length = storage.length ?? (storage.keys ? storage.keys().length : 0)
    for (let i = length - 1; i >= 0; i -= 1) {
      const key = storage.key ? storage.key(i) : (storage.keys ? storage.keys()[i] : null)
      if (!key || !key.startsWith('sakukilat:')) continue
      if (
        KNOWN_STORAGE_KEYS.has(key) ||
        key.startsWith(ONBOARDING_STORAGE_KEY_PREFIX) ||
        key.startsWith('sakukilat:onboarding:') ||
        key.startsWith('sakukilat:v2:onboarding-completed')
      ) continue
      if (PRESERVED_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) continue
      if (key.includes(':quarantine:')) continue
      storage.removeItem(key)
    }
  } catch {
    // Non-critical cleanup failure
  }
}

/**
 * Loads and validates persisted state from storage.
 * Distinguishes missing, valid, corrupt, and incompatible states.
 */
export function loadPersistedState(customStorage?: StorageLike): LoadResult {
  const storage = getStorage(customStorage)
  if (!storage) return { status: 'missing', state: {} }

  // NOTE: cleanupStaleStorageKeys is NOT called here.
  // Callers must invoke it explicitly only after status is confirmed as 'valid' or 'missing',
  // to avoid deleting unknown keys that belong to a newer schema version.

  let raw = storage.getItem(STORAGE_KEY)
  let loadedFromFallback = false

  if (raw === null || raw === undefined) {
    for (const fallbackKey of STORAGE_KEY_FALLBACKS) {
      const fallbackVal = storage.getItem(fallbackKey)
      if (fallbackVal !== null && fallbackVal !== undefined && fallbackVal !== '') {
        raw = fallbackVal
        loadedFromFallback = true
        break
      }
    }
  }

  if (raw === null || raw === undefined) {
    return { status: 'missing', state: {} }
  }

  if (raw === '') {
    const quarantine = quarantineCorrupt(storage, raw)
    return {
      status: 'corrupt',
      state: {},
      quarantinedRaw: raw,
      quarantineKey: quarantine.quarantineKey,
      quarantineFailed: !quarantine.success,
      error: 'Empty storage value',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const quarantine = quarantineCorrupt(storage, raw)
    return {
      status: 'corrupt',
      state: {},
      quarantinedRaw: raw,
      quarantineKey: quarantine.quarantineKey,
      quarantineFailed: !quarantine.success,
      error: String(error),
    }
  }

  const validation = validatePersistedStateStructure(parsed)
  if (!validation.valid) {
    const quarantine = quarantineCorrupt(storage, raw)
    return {
      status: 'corrupt',
      state: {},
      quarantinedRaw: raw,
      quarantineKey: quarantine.quarantineKey,
      quarantineFailed: !quarantine.success,
      error: validation.error,
    }
  }

  // Deep schema validation and malformed node pruning (Task 3.14)
  const deepValidation = validatePersistedStateSchema(parsed)
  const parsedData = (deepValidation.isValid && deepValidation.sanitizedState ? deepValidation.sanitizedState : parsed) as Record<string, any>

  const record = parsedData
  if (typeof record.schemaVersion === 'number' && record.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      status: 'incompatible',
      state: record,
      detectedVersion: record.schemaVersion,
      incompatibleRaw: raw,
    }
  }

  if (loadedFromFallback) {
    try {
      storage.setItem(STORAGE_KEY, raw)
    } catch {
      // Best effort migration
    }
  }

  return { status: 'valid', state: record }
}

/**
 * Loads goals payload from storage, seamlessly checking fallback keys if primary is missing.
 */
export function loadGoalsFromStorage(storage: StorageLike): string | null {
  const primary = storage.getItem(GOAL_STORAGE_KEY)
  if (primary !== null && primary !== undefined) return primary
  for (const fallback of GOAL_STORAGE_KEY_FALLBACKS) {
    const val = storage.getItem(fallback)
    if (val !== null && val !== undefined) {
      try { storage.setItem(GOAL_STORAGE_KEY, val) } catch {}
      return val
    }
  }
  return null
}

/**
 * Loads recurring templates payload from storage, seamlessly checking fallback keys if primary is missing.
 */
export function loadRecurringFromStorage(storage: StorageLike): string | null {
  const primary = storage.getItem(RECURRING_STORAGE_KEY)
  if (primary !== null && primary !== undefined) return primary
  for (const fallback of RECURRING_STORAGE_KEY_FALLBACKS) {
    const val = storage.getItem(fallback)
    if (val !== null && val !== undefined) {
      try { storage.setItem(RECURRING_STORAGE_KEY, val) } catch {}
      return val
    }
  }
  return null
}

/**
 * Loads reconciliation audit records from storage.
 */
export function loadReconciliationsFromStorage(storage: StorageLike): string | null {
  return storage.getItem(RECONCILIATION_STORAGE_KEY)
}

/**
 * Loads monthly close audit records from storage.
 */
export function loadMonthlyClosesFromStorage(storage: StorageLike): string | null {
  return storage.getItem(MONTHLY_CLOSE_STORAGE_KEY)
}

/**
 * Loads debt records from storage.
 */
export function loadDebtsFromStorage(storage: StorageLike): string | null {
  return storage.getItem(DEBT_STORAGE_KEY)
}

/**
 * Serializes a transaction Date or date-like value to an ISO-like calendar string
 * (format "YYYY-MM-DDTHH:mm:ss") without converting to UTC, ensuring the exact
 * calendar day, hour, and minute are preserved across devices, timezones, reloads,
 * and restarts.
 */
export function serializeTransactionDate(dateInput: Date | string | number): string {
  let d: Date
  if (dateInput instanceof Date) {
    d = dateInput
  } else if (typeof dateInput === 'string') {
    d = deserializeTransactionDate(dateInput)
  } else if (typeof dateInput === 'number') {
    d = new Date(dateInput)
  } else {
    d = new Date()
  }

  if (Number.isNaN(d.getTime())) {
    d = new Date()
  }

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

/**
 * Deserializes a transaction date string, number, or Date instance into a local Date object.
 * Preserves the exact calendar year, month, day, hour, and minute without timezone conversion drift.
 *
 * Handles:
 * - Local calendar strings ("YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD")
 * - Legacy UTC ISO strings ending with "Z" or timezone offsets (+HH:mm / -HH:mm)
 * - Epoch timestamps and existing Date objects
 *
 * Never throws; falls back safely to current Date on invalid or unparseable input.
 */
export function deserializeTransactionDate(dateInput: unknown): Date {
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? new Date() : new Date(dateInput.getTime())
  }

  if (typeof dateInput === 'number') {
    const d = new Date(dateInput)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }

  if (typeof dateInput !== 'string' || !dateInput.trim()) {
    return new Date()
  }

  const trimmed = dateInput.trim()

  // If string contains explicit UTC ("Z") or timezone offset (+/-HH:mm),
  // parse via standard Date constructor so the point-in-time is respected
  if (/(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(trimmed)) {
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  // Parse local calendar components (YYYY-MM-DD with optional time)
  const match = trimmed.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?/
  )

  if (match) {
    const year = parseInt(match[1], 10)
    const month = parseInt(match[2], 10)
    const day = parseInt(match[3], 10)
    const hours = match[4] !== undefined ? parseInt(match[4], 10) : 0
    const minutes = match[5] !== undefined ? parseInt(match[5], 10) : 0
    const seconds = match[6] !== undefined ? parseInt(match[6], 10) : 0

    const result = new Date(year, month - 1, day, hours, minutes, seconds, 0)
    if (!Number.isNaN(result.getTime())) {
      return result
    }
  }

  const fallback = new Date(trimmed)
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback
}

/**
 * Maps a list of transaction records, ensuring all dates are serialized
 * using serializeTransactionDate to prevent UTC conversion drift.
 */
export function serializeTransactions<T extends { date?: any }>(
  transactions: T[]
): Array<Omit<T, 'date'> & { date: string }> {
  if (!Array.isArray(transactions)) return []
  return transactions.map(tx => ({
    ...tx,
    date: serializeTransactionDate(tx.date),
  }))
}

/**
 * Maps a list of persisted transaction records, reviving all dates into
 * isolated, calendar-accurate Date instances via deserializeTransactionDate.
 */
export function deserializeTransactions<T extends { date?: any }>(
  transactions: T[]
): Array<Omit<T, 'date'> & { date: Date }> {
  if (!Array.isArray(transactions)) return []
  return transactions.map(tx => ({
    ...tx,
    date: deserializeTransactionDate(tx.date),
  }))
}

/**
 * Persists application state to storage with verification.
 * Blocks writes whenever storage is in corrupt or incompatible state.
 */
export function persistState(storage: StorageLike, state: any, storageStatus: StorageStatus): boolean {
  if (storageStatus === 'corrupt' || storageStatus === 'incompatible') {
    return false // BLOCKED
  }

  try {
    let preparedState = state
    if (state && Array.isArray(state.transactions)) {
      preparedState = {
        ...state,
        transactions: state.transactions.map((t: any) => {
          if (t && t.date !== undefined) {
            return {
              ...t,
              date: typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t.date)
                ? t.date
                : serializeTransactionDate(t.date),
            }
          }
          return t
        }),
      }
    }

    const serialized = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, ...preparedState })
    storage.setItem(STORAGE_KEY, serialized)
    // Verification check
    if (storage.getItem(STORAGE_KEY) !== serialized) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sakukilat:storage-error', {
            detail: { message: 'Verifikasi penyimpanan gagal setelah penulisan.', isQuota: false },
          })
        )
      }
      return false
    }
    return true
  } catch (error: any) {
    const isQuota =
      error?.name === 'QuotaExceededError' ||
      error?.code === 22 ||
      (typeof error?.message === 'string' && error.message.toLowerCase().includes('quota'))
    const message = isQuota
      ? 'Memori penyimpanan perangkat penuh. Segera lakukan pencadangan data!'
      : `Gagal menyimpan data lokal: ${error?.message || 'Unknown storage error'}`

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('sakukilat:storage-error', {
          detail: { message, isQuota },
        })
      )
    }
    return false
  }
}

/**
 * Checks whether user state mutations (add, edit, delete, transfer, etc.) are safe to perform.
 * Must return false when storage is corrupt or incompatible to prevent silent data loss.
 */
export function canMutateState(storageStatus: StorageStatus): boolean {
  return storageStatus === 'valid' || storageStatus === 'missing'
}

/**
 * Resets corrupt state after explicit user confirmation.
 * Only allowed when storage status is 'corrupt'. Incompatible status must NOT be reset
 * because the data may be valid for a newer version of the application.
 */
export function resetCorruptState(storage: StorageLike, confirmed: boolean, storageStatus?: StorageStatus): boolean {
  if (!confirmed) return false
  // Block reset for incompatible — data belongs to a newer app version
  if (storageStatus === 'incompatible') return false
  try {
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
