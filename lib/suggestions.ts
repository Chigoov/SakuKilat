'use client'

import type { Transaction } from './mock-data'

export interface PhraseSuggestion {
  value: string
  count: number
  lastUsedAt: number
  type: Transaction['type']
  category: string
  subcategory?: string
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasDigit(value: string): boolean {
  return /\d/.test(value)
}

function queryMatchScore(normalizedValue: string, words: string[]): number {
  const parts = normalizedValue.split(' ').filter(Boolean)
  let score = 0

  for (const word of words) {
    if (normalizedValue.startsWith(word)) {
      score += 4
      continue
    }
    if (parts.some((part) => part.startsWith(word))) {
      score += 3
      continue
    }
    if (normalizedValue.includes(word)) {
      score += 1
      continue
    }
    return -1
  }

  return score
}

export function findPhraseSuggestions(
  transactions: Transaction[],
  query: string,
  limit = 4,
): PhraseSuggestion[] {
  const rawQuery = query.trim()
  const normalizedQuery = normalizeText(rawQuery)
  if (normalizedQuery.length < 2 || hasDigit(rawQuery)) return []

  const words = normalizedQuery.split(' ').filter(Boolean)
  if (words.length === 0) return []

  const byText = new Map<string, PhraseSuggestion>()
  for (const transaction of transactions) {
    const value = transaction.description.trim()
    const normalizedValue = normalizeText(value)
    if (normalizedValue.length < 2) continue
    if (queryMatchScore(normalizedValue, words) < 0) continue

    const existing = byText.get(normalizedValue)
    if (!existing) {
      byText.set(normalizedValue, {
        value,
        count: 1,
        lastUsedAt: transaction.date.getTime(),
        type: transaction.type,
        category: transaction.category,
        subcategory: transaction.subcategory,
      })
      continue
    }

    existing.count += 1
    if (transaction.date.getTime() > existing.lastUsedAt) {
      existing.lastUsedAt = transaction.date.getTime()
      existing.value = value
      existing.type = transaction.type
      existing.category = transaction.category
      existing.subcategory = transaction.subcategory
    }
  }

  return Array.from(byText.values())
    .sort((left, right) => {
      const leftScore = queryMatchScore(normalizeText(left.value), words)
      const rightScore = queryMatchScore(normalizeText(right.value), words)
      if (leftScore !== rightScore) return rightScore - leftScore
      if (left.count !== right.count) return right.count - left.count
      return right.lastUsedAt - left.lastUsedAt
    })
    .slice(0, limit)
}
