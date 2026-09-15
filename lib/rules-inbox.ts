/**
 * SakuKilat — Local Categorization Rules & Inbox Review (Phase P8)
 * -----------------------------------------------------------------
 * Implements client-side word-boundary pattern matching against transaction
 * descriptions, automated category suggestions, and queueing of unclassified
 * or low-confidence (< 0.6) items into an on-device Inbox Review queue.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. Offline-First & Zero Network: All pattern matching and rule evaluation
 *    executes 100% on-device with zero HTTP/HTTPS network calls. (Requirement 8.6)
 * 2. Non-Destructive Category Suggestion: Matches suggest categories without
 *    mutating stored transaction records until explicit user confirmation. (Requirement 8.4)
 * 3. Threshold Routing: Matches with confidence < 0.6 or unmatched items route
 *    to the pending Inbox Review queue. (Requirement 8.3)
 * 4. Duplicate Prevention: Keywords are normalized and duplicates rejected.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 * Properties: 23, 24, 25
 */

// ── Types & Interfaces ────────────────────────────────────────────────────────

export interface LocalCategoryRule {
  id: string
  keyword: string // Normalized lowercase match pattern
  categoryId: string
  subcategoryId?: string
  preferredPaymentMethodId?: string
  isActive: boolean
  matchCount: number
  createdAt: string
}

export interface InboxTransactionItem {
  id: string
  rawDescription: string
  amount: number
  date: string // ISO string or calendar date string
  suggestedCategoryId?: string
  suggestedSubcategoryId?: string
  confidence: number // 0.0 - 1.0
  status: 'pending' | 'approved' | 'rejected'
}

export interface CategoryMatchEvaluation {
  hasMatch: boolean
  confidence: number
  suggestedCategoryId?: string
  suggestedSubcategoryId?: string
  preferredPaymentMethodId?: string
  matchedRule?: LocalCategoryRule
  matchedKeyword?: string
  matchType: 'word_boundary' | 'substring' | 'none'
  requiresInboxReview: boolean
}

export interface CreateLocalRuleInput {
  keyword: string
  categoryId: string
  subcategoryId?: string
  preferredPaymentMethodId?: string
  isActive?: boolean
  id?: string
  createdAt?: string
}

export interface CreateInboxItemInput {
  id?: string
  rawDescription: string
  amount: number
  date?: Date | string
  suggestedCategoryId?: string
  suggestedSubcategoryId?: string
  confidence?: number
  status?: 'pending' | 'approved' | 'rejected'
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.6

// ── Normalization & Word-Boundary Regex Helpers ───────────────────────────────

/**
 * Normalizes keyword into trimmed lowercase representation with collapsed spaces.
 */
export function normalizeKeyword(keyword: string): string {
  if (typeof keyword !== 'string') return ''
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Escapes special regular expression characters.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Checks if a description matches a keyword using word-boundary matching.
 * Uses negative lookbehind/lookahead `(?<![a-zA-Z0-9_])...(?![a-zA-Z0-9_])`
 * so that words surrounded by spaces, punctuation, or string ends match,
 * while partial words (e.g. "ngopi" matching "kopi") are cleanly rejected.
 */
export function matchesKeyword(description: string, keyword: string): boolean {
  const normKw = normalizeKeyword(keyword)
  if (!normKw) return false
  if (typeof description !== 'string' || !description.trim()) return false

  const escaped = escapeRegExp(normKw)
  const pattern = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, 'i')
  return pattern.test(description)
}

/**
 * Checks if a description contains a keyword as a substring (case-insensitive).
 */
export function matchesSubstring(description: string, keyword: string): boolean {
  const normKw = normalizeKeyword(keyword)
  if (!normKw) return false
  if (typeof description !== 'string' || !description.trim()) return false
  return description.toLowerCase().includes(normKw)
}

/**
 * Detects whether a keyword already exists among active or registered rules.
 */
export function isDuplicateRule(
  keyword: string,
  rules: LocalCategoryRule[],
  excludeRuleId?: string
): boolean {
  const normalized = normalizeKeyword(keyword)
  if (!normalized) return false
  return rules.some(
    r => (excludeRuleId ? r.id !== excludeRuleId : true) && normalizeKeyword(r.keyword) === normalized
  )
}

// ── Rule & Inbox Factories ───────────────────────────────────────────────────

/**
 * Creates an immutable LocalCategoryRule record with validation.
 * Rejects empty keywords, empty category IDs, and duplicates.
 */
export function createLocalRule(
  input: CreateLocalRuleInput,
  existingRules: LocalCategoryRule[] = []
): LocalCategoryRule {
  const normalizedKeyword = normalizeKeyword(input.keyword)
  if (!normalizedKeyword) {
    throw new Error('Kata kunci tidak boleh kosong.')
  }
  if (!input.categoryId || !input.categoryId.trim()) {
    throw new Error('Kategori harus ditentukan.')
  }
  if (isDuplicateRule(normalizedKeyword, existingRules, input.id)) {
    throw new Error('Kata kunci ini sudah memiliki aturan aktif.')
  }

  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 8)
  const id = input.id || `rule-${Date.now()}-${random}`
  const createdAt = input.createdAt || new Date().toISOString()

