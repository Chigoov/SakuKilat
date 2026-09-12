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

export const CRITICAL_CHECKPOINT_KEYS = [
  STORAGE_KEY,
  GOAL_STORAGE_KEY,
  'sakukilat:v2:recurring',
  'sakukilat:v2:budget-set',
] as const

export type CheckpointReason = 'import' | 'restore' | 'migration' | 'bulk_operation' | 'manual'

export interface CheckpointMetadata {
  timestamp: string
  reason: CheckpointReason
  schemaVersion: number
  transactionCount: number
  goalCount: number
  recurringCount: number
  customCategoryCount: number
  hasBudget: boolean
  description?: string
}

export interface ComprehensiveCheckpointEnvelope {
  envelopeVersion: 2
  createdAt: string
  reason: CheckpointReason
  description?: string
  metadata: CheckpointMetadata
  entries: Record<string, string | null>
}

export interface CheckpointSummary {
  exists: boolean
  createdAt?: string
  reason?: CheckpointReason
  reasonLabel: string
  description?: string
  transactionCount: number
  goalCount: number
  recurringCount: number
  customCategoryCount: number
  schemaVersion: number
  isValid: boolean
  error?: string
}

export function formatReasonLabel(reason?: CheckpointReason): string {
  switch (reason) {
    case 'import':
      return 'Sebelum Impor CSV / Data'
    case 'restore':
      return 'Sebelum Pemulihan Cadangan JSON'
    case 'migration':
      return 'Sebelum Migrasi Skema'
    case 'bulk_operation':
      return 'Sebelum Operasi Massal'
    case 'manual':
      return 'Cadangan Manual Pengguna'
    default:
      return 'Cadangan Checkpoint Sistem'
  }
}

/**
 * Creates a comprehensive checkpoint covering primary state, goals, recurring templates,
 * and budget settings before any risky state modification.
 */
export function createComprehensiveCheckpoint(
  storage: StorageLike,
  reason: CheckpointReason = 'import',
  description?: string
): { success: boolean; error?: string } {
  try {
    const entries: Record<string, string | null> = {}
    for (const key of CRITICAL_CHECKPOINT_KEYS) {
      entries[key] = storage.getItem(key)
    }

    let schemaVersion = CURRENT_SCHEMA_VERSION
    let transactionCount = 0
    let customCategoryCount = 0
    let hasBudget = false

    const rawPrimary = entries[STORAGE_KEY]
    if (rawPrimary) {
      try {
        const parsed = JSON.parse(rawPrimary)
        if (typeof parsed.schemaVersion === 'number') schemaVersion = parsed.schemaVersion
        if (Array.isArray(parsed.transactions)) transactionCount = parsed.transactions.length
        if (Array.isArray(parsed.customCategories)) customCategoryCount = parsed.customCategories.length
        if (typeof parsed.monthlyBudget === 'number' && parsed.monthlyBudget > 0) hasBudget = true
      } catch {}
    }

    let goalCount = 0
    const rawGoals = entries[GOAL_STORAGE_KEY]
    if (rawGoals) {
      try {
        const parsedGoals = JSON.parse(rawGoals)
        if (Array.isArray(parsedGoals)) goalCount = parsedGoals.length
      } catch {}
    }

    let recurringCount = 0
    const rawRecurring = entries['sakukilat:v2:recurring']
    if (rawRecurring) {
      try {
        const parsedRec = JSON.parse(rawRecurring)
        if (Array.isArray(parsedRec)) recurringCount = parsedRec.length
      } catch {}
    }

    const metadata: CheckpointMetadata = {
      timestamp: new Date().toISOString(),
      reason,
      schemaVersion,
      transactionCount,
      goalCount,
      recurringCount,
      customCategoryCount,
      hasBudget,
      description,
    }

    const envelope = {
      ...entries,
      envelopeVersion: 2,
      createdAt: metadata.timestamp,
      reason,
      description,
      metadata,
      entries,
    }

    const serialized = JSON.stringify(envelope)
    storage.setItem(CHECKPOINT_KEY, serialized)

    // Save legacy keys for backward compatibility
    if (entries[STORAGE_KEY]) {
      storage.setItem(`${CHECKPOINT_KEY}:primary`, entries[STORAGE_KEY]!)
    }
    if (entries[GOAL_STORAGE_KEY]) {
      storage.setItem(GOAL_CHECKPOINT_KEY, entries[GOAL_STORAGE_KEY]!)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Gagal membuat checkpoint sebelum operasi (penyimpanan penuh).' }
  }
}

/**
 * Creates a multi-key checkpoint covering primary state and goals before modification.
 * Wraps createComprehensiveCheckpoint for full key coverage.
 */
export function createMultiKeyCheckpoint(storage: StorageLike, keys: string[]): { success: boolean; error?: string } {
  const res = createComprehensiveCheckpoint(storage, 'import')
  if (!res.success) return res

  // Ensure any extra custom keys requested are also captured
  try {
    const raw = storage.getItem(CHECKPOINT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.entries) {
        let modified = false
        for (const k of keys) {
          if (!(k in parsed.entries)) {
            parsed.entries[k] = storage.getItem(k)
            modified = true
          }
        }
        if (modified) {
          storage.setItem(CHECKPOINT_KEY, JSON.stringify(parsed))
        }
      }
    }
  } catch {}

  return { success: true }
}

