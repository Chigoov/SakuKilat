/**
 * SakuKilat — Production Data Portability & Transactional Restore Helper
 * Centralizes import validation, planning, multi-key checkpointing, and atomic rollback.
 */

import {
  parseDelimitedToRecords,
  validateCsvHeaders,
  parseCsvAmount,
  parseCsvDate,
  parseCsvType,
} from './csv-parser.ts'
import { deduplicateTransactions } from './dedup.ts'

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
  duplicateCount?: number
  internalDuplicateCount?: number
  invalidCount?: number
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

export interface ImportExecutionResult {
  success: boolean
  error?: string
  noNewTransactions?: boolean
  addedCount?: number
  duplicateCount?: number
  internalDuplicateCount?: number
  message?: string
  rollbackAttempted?: boolean
  rollbackSucceeded?: boolean
}

/**
 * Validates an individual transaction record in a backup.
 */
export function validateTransactionRecord(tx: unknown, index: number): { valid: boolean; error?: string } {
  if (!tx || typeof tx !== 'object') {
    return { valid: false, error: `Transaksi pada indeks ${index} bukan objek valid` }
  }

  const record = tx as Record<string, any>

  if (!record.id || typeof record.id !== 'string' || record.id.trim() === '') {
    return { valid: false, error: `Transaksi pada indeks ${index} tidak memiliki ID yang valid` }
  }

  if (typeof record.amount !== 'number' || !Number.isFinite(record.amount) || record.amount <= 0) {
    return { valid: false, error: `Transaksi ${record.id} memiliki nominal tidak valid (${record.amount})` }
  }

  if (record.type !== 'income' && record.type !== 'expense') {
    return { valid: false, error: `Transaksi ${record.id} memiliki tipe tidak valid: "${record.type}"` }
  }

  if (!record.date) {
    return { valid: false, error: `Transaksi ${record.id} tidak memiliki tanggal` }
  }

  const parsedDate = new Date(record.date)
  if (Number.isNaN(parsedDate.getTime())) {
    return { valid: false, error: `Transaksi ${record.id} memiliki tanggal tidak valid: "${record.date}"` }
  }

  return { valid: true }
}

/**
 * Plans and thoroughly validates an import before writing to storage.
 */