  return {
    id,
    keyword: normalizedKeyword,
    categoryId: input.categoryId.trim(),
    subcategoryId: input.subcategoryId?.trim() || undefined,
    preferredPaymentMethodId: input.preferredPaymentMethodId?.trim() || undefined,
    isActive: input.isActive !== false,
    matchCount: 0,
    createdAt,
  }
}

/**
 * Creates an InboxTransactionItem record for unclassified or low-confidence transactions.
 */
export function createInboxItem(input: CreateInboxItemInput): InboxTransactionItem {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 8)
  const id = input.id || `inbox-${Date.now()}-${random}`

  let dateStr: string
  if (input.date instanceof Date && !Number.isNaN(input.date.getTime())) {
    dateStr = input.date.toISOString()
  } else if (typeof input.date === 'string' && input.date.trim()) {
    dateStr = input.date.trim()
  } else {
    dateStr = new Date().toISOString()
  }

  return {
    id,
    rawDescription: (input.rawDescription || '').trim(),
    amount: Math.max(0, Math.round(Number(input.amount) || 0)),
    date: dateStr,
    suggestedCategoryId: input.suggestedCategoryId?.trim() || undefined,
    suggestedSubcategoryId: input.suggestedSubcategoryId?.trim() || undefined,
    confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0,
    status: input.status || 'pending',
  }
}

// ── Pattern Matching Engine ───────────────────────────────────────────────────

/**
 * Evaluates a transaction description against stored local rules on-device.
 *
 * Evaluation Strategy:
 * 1. Word-boundary match:
 *    - Exact match (desc === keyword): confidence = 1.0
 *    - Word-boundary match (desc contains keyword with word boundaries): confidence = 0.70 + 0.30 * ratio
 *    - Both yield confidence >= 0.70 (which exceeds threshold 0.60, requiring no inbox review).
 * 2. Partial/substring match without word boundary (e.g. "ngopi" containing "kopi"):
 *    - Yields low confidence: 0.35 + 0.15 * ratio (always < 0.60).
 *    - Yields `requiresInboxReview = true` with a suggested category for user confirmation.
 * 3. No match:
 *    - Yields confidence = 0, `hasMatch = false`, `requiresInboxReview = true`.
 */
