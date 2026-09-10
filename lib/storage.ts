/**
 * SakuKilat — Production Storage & Recovery Helper
 * Centralizes persistence, validation, and corrupt-state recovery.
 */

export const CURRENT_SCHEMA_VERSION = 8
export const STORAGE_KEY = 'sakukilat:v2:local-state'
export const CHECKPOINT_KEY = 'sakukilat:v2:import-checkpoint'
export const GOAL_STORAGE_KEY = 'sakukilat:v2:goals'
export const QUARANTINE_KEY_PREFIX = `${STORAGE_KEY}:quarantine:`

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
}

function getStorage(custom?: StorageLike): StorageLike | null {
  if (custom) return custom
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

/** Baseline quarantine function */
export function quarantineCorrupt(storage: StorageLike, raw: string): { success: boolean; quarantineKey?: string } {
  try {
    const quarantineKey = `${QUARANTINE_KEY_PREFIX}${Date.now()}`
    storage.setItem(quarantineKey, raw)
    return { success: true, quarantineKey }
  } catch {
    return { success: false }
  }
}

/**
 * Baseline loadPersistedState matching pre-fix store.tsx behavior.
 * This baseline allows regression tests to fail first on JSON array, wrong field types, etc.
 */
export function loadPersistedState(customStorage?: StorageLike): LoadResult {
  const storage = getStorage(customStorage)
  if (!storage) return { status: 'missing', state: {} }

  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null || raw === undefined) {
    return { status: 'missing', state: {} }
  }

  if (raw === '') {
    quarantineCorrupt(storage, raw)
    return { status: 'corrupt', state: {}, quarantinedRaw: raw, error: 'Empty storage value' }
  }

  try {
    const parsed = JSON.parse(raw)
    // Baseline: weak object check that lets arrays and malformed records through
    if (!parsed || typeof parsed !== 'object') {
      quarantineCorrupt(storage, raw)
      return { status: 'corrupt', state: {}, quarantinedRaw: raw, error: 'Parsed value is not an object' }
    }

    if (parsed.schemaVersion && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        status: 'incompatible',
        state: parsed,
        detectedVersion: parsed.schemaVersion,
      }
    }

    return { status: 'valid', state: parsed }
  } catch (error) {
    quarantineCorrupt(storage, raw)
    return { status: 'corrupt', state: {}, quarantinedRaw: raw, error: String(error) }
  }
}

/** Baseline persistState */
export function persistState(storage: StorageLike, state: any, storageStatus: StorageStatus): boolean {
  if (storageStatus === 'corrupt' || storageStatus === 'incompatible') {
    return false // blocked
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, ...state }))
    return true
  } catch {
    return false
  }
}

/** Baseline mutation guard (allows mutations everywhere in baseline) */
export function canMutateState(storageStatus: StorageStatus): boolean {
  return true // baseline bug: allows mutation even when corrupt
}