export function planImport(rawText: string, storage: StorageLike, options: { isCsv?: boolean } = {}): ImportPlanResult {
  const currentRaw = storage.getItem(STORAGE_KEY)
  let currentTxCount = 0
  let currentTxs: any[] = []
  if (currentRaw) {
    try {
      const cur = JSON.parse(currentRaw)
      if (Array.isArray(cur.transactions)) {
        currentTxCount = cur.transactions.length
        currentTxs = cur.transactions
      }
    } catch {}
  }

  // Handle explicit CSV mode or plain CSV text
  if (options.isCsv || (!rawText.trim().startsWith('{') && !rawText.trim().startsWith('['))) {
    const { headers, records, errors } = parseDelimitedToRecords(rawText)
    if (errors.length > 0) {
      return { valid: false, error: errors[0], details: errors }
    }
    if (records.length === 0) {
      return { valid: false, error: 'File CSV kosong atau hanya berisi header.' }
    }

    const headerCheck = validateCsvHeaders(headers)
    if (!headerCheck.valid) {
      return { valid: false, error: headerCheck.error! }
    }

    const parsedCsvTxs: any[] = []
    const csvErrors: string[] = []

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const rowNum = i + 2 // 1-indexed row number (header is row 1)

      const dateVal = rec['tanggal'] || rec['date'] || rec['Tanggal'] || rec['Date'] || ''
      const typeVal = rec['tipe'] || rec['type'] || rec['Tipe'] || rec['Type'] || rec['jenis'] || rec['Jenis'] || ''
      const descVal = rec['deskripsi'] || rec['description'] || rec['Deskripsi'] || rec['Description'] || rec['keterangan'] || rec['Keterangan'] || 'Impor CSV'
      const amountVal = rec['nominal'] || rec['amount'] || rec['Nominal'] || rec['Amount'] || rec['jumlah'] || rec['Jumlah'] || ''
      const categoryVal = rec['kategori'] || rec['category'] || rec['Kategori'] || rec['Category'] || 'lainnya'
      const paymentVal = rec['metode'] || rec['payment'] || rec['Metode'] || rec['Payment'] || rec['pembayaran'] || rec['dompet'] || 'tunai'

      // Parse amount strictly — no silent fallback
      const amountParsed = parseCsvAmount(amountVal)
      if (amountParsed.value === null) {
        csvErrors.push(`Baris ${rowNum}: ${amountParsed.error}`)
      }

      // Parse date strictly — no defaulting to now
      const dateParsed = parseCsvDate(dateVal)
      if (dateParsed.value === null) {
        csvErrors.push(`Baris ${rowNum}: ${dateParsed.error}`)
      }

      // Parse type strictly — no defaulting to expense
      const typeParsed = parseCsvType(typeVal)
      if (typeParsed.value === null) {
        csvErrors.push(`Baris ${rowNum}: ${typeParsed.error}`)
      }

      if (amountParsed.value !== null && dateParsed.value !== null && typeParsed.value !== null) {
        parsedCsvTxs.push({
          id: `csv-${Date.now()}-${i}`,
          amount: amountParsed.value,
          type: typeParsed.value,
          date: dateParsed.value,
          description: descVal.trim() || 'Impor CSV',
          category: categoryVal.trim().toLowerCase() || 'lainnya',
          paymentMethod: paymentVal.trim().toLowerCase() || 'tunai',
        })
      }
    }

    // Strict policy: Reject entire file if any row is invalid
    if (csvErrors.length > 0) {
      return {
        valid: false,
        error: `File CSV tidak dapat diimpor karena terdapat ${csvErrors.length} kesalahan validasi.`,
        details: csvErrors,
      }
    }

    if (parsedCsvTxs.length === 0) {
      return {
        valid: false,
        error: 'Tidak ada baris transaksi yang valid di file CSV.',
      }
    }

    // Run deduplication against existing transactions and internal duplicates
    const dedup = deduplicateTransactions(parsedCsvTxs, currentTxs)
    const newCount = dedup.unique.length
    const dupCount = dedup.duplicateCount
    const internalDupCount = dedup.internalDuplicateCount

    let summaryText = ''
    if (newCount === 0) {
      summaryText = `Semua ${parsedCsvTxs.length} transaksi dalam CSV sudah ada di sistem (seluruhnya duplikat). Tidak ada transaksi baru yang akan ditambahkan.`
    } else {
      const dupInfo = (dupCount + internalDupCount) > 0
        ? ` (${dupCount + internalDupCount} transaksi duplikat dilewati).`
        : '.'
      summaryText = `${newCount} transaksi baru akan digabungkan ke data yang ada${dupInfo}`
    }

    return {
      valid: true,
      isSakuKilatBackup: false,
      mode: 'merge',
      transactions: parsedCsvTxs,
      currentTransactionCount: currentTxCount,
      newTransactionCount: newCount,
      duplicateCount: dupCount,
      internalDuplicateCount: internalDupCount,
      invalidCount: 0,
      dateRange: {},
      affectedKeys: [STORAGE_KEY],
      hasGoals: false,
      summary: summaryText,
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { valid: false, error: 'File bukan JSON yang valid' }
  }

  const isSakuKilatBackup = parsed?.app === 'SakuKilat' || (
    typeof parsed?.schemaVersion === 'number' &&
    parsed.schemaVersion <= CURRENT_SCHEMA_VERSION &&
    Array.isArray(parsed?.transactions)
  )

  // 1. Schema version check
  if (parsed?.schemaVersion !== undefined) {
    if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        valid: false,
        error: `Versi skema backup (${parsed.schemaVersion}) lebih baru dari versi yang didukung (${CURRENT_SCHEMA_VERSION}). Harap perbarui aplikasi terlebih dahulu.`,
      }
    }
  }

  // 2. Transactions array presence check
  if (!Array.isArray(parsed?.transactions)) {
    return { valid: false, error: 'Backup tidak valid: data transaksi tidak ditemukan (bukan array).' }
  }

  // 3. Transactions array non-empty check
  if (parsed.transactions.length === 0) {
    return { valid: false, error: 'Backup tidak berisi transaksi (array kosong).' }
  }

  // 4. Validate every single transaction record (NO silent dropping!)
  const seenIds = new Set<string>()
  const rows = parsed.transactions
  let earliestDate: Date | null = null
  let latestDate: Date | null = null

  for (let i = 0; i < rows.length; i++) {
    const tx = rows[i]
    const check = validateTransactionRecord(tx, i)
    if (!check.valid) {
      return { valid: false, error: check.error! }
    }

    if (seenIds.has(tx.id)) {
      return { valid: false, error: `Terdapat ID transaksi duplikat dalam backup: "${tx.id}"` }
    }
    seenIds.add(tx.id)

    const d = new Date(tx.date)
    if (!earliestDate || d < earliestDate) earliestDate = d
    if (!latestDate || d > latestDate) latestDate = d
  }

  // 5. Validate goals array if present
  if (parsed.goals !== undefined && !Array.isArray(parsed.goals)) {
    return { valid: false, error: 'Field "goals" dalam backup harus berbentuk array' }
  }

  // 6. Validate wallets array if present
  if (parsed.wallets !== undefined && !Array.isArray(parsed.wallets)) {
    return { valid: false, error: 'Field "wallets" dalam backup harus berbentuk array' }
  }

  const affectedKeys = [STORAGE_KEY]
  if (Array.isArray(parsed.goals)) {
    affectedKeys.push(GOAL_STORAGE_KEY)
  }

  const mode = isSakuKilatBackup ? 'replace' : 'merge'
  let newTransactionCount = rows.length
  let duplicateCount = 0
  let internalDuplicateCount = 0

  if (mode === 'merge') {
    const dedup = deduplicateTransactions(rows, currentTxs)
    newTransactionCount = dedup.unique.length
    duplicateCount = dedup.duplicateCount
    internalDuplicateCount = dedup.internalDuplicateCount
  }

  const summary = isSakuKilatBackup
    ? `${rows.length} transaksi akan menggantikan ${currentTxCount} transaksi saat ini.`
    : newTransactionCount === 0
      ? `Semua ${rows.length} transaksi dalam berkas sudah ada di sistem (seluruhnya duplikat). Tidak ada transaksi baru yang akan ditambahkan.`
      : `${newTransactionCount} transaksi baru akan digabungkan ke data yang ada.${(duplicateCount + internalDuplicateCount) > 0 ? ` (${duplicateCount + internalDuplicateCount} duplikat dilewati).` : ''}`

  return {
    valid: true,
    isSakuKilatBackup: Boolean(isSakuKilatBackup),
    mode,
    transactions: rows,
    rawBackup: parsed,
    currentTransactionCount: currentTxCount,
    newTransactionCount,
    duplicateCount,
    internalDuplicateCount,
    dateRange: {
      start: earliestDate ? earliestDate.toISOString() : undefined,
      end: latestDate ? latestDate.toISOString() : undefined,
    },
    affectedKeys,
    hasGoals: Array.isArray(parsed.goals),
    goals: parsed.goals,
    summary,
  }
}

