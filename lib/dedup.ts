/**
 * SakuKilat — Transaction Deduplication Helper
 *
 * Stable signature-based dedup for import merge operations.
 * Compares by date (ISO date only), type, amount, description (normalized), category, subcategory, paymentMethod.
 */

export interface DeduplicateResult {
  unique: any[]
  duplicateCount: number
  internalDuplicateCount: number
}

/**
 * Create a stable fingerprint for a transaction.
 * Uses ISO date (date-only, no time), type, amount, normalized description, category, subcategory, payment.
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
  const d = tx.date instanceof Date ? tx.date : new Date(tx.date)
  const dateOnly = Number.isFinite(d.getTime())
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : 'invalid'
  return [
    dateOnly,
    (tx.type || '').toLowerCase().trim(),
    String(tx.amount),
    (tx.description || '').toLowerCase().trim(),
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
  // Build fingerprint set from existing transactions
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
    
    // Check against existing
    if (existingSignatures.has(sig)) {
      duplicateCount++
      continue
    }

    // Check against already-seen incoming (internal dupes)
    if (seenIncoming.has(sig)) {
      internalDuplicateCount++
      continue
    }

    seenIncoming.add(sig)
    unique.push(tx)
  }

  return { unique, duplicateCount, internalDuplicateCount }
}