export function evaluateTransactionForRules(
  description: string,
  rules: LocalCategoryRule[],
  options?: { threshold?: number }
): CategoryMatchEvaluation {
  const threshold = options?.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const normDesc = normalizeKeyword(description)

  if (!normDesc || !Array.isArray(rules) || rules.length === 0) {
    return {
      hasMatch: false,
      confidence: 0,
      requiresInboxReview: true,
      matchType: 'none',
    }
  }

  const activeRules = rules.filter(r => r && r.isActive && Boolean(r.keyword))
  if (activeRules.length === 0) {
    return {
      hasMatch: false,
      confidence: 0,
      requiresInboxReview: true,
      matchType: 'none',
    }
  }

  // Phase 1: Word-boundary matches (high confidence >= 0.70)
  const wordBoundaryMatches: Array<{ rule: LocalCategoryRule; confidence: number }> = []

  for (const rule of activeRules) {
    if (matchesKeyword(description, rule.keyword)) {
      const normKw = normalizeKeyword(rule.keyword)
      const ratio = normDesc.length > 0 ? Math.min(1, normKw.length / normDesc.length) : 1
      const isExact = normDesc === normKw
      const confidence = isExact ? 1.0 : Math.round((0.70 + 0.30 * ratio) * 100) / 100
      wordBoundaryMatches.push({ rule, confidence })
    }
  }

  if (wordBoundaryMatches.length > 0) {
    // Sort candidate rules: longest keyword first, then matchCount, then createdAt
    wordBoundaryMatches.sort((a, b) => {
      const lenDiff = b.rule.keyword.length - a.rule.keyword.length
      if (lenDiff !== 0) return lenDiff
      const countDiff = b.rule.matchCount - a.rule.matchCount
      if (countDiff !== 0) return countDiff
      return b.rule.createdAt.localeCompare(a.rule.createdAt)
    })

    const best = wordBoundaryMatches[0]
    return {
      hasMatch: true,
      confidence: best.confidence,
      suggestedCategoryId: best.rule.categoryId,
      suggestedSubcategoryId: best.rule.subcategoryId,
      preferredPaymentMethodId: best.rule.preferredPaymentMethodId,
      matchedRule: best.rule,
      matchedKeyword: best.rule.keyword,
      matchType: 'word_boundary',
      requiresInboxReview: best.confidence < threshold,
    }
  }

  // Phase 2: Substring matches without word boundary (low confidence < 0.60)
  const substringMatches: Array<{ rule: LocalCategoryRule; confidence: number }> = []

  for (const rule of activeRules) {
    if (matchesSubstring(description, rule.keyword)) {
      const normKw = normalizeKeyword(rule.keyword)
      const ratio = normDesc.length > 0 ? Math.min(1, normKw.length / normDesc.length) : 1
      const confidence = Math.round((0.35 + 0.15 * ratio) * 100) / 100
      substringMatches.push({ rule, confidence })
    }
  }

  if (substringMatches.length > 0) {
    substringMatches.sort((a, b) => {
      const lenDiff = b.rule.keyword.length - a.rule.keyword.length
      if (lenDiff !== 0) return lenDiff
      const countDiff = b.rule.matchCount - a.rule.matchCount
      if (countDiff !== 0) return countDiff
      return b.rule.createdAt.localeCompare(a.rule.createdAt)
    })

    const best = substringMatches[0]
    return {
      hasMatch: true,
      confidence: best.confidence,
      suggestedCategoryId: best.rule.categoryId,
      suggestedSubcategoryId: best.rule.subcategoryId,
      preferredPaymentMethodId: best.rule.preferredPaymentMethodId,
      matchedRule: best.rule,
      matchedKeyword: best.rule.keyword,
      matchType: 'substring',
      requiresInboxReview: true, // Always < threshold (0.6)
    }
  }

  // Phase 3: No matches at all
  return {
    hasMatch: false,
    confidence: 0,
    requiresInboxReview: true,
    matchType: 'none',
  }
}

// ── Inbox Routing & Review Operations ─────────────────────────────────────────

/**
 * Determines whether a transaction should be routed to the Inbox Review queue,
 * and if so, constructs the InboxTransactionItem.
 * (Requirement 8.3, Property 24)
 */
