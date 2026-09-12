/**
 * SakuKilat — Category & Subcategory Deduplication & Normalization Utilities
 */

/**
 * Deduplicate subcategories case-insensitively and trimmed, preserving first seen casing.
 */
export function dedupeSubcategories(subs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const s of subs) {
    if (!s) continue
    const trimmed = s.trim()
    const key = trimmed.toLowerCase()
    if (trimmed && !seen.has(key)) {
      seen.add(key)
      result.push(trimmed)
    }
  }
  return result
}

/**
 * Normalized key for category comparison (e.g. 'Lainnya', 'lainnya', 'Lain-lain' -> 'lainnya')
 */
export function normalizeCategoryKey(labelOrId: string): string {
  return (labelOrId || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}