/**
 * Reads and validates the current checkpoint, extracting structured summary metadata for UI preview.
 */
export function getCheckpointSummary(storage: StorageLike): CheckpointSummary | null {
  const chkRaw = storage.getItem(CHECKPOINT_KEY)
  if (!chkRaw) return null

  try {
    const parsed = JSON.parse(chkRaw)
    if (parsed && typeof parsed === 'object') {
      // V2 Envelope
      if (parsed.envelopeVersion === 2 && parsed.metadata) {
        const meta = parsed.metadata as CheckpointMetadata
        return {
          exists: true,
          createdAt: parsed.createdAt || meta.timestamp,
          reason: meta.reason,
          reasonLabel: formatReasonLabel(meta.reason),
          description: parsed.description || meta.description,
          transactionCount: meta.transactionCount ?? 0,
          goalCount: meta.goalCount ?? 0,
          recurringCount: meta.recurringCount ?? 0,
          customCategoryCount: meta.customCategoryCount ?? 0,
          schemaVersion: meta.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          isValid: true,
        }
      }

      // Legacy v1 dictionary
      let txCount = 0
      let schemaVer = CURRENT_SCHEMA_VERSION
      const rawPrimary = parsed[STORAGE_KEY] || parsed['sakukilat-user:v2:local-state']
      if (typeof rawPrimary === 'string') {
        try {
          const s = JSON.parse(rawPrimary)
          if (Array.isArray(s.transactions)) txCount = s.transactions.length
          if (typeof s.schemaVersion === 'number') schemaVer = s.schemaVersion
        } catch {}
      }
      return {
        exists: true,
        createdAt: parsed.timestamp || undefined,
        reason: 'import',
        reasonLabel: 'Sebelum Impor (Legacy)',
        transactionCount: txCount,
        goalCount: 0,
        recurringCount: 0,
        customCategoryCount: 0,
        schemaVersion: schemaVer,
        isValid: true,
      }
    }

    return {
      exists: true,
      reasonLabel: 'Cadangan Checkpoint',
      transactionCount: 0,
      goalCount: 0,
      recurringCount: 0,
      customCategoryCount: 0,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isValid: true,
    }
  } catch (error) {
    return {
      exists: true,
      reasonLabel: 'Checkpoint Rusak',
      transactionCount: 0,
      goalCount: 0,
      recurringCount: 0,
      customCategoryCount: 0,
      schemaVersion: 0,
      isValid: false,
      error: 'Data checkpoint tidak dapat dibaca (format JSON rusak).',
    }
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

  // Create comprehensive checkpoint of all critical keys
  const checkpointResult = createComprehensiveCheckpoint(
    storage,
    plan.mode === 'replace' ? 'restore' : 'import',
    plan.mode === 'replace' ? 'Sebelum pemulihan cadangan JSON' : 'Sebelum impor transaksi CSV'
  )
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
 * Ensures active data is NOT corrupted if restore fails, rejects corrupt/incompatible checkpoints,
 * and preserves checkpoint on failure.
 */
export function executeRollback(storage: StorageLike): {
  success: boolean
  error?: string
  restoredKeys: string[]
  restoredSummary?: {
    transactionCount: number
    goalCount: number
    recurringCount: number
  }
} {
  const chkRaw = storage.getItem(CHECKPOINT_KEY)
  if (!chkRaw) {
    return { success: false, error: 'Tidak ada checkpoint yang tersedia untuk pemulihan.', restoredKeys: [] }
  }

  // 1. Strict parse check
  let parsedCheckpoint: any
  try {
    parsedCheckpoint = JSON.parse(chkRaw)
  } catch (error) {
    // Corrupt JSON: reject without modifying storage, without deleting checkpoint
    return {
      success: false,
      error: `Checkpoint rusak (bukan JSON valid): ${String(error)}. Data aktif tetap utuh.`,
      restoredKeys: [],
    }
  }

  // 2. Extract entries dictionary
  let entriesToRestore: Record<string, string | null> = {}
  if (parsedCheckpoint && typeof parsedCheckpoint === 'object') {
    if (parsedCheckpoint.envelopeVersion === 2 && parsedCheckpoint.entries && typeof parsedCheckpoint.entries === 'object') {
      entriesToRestore = parsedCheckpoint.entries
    } else if (!Array.isArray(parsedCheckpoint)) {
      entriesToRestore = parsedCheckpoint
    } else {
      return { success: false, error: 'Format checkpoint tidak valid (array tidak didukung). Data aktif tetap utuh.', restoredKeys: [] }
    }
  } else {
    // Single string legacy state
    entriesToRestore = { [STORAGE_KEY]: chkRaw }
  }

  // 3. Strict validation on primary state
  const primaryStateRaw = entriesToRestore[STORAGE_KEY] || entriesToRestore['sakukilat-user:v2:local-state']
  let txCount = 0
  let goalCount = 0
  let recCount = 0

  if (primaryStateRaw) {
    try {
      const stateObj = JSON.parse(primaryStateRaw)
      if (typeof stateObj !== 'object' || stateObj === null || Array.isArray(stateObj)) {
        return { success: false, error: 'Checkpoint rusak: struktur state utama tidak valid.', restoredKeys: [] }
      }
      if (typeof stateObj.schemaVersion === 'number' && stateObj.schemaVersion > CURRENT_SCHEMA_VERSION) {
        return {
          success: false,
          error: `Checkpoint tidak kompatibel: skema versi ${stateObj.schemaVersion} lebih baru dari versi aplikasi (${CURRENT_SCHEMA_VERSION}).`,
          restoredKeys: [],
        }
      }
      if (stateObj.transactions !== undefined && !Array.isArray(stateObj.transactions)) {
        return { success: false, error: 'Checkpoint rusak: daftar transaksi bukan array.', restoredKeys: [] }
      }
      if (Array.isArray(stateObj.transactions)) txCount = stateObj.transactions.length
    } catch {
      return { success: false, error: 'Checkpoint rusak: payload state utama tidak dapat diparse.', restoredKeys: [] }
    }
  }

  if (entriesToRestore[GOAL_STORAGE_KEY]) {
    try {
      const g = JSON.parse(entriesToRestore[GOAL_STORAGE_KEY]!)
      if (Array.isArray(g)) goalCount = g.length
    } catch {}
  }

  if (entriesToRestore['sakukilat:v2:recurring']) {
    try {
      const r = JSON.parse(entriesToRestore['sakukilat:v2:recurring']!)
      if (Array.isArray(r)) recCount = r.length
    } catch {}
  }

  // 4. In-memory snapshot of active keys before write for rollback-of-rollback protection
  const activeKeysSnapshot: Record<string, string | null> = {}
  const keysToProcess = Object.keys(entriesToRestore).filter(
    k => !['timestamp', 'reason', 'envelopeVersion', 'metadata', 'createdAt', 'description'].includes(k)
  )

  for (const k of keysToProcess) {
    activeKeysSnapshot[k] = storage.getItem(k)
  }

  // 5. Atomic write with verification
  const restoredKeys: string[] = []
  try {
    for (const key of keysToProcess) {
      const val = entriesToRestore[key]
      if (val === null) {
        if (storage.getItem(key) !== null) {
          storage.removeItem(key)
        }
      } else {
        const currentVal = storage.getItem(key)
        if (currentVal !== String(val)) {
          storage.setItem(key, String(val))
          if (storage.getItem(key) !== String(val)) {
            throw new Error(`Verifikasi penyimpanan gagal untuk kunci ${key}`)
          }
        }
      }
      restoredKeys.push(key)
    }

    return {
      success: true,
      restoredKeys,
      restoredSummary: {
        transactionCount: txCount,
        goalCount,
        recurringCount: recCount,
      },
    }
  } catch (writeErr) {
    // Revert storage back to activeKeysSnapshot
    try {
      for (const [k, prevVal] of Object.entries(activeKeysSnapshot)) {
        if (prevVal === null) {
          storage.removeItem(k)
        } else {
          storage.setItem(k, prevVal)
        }
      }
    } catch {}

    // Checkpoint is PRESERVED, never deleted on failure
    return {
      success: false,
      error: `Gagal memulihkan checkpoint: ${String(writeErr)}. Data aktif tetap dipertahankan utuh.`,
      restoredKeys: [],
    }
  }
}

/**
 * Checks if a valid restore rollback checkpoint is available in storage.
 */
export function canRollback(storage: StorageLike): boolean {
  const chk = storage.getItem(CHECKPOINT_KEY)
  if (!chk) return false
  try {
    const parsed = JSON.parse(chk)
    return Boolean(parsed)
  } catch {
    return false
  }
}