export function routeToInboxIfNeeded(
  transaction: {
    id?: string
    description: string
    amount: number
    date?: Date | string
  },
  evaluation: CategoryMatchEvaluation,
  inbox: InboxTransactionItem[],
  threshold = DEFAULT_CONFIDENCE_THRESHOLD
): {
  routed: boolean
  inboxItem?: InboxTransactionItem
  updatedInbox: InboxTransactionItem[]
} {
  const shouldRoute = !evaluation.hasMatch || evaluation.confidence < threshold
  if (!shouldRoute) {
    return { routed: false, updatedInbox: inbox }
  }

  // Prevent duplicate inbox entries for the same transaction ID if provided
  if (transaction.id && inbox.some(item => item.id === `inbox-${transaction.id}`)) {
    const existing = inbox.find(item => item.id === `inbox-${transaction.id}`)
    return { routed: false, inboxItem: existing, updatedInbox: inbox }
  }

  const inboxItem = createInboxItem({
    id: transaction.id ? `inbox-${transaction.id}` : undefined,
    rawDescription: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    suggestedCategoryId: evaluation.suggestedCategoryId,
    suggestedSubcategoryId: evaluation.suggestedSubcategoryId,
    confidence: evaluation.confidence,
    status: 'pending',
  })

  return {
    routed: true,
    inboxItem,
    updatedInbox: [inboxItem, ...inbox],
  }
}

/**
 * Marks an inbox transaction item as approved with optional confirmed category.
 * (Requirement 8.4, 8.5)
 */
export function approveInboxTransaction(
  item: InboxTransactionItem,
  confirmedCategory?: { categoryId: string; subcategoryId?: string }
): InboxTransactionItem {
  return {
    ...item,
    suggestedCategoryId: confirmedCategory?.categoryId || item.suggestedCategoryId,
    suggestedSubcategoryId: confirmedCategory?.subcategoryId ?? item.suggestedSubcategoryId,
    status: 'approved',
  }
}

/**
 * Marks an inbox transaction item as rejected.
 */
export function rejectInboxTransaction(item: InboxTransactionItem): InboxTransactionItem {
  return {
    ...item,
    status: 'rejected',
  }
}

/**
 * Generates rule creation parameters from an approved or confirmed inbox item.
 * (Requirement 8.5)
 */
export function prepareRuleFromInboxItem(
  item: InboxTransactionItem,
  customKeyword?: string
): CreateLocalRuleInput {
  const keyword = normalizeKeyword(customKeyword || item.rawDescription)
  return {
    keyword,
    categoryId: item.suggestedCategoryId || 'lainnya',
    subcategoryId: item.suggestedSubcategoryId,
    isActive: true,
  }
}

/**
 * Increments match count for a rule after user-confirmed application.
 */
export function incrementRuleUsage(ruleId: string, rules: LocalCategoryRule[]): LocalCategoryRule[] {
  return rules.map(r => (r.id === ruleId ? { ...r, matchCount: r.matchCount + 1 } : r))
}

/**
 * Filters pending inbox items awaiting user review.
 */
export function getPendingInboxItems(inbox: InboxTransactionItem[]): InboxTransactionItem[] {
  if (!Array.isArray(inbox)) return []
  return inbox.filter(item => item.status === 'pending')
}

// ── Namespace Export ─────────────────────────────────────────────────────────

export const RuleInboxManager = {
  normalizeKeyword,
  matchesKeyword,
  matchesSubstring,
  isDuplicateRule,
  createRule: createLocalRule,
  createInboxItem,
  evaluate: evaluateTransactionForRules,
  routeToInboxIfNeeded,
  approveInbox: approveInboxTransaction,
  rejectInbox: rejectInboxTransaction,
  prepareRuleFromInbox: prepareRuleFromInboxItem,
  incrementUsage: incrementRuleUsage,
  getPending: getPendingInboxItems,
}