/**
 * Creates a multi-key checkpoint covering primary state and goals before modification.
 */
export function createMultiKeyCheckpoint(storage: StorageLike, keys: string[]): { success: boolean; error?: string } {
  try {
    const snapshot: Record<string, string | null> = {}
    for (const k of keys) {
      snapshot[k] = storage.getItem(k)
    }
    const serialized = JSON.stringify(snapshot)
    storage.setItem(CHECKPOINT_KEY, serialized)
    // Also save legacy primary checkpoint for compatibility
    if (snapshot[STORAGE_KEY]) {
      storage.setItem(`${CHECKPOINT_KEY}:primary`, snapshot[STORAGE_KEY]!)
    }
    if (snapshot[GOAL_STORAGE_KEY]) {
      storage.setItem(GOAL_CHECKPOINT_KEY, snapshot[GOAL_STORAGE_KEY]!)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: 'Gagal membuat checkpoint sebelum impor (penyimpanan penuh).' }
  }
}

/**
 * Executes the import plan as one atomic logical transaction with automatic multi-key rollback on failure.
 */
export function executeImportTransaction(
  storage: StorageLike,
  plan: ImportPlanSuccess,
  options: { confirmed?: boolean } = {}
): ImportExecutionResult {
  // Explicit confirmation required for replace mode
  if (plan.mode === 'replace' && options.confirmed !== true) {
    return { success: false, error: 'Konfirmasi eksplisit diperlukan sebelum mengganti seluruh data.' }
  }

  const currentRaw = storage.getItem(STORAGE_KEY)
  const currentObj = currentRaw ? JSON.parse(currentRaw) : {}
  const currentTxs = Array.isArray(currentObj.transactions) ? currentObj.transactions : []

  let finalTxs: any[] = []
  let addedCount = 0
  let duplicateCount = 0
  let internalDuplicateCount = 0

  if (plan.mode === 'replace') {
    // Official backup replace mode: keep all transactions without merge dedup
    finalTxs = plan.transactions
    addedCount = finalTxs.length
  } else {
    // Merge mode: apply deduplication against existing and internal set
    const dedup = deduplicateTransactions(plan.transactions, currentTxs)
    duplicateCount = dedup.duplicateCount
    internalDuplicateCount = dedup.internalDuplicateCount
    addedCount = dedup.unique.length

    // If all transactions are duplicates, do not rewrite storage
    if (dedup.unique.length === 0) {
      return {
        success: true,
        noNewTransactions: true,
        addedCount: 0,
        duplicateCount,
        internalDuplicateCount,
        message: 'Tidak ada transaksi baru yang ditambahkan (seluruh transaksi sudah ada atau duplikat).',
      }
    }

    finalTxs = [...dedup.unique, ...currentTxs]
  }

  // Create checkpoint of all affected keys
  const checkpointResult = createMultiKeyCheckpoint(storage, plan.affectedKeys)
  if (!checkpointResult.success) {
    return { success: false, error: checkpointResult.error }
  }

  const newStatePayload = JSON.stringify({
    ...currentObj,
    ...(plan.mode === 'replace' ? (plan.rawBackup || {}) : {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: finalTxs,
  })

  // 1. Write primary state
  try {
    storage.setItem(STORAGE_KEY, newStatePayload)
    if (storage.getItem(STORAGE_KEY) !== newStatePayload) {
      throw new Error('Verifikasi penyimpanan data utama gagal')
    }
  } catch (error) {
    const rollback = executeRollback(storage)
    return {
      success: false,
      error: rollback.success
        ? 'Gagal menulis data utama. Data dipulihkan ke kondisi semula.'
        : 'PERINGATAN: Gagal menulis data utama DAN rollback gagal. Gunakan checkpoint untuk pemulihan manual.',
      rollbackAttempted: true,
      rollbackSucceeded: rollback.success,
    }
  }

  // 2. Write goals if part of backup
  if (plan.hasGoals && Array.isArray(plan.goals)) {
    try {
      const serializedGoals = JSON.stringify(plan.goals)
      storage.setItem(GOAL_STORAGE_KEY, serializedGoals)
      if (storage.getItem(GOAL_STORAGE_KEY) !== serializedGoals) {
        throw new Error('Verifikasi penyimpanan goals gagal')
      }
    } catch (error) {
      // GOAL WRITE FAILED: must roll back primary state too!
      const rollback = executeRollback(storage)
      return {
        success: false,
        error: rollback.success
          ? 'Gagal menulis target/goals. Seluruh data dipulihkan ke kondisi semula.'
          : 'PERINGATAN: Gagal menulis target/goals DAN rollback gagal. Gunakan checkpoint untuk pemulihan manual.',
        rollbackAttempted: true,
        rollbackSucceeded: rollback.success,
      }
    }
  }

  return {
    success: true,
    noNewTransactions: false,
    addedCount,
    duplicateCount,
    internalDuplicateCount,
  }
}

/**
 * Real production rollback function: restores all keys preserved in checkpoint.
 */
export function executeRollback(storage: StorageLike): { success: boolean; error?: string; restoredKeys: string[] } {
  const chkRaw = storage.getItem(CHECKPOINT_KEY)
  if (!chkRaw) {
    return { success: false, error: 'Tidak ada checkpoint yang tersedia untuk pemulihan.', restoredKeys: [] }
  }

  try {
    const checkpoint = JSON.parse(chkRaw)
    const restoredKeys: string[] = []

    // If multi-key dictionary format
    if (checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)) {
      for (const [key, value] of Object.entries(checkpoint)) {
        if (key === 'timestamp') continue
        if (value === null) {
          storage.removeItem(key)
        } else {
          storage.setItem(key, String(value))
        }
        restoredKeys.push(key)
      }
    } else {
      // Legacy single-string primary checkpoint
      storage.setItem(STORAGE_KEY, chkRaw)
      restoredKeys.push(STORAGE_KEY)
    }

    return { success: true, restoredKeys }
  } catch (error) {
    return { success: false, error: `Gagal membaca checkpoint: ${String(error)}`, restoredKeys: [] }
  }
}

/**
 * Checks if a valid restore rollback checkpoint is available in storage.
 */
export function canRollback(storage: StorageLike): boolean {
  return Boolean(storage.getItem(CHECKPOINT_KEY))
}
