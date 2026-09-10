/**
 * SakuKilat — Production Data Portability & Transactional Restore Helper
 * Centralizes import validation, planning, multi-key checkpointing, and atomic rollback.
 */

export const CURRENT_SCHEMA_VERSION = 8
export const STORAGE_KEY = 'sakukilat:v2:local-state'
export const GOAL_STORAGE_KEY = 'sakukilat:v2:goals'
export const CHECKPOINT_KEY = 'sakukilat:v2:import-checkpoint'
export const GOAL_CHECKPOINT_KEY = 'sakukilat:v2:goals:checkpoint'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys?(): string[]
}

export interface ImportPlanSuccess {
  valid: true
  isSakuKilatBackup: boolean
  mode: 'replace' | 'merge'
  transactions: any[]
  rawBackup?: any
  currentTransactionCount: number
  newTransactionCount: number
  dateRange: { start?: string; end?: string }
  affectedKeys: string[]
  hasGoals: boolean
  goals?: any[]
  summary?: string
}

export interface ImportPlanError {
  valid: false
  error: string
  details?: string[]
}

export type ImportPlanResult = ImportPlanSuccess | ImportPlanError

/**
 * Baseline planImport: matches the pre-fix data-portability.tsx behavior.
 * Has the known vulnerabilities:
 * - accepts loose backups (app not checked if schemaVersion matches)
 * - silently drops invalid transactions
 * - does not reject future schemas or duplicate IDs
 */
export function planImport(rawText: string, storage: StorageLike): ImportPlanResult {
  let parsed: any
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { valid: false, error: 'File bukan JSON yang valid' }
  }

  const currentRaw = storage.getItem(STORAGE_KEY)
  let currentTxCount = 0
  if (currentRaw) {
    try {
      const cur = JSON.parse(currentRaw)
      if (Array.isArray(cur.transactions)) currentTxCount = cur.transactions.length
    } catch {}
  }

  // Baseline behavior: loose check
  const isSakuKilatBackup = parsed?.app === 'SakuKilat' || parsed?.schemaVersion === CURRENT_SCHEMA_VERSION

  if (isSakuKilatBackup && !Array.isArray(parsed?.transactions)) {
    return { valid: false, error: 'Backup tidak valid: data transaksi tidak ditemukan.' }
  }

  const rows = Array.isArray(parsed?.transactions) ? parsed.transactions : []
  // Baseline bug: silently drops invalid rows instead of rejecting
  const validRows = rows.filter((r: any) => r && typeof r === 'object' && r.id && typeof r.amount === 'number')

  if (validRows.length === 0) {
    return { valid: false, error: 'Tidak ada transaksi yang valid' }
  }

  return {
    valid: true,
    isSakuKilatBackup,
    mode: isSakuKilatBackup ? 'replace' : 'merge',
    transactions: validRows,
    rawBackup: parsed,
    currentTransactionCount: currentTxCount,
    newTransactionCount: validRows.length,
    dateRange: {},
    affectedKeys: [STORAGE_KEY],
    hasGoals: Array.isArray(parsed?.goals),
    goals: parsed?.goals,
  }
}

/**
 * Baseline executeImportTransaction:
 * - Only checkpoints primary storage
 * - Does not require explicit confirmation for replace
 * - Does not rollback primary if goal write fails
 */
export function executeImportTransaction(
  storage: StorageLike,
  plan: ImportPlanSuccess,
  options: { confirmed?: boolean } = {}
): { success: boolean; error?: string; rollbackAttempted?: boolean; rollbackSucceeded?: boolean } {
  // Baseline: does NOT check options.confirmed!
  const currentRaw = storage.getItem(STORAGE_KEY)
  if (currentRaw) {
    try {
      storage.setItem(CHECKPOINT_KEY, currentRaw) // Only primary checkpointed!
    } catch {
      return { success: false, error: 'Gagal membuat checkpoint' }
    }
  }

  const newState = JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: plan.transactions,
    ...(plan.rawBackup || {}),
  })

  storage.setItem(STORAGE_KEY, newState)

  // Verification
  if (storage.getItem(STORAGE_KEY) !== newState) {
    if (currentRaw) storage.setItem(STORAGE_KEY, currentRaw)
    return { success: false, error: 'Write verification failed', rollbackAttempted: true, rollbackSucceeded: true }
  }

  // If goals present: write goals
  if (plan.hasGoals && Array.isArray(plan.goals)) {
    try {
      storage.setItem(GOAL_STORAGE_KEY, JSON.stringify(plan.goals))
    } catch {
      // Baseline bug: goals write failed, but primary state was NOT rolled back!
      return { success: false, error: 'Gagal menulis goals', rollbackAttempted: false }
    }
  }

  return { success: true }
}

/** Baseline rollback: only restores primary storage */
export function executeRollback(storage: StorageLike): { success: boolean; error?: string; restoredKeys: string[] } {
  const chk = storage.getItem(CHECKPOINT_KEY)
  if (!chk) return { success: false, error: 'Tidak ada checkpoint', restoredKeys: [] }
  storage.setItem(STORAGE_KEY, chk)
  return { success: true, restoredKeys: [STORAGE_KEY] }
}
