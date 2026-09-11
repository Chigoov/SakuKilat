/**
 * SakuKilat — Transaction Deduplication Helper
 *
 * Stable signature-based dedup for import merge operations.
 * Compares by date (timezone-independent ISO date), type, amount,
 * normalized description, category, subcategory, and paymentMethod.
 */

export interface DeduplicateResult {
  unique: any[]
  duplicateCount: number
  internalDuplicateCount: number
}

/**
 * Normalizes a Date object or string into a timezone-independent YYYY-MM-DD date key.
 */
export function normalizeDateForSignature(date: Date | string): string {
  if (typeof date === 'string') {
    const trimmed = date.trim()
    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
    if (isoMatch) return isoMatch[1]
    const d = new Date(trimmed)
    if (Number.isFinite(d.getTime())) {
      return d.toISOString().slice(0, 10)
    }
    return 'invalid'
  }
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    return date.toISOString().slice(0, 10)
  }
  return 'invalid'
}

/**
 * Create a stable, timezone-independent fingerprint for a transaction.
 * Uses YYYY-MM-DD date, normalized type, rounded amount, normalized description,
 * category, subcategory, and paymentMethod.
 */
export function transactionSignature(tx: {
  date: Date | string
  type: string
  amount: number
  description: string
  category?: string
  subcategory?: string
  paymentMethod?: string
}): string {
  const dateOnly = normalizeDateForSignature(tx.date)
  const normalizedAmount = Math.round(Number(tx.amount) || 0)
  const normalizedDesc = (tx.description || '').toLowerCase().trim().replace(/\s+/g, ' ')
  return [
    dateOnly,
    (tx.type || '').toLowerCase().trim(),
    String(normalizedAmount),
    normalizedDesc,
    (tx.category || '').toLowerCase().trim(),
    (tx.subcategory || '').toLowerCase().trim(),
    (tx.paymentMethod || '').toLowerCase().trim(),
  ].join('|')
}

/**
 * Deduplicate incoming transactions against existing ones.
 * Also removes internal duplicates within the incoming set.
 */
export function deduplicateTransactions(
  incoming: any[],
  existing: any[]
): DeduplicateResult {
  const existingSignatures = new Set<string>()
  for (const tx of existing) {
    existingSignatures.add(transactionSignature(tx))
  }

  const seenIncoming = new Set<string>()
  const unique: any[] = []
  let duplicateCount = 0
  let internalDuplicateCount = 0

  for (const tx of incoming) {
    const sig = transactionSignature(tx)

    // Check against existing transactions in storage
    if (existingSignatures.has(sig)) {
      duplicateCount++
      continue
    }

    // Check against already-seen incoming in the same file (internal dupes)
    if (seenIncoming.has(sig)) {
      internalDuplicateCount++
      continue
    }

    seenIncoming.add(sig)
    unique.push(tx)
  }

  return { unique, duplicateCount, internalDuplicateCount }
}
