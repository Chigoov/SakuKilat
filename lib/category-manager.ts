/**
 * SakuKilat — Category Management & Non-Destructive Operations
 * -----------------------------------------------------------
 * Provides non-destructive category deletion (preserving historical labels)
 * and deduplication with canonical ID remapping.
 */

import type { Transaction } from './mock-data.ts'
import type { CustomCategory } from './parser.ts'

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
