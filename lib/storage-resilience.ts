/**
 * SakuKilat — Storage Engine Resilience & Atomic Persistence
 * ---------------------------------------------------------
 * Two-phase atomic write (write-then-replace pattern) to prevent
 * partial corruption and dispatch error events on storage failures.
 */

export const STORAGE_ERROR_EVENT = 'sakukilat:storage-error'

export interface StorageErrorDetail {
  message: string
  isQuota: boolean
}

export function persistStateAtomic(
  stateData: unknown,
  storageKey: string = 'sakukilat:v2:local-state'
): { success: boolean; error?: string } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { success: false, error: 'localStorage is unavailable' }
  }

  const storage = window.localStorage
  const tempKey = `${storageKey}_temp`

  try {
    const serialized = JSON.stringify(stateData)

    // 1. Write to temporary storage key first
    storage.setItem(tempKey, serialized)

    // 2. Verify temporary key read integrity
    const verified = storage.getItem(tempKey)
    if (!verified || verified.length !== serialized.length) {
      throw new Error('Verifikasi penulisan penyimpanan sementara gagal.')
    }

    // 3. Atomically overwrite primary key
    storage.setItem(storageKey, serialized)

    // 4. Clean up temporary key
    storage.removeItem(tempKey)

    return { success: true }
  } catch (err: any) {
    // Attempt cleaning up temp key on error
    try {
      storage.removeItem(tempKey)
    } catch {
      // Ignore cleanup error
    }

    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.number === -2147024882 ||
      (typeof err?.message === 'string' && err.message.toLowerCase().includes('quota'))

    const message = isQuota
      ? 'Memori penyimpanan perangkat penuh. Segera lakukan pencadangan data!'
      : `Gagal menyimpan data lokal: ${err?.message || 'Unknown storage error'}`

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<StorageErrorDetail>(STORAGE_ERROR_EVENT, {
          detail: { message, isQuota },
        })
      )
    }

    return { success: false, error: message }
  }
}
