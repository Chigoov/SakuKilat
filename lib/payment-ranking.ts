/**
 * SakuKilat — Compact Payment Method Selector & Heuristic Ranking Algorithm
 *
 * Implements Phase P2:
 * 1. Calculates usage frequency and last-used timestamp per payment method from transaction history.
 * 2. Extracts top 3 most frequently used and top 3 most recently used methods.
 * 3. Merges, deduplicates, sorts by recency first then frequency, and bounds to maximum 5 items.
 * 4. Populates remaining slots from active wallets if history has fewer than 5 unique methods.
 * 5. In edit mode, ensures the transaction's currently assigned method is pinned/visible.
 * 6. In transfer mode, returns all eligible source and destination wallets without 5-item bound.
 * 7. Preserves hidden payment method configurations non-destructively.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7
 * Design Properties: 4, 5, 6, 7
 */

export interface PaymentMethodItem {
  id: string
  label: string
  balance: number
  [key: string]: any
}

export interface PaymentMethodRankingItem {
  id: string
  label: string
  balance?: number
  frequency: number
  lastUsedTimestamp: number
}

export interface CompactSelectorOptions {
  wallets: Array<{ id: string; label: string; balance: number; [key: string]: any }>
  transactions: Array<{ paymentMethod: string; date: Date | string | number }>
  activeMethodId?: string
  isTransferMode?: boolean
  hiddenPaymentIds?: string[]
}

export interface CompactPaymentMethodsResult {
  compactMethods: Array<{ id: string; label: string; balance: number; [key: string]: any }>
  remainingMethods: Array<{ id: string; label: string; balance: number; [key: string]: any }>
  totalCount: number
}

/**
 * Safely parses any date representation into a millisecond timestamp.
 * Returns 0 if unparseable or invalid.
 */
export function parseDateTimestamp(dateInput: Date | string | number | undefined | null): number {
  if (!dateInput) return 0
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? 0 : dateInput.getTime()
  }
  if (typeof dateInput === 'number') {
    return Number.isFinite(dateInput) ? dateInput : 0
  }
  if (typeof dateInput === 'string') {
    const parsed = new Date(dateInput).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Calculates usage frequency and last-used timestamp per payment method from transaction history.
 * Considers only active (non-hidden) wallets unless specified otherwise.
 */
export function calculatePaymentMethodStats(
  wallets: Array<{ id: string; label: string; balance?: number; [key: string]: any }>,
  transactions: Array<{ paymentMethod: string; date: Date | string | number }>,
  hiddenPaymentIds?: string[]
): PaymentMethodRankingItem[] {
  const hiddenSet = new Set((hiddenPaymentIds ?? []).filter(Boolean))
  const statsMap = new Map<string, { frequency: number; lastUsedTimestamp: number }>()

  for (const tx of (transactions ?? [])) {
    if (!tx || !tx.paymentMethod) continue
    const methodId = tx.paymentMethod
    const ts = parseDateTimestamp(tx.date)

    const existing = statsMap.get(methodId)
    if (existing) {
      existing.frequency += 1
      if (ts > existing.lastUsedTimestamp) {
        existing.lastUsedTimestamp = ts
      }
    } else {
      statsMap.set(methodId, { frequency: 1, lastUsedTimestamp: ts })
    }
  }

  const result: PaymentMethodRankingItem[] = []
  const seenIds = new Set<string>()

  for (const w of (wallets ?? [])) {
    if (!w || !w.id || hiddenSet.has(w.id) || seenIds.has(w.id)) continue
    seenIds.add(w.id)
    const stat = statsMap.get(w.id)
    result.push({
      id: w.id,
      label: w.label || w.id,
      balance: typeof w.balance === 'number' ? w.balance : 0,
      frequency: stat ? stat.frequency : 0,
      lastUsedTimestamp: stat ? stat.lastUsedTimestamp : 0,
    })
  }

  return result
}

/**
 * Ranks payment methods:
 * 1. Calculate frequency and last-used timestamp per method from history.
 * 2. Select top 3 most frequently used.
 * 3. Select top 3 most recently used.
 * 4. Deduplicate union, sorting by recency first then frequency.
 * 5. Bound to maximum 5 items. If < 5, fill from default active wallets.
 * 6. In edit mode, ensure `activeMethodId` is present in visible items (pinned if needed).
 * 7. In transfer mode, return all active non-hidden wallets without 5-item truncation.
 */
export function getCompactPaymentMethods(options: CompactSelectorOptions): CompactPaymentMethodsResult {
  const hiddenSet = new Set((options?.hiddenPaymentIds ?? []).filter(Boolean))
  const rawWallets = options?.wallets ?? []
  const rawTransactions = options?.transactions ?? []
  const activeMethodId = options?.activeMethodId?.trim()

  // Extract non-hidden unique active wallets
  const activeWallets: PaymentMethodItem[] = []
  const seenWalletIds = new Set<string>()

  for (const w of rawWallets) {
    if (!w || !w.id || hiddenSet.has(w.id) || seenWalletIds.has(w.id)) continue
    seenWalletIds.add(w.id)
    activeWallets.push({
      ...w,
      id: w.id,
      label: w.label || w.id,
      balance: typeof w.balance === 'number' ? w.balance : 0,
    })
  }

  // ── Mode: Transfer Mode (Requirement 2.6, Property 6) ─────────────────────
  // In transfer mode, return all active non-hidden wallets without 5-item truncation bound
  if (options?.isTransferMode) {
    const list = [...activeWallets]
    if (activeMethodId && !list.some(w => w.id === activeMethodId)) {
      const rawMatch = rawWallets.find(w => w.id === activeMethodId)
      const pinnedItem: PaymentMethodItem = rawMatch
        ? { ...rawMatch, id: rawMatch.id, label: rawMatch.label || rawMatch.id, balance: typeof rawMatch.balance === 'number' ? rawMatch.balance : 0 }
        : { id: activeMethodId, label: activeMethodId, balance: 0 }
      list.unshift(pinnedItem)
    }
    return {
      compactMethods: list,
      remainingMethods: [],
      totalCount: list.length,
    }
  }

  // ── Mode: Standard & Edit Mode (Requirements 2.1, 2.2, 2.3, 2.5, 2.7) ─────
  // 1. Calculate frequency and last-used timestamp per method from history
  const statsMap = new Map<string, { frequency: number; lastUsedTimestamp: number }>()

  for (const tx of rawTransactions) {
    if (!tx || !tx.paymentMethod) continue
    const methodId = tx.paymentMethod
    const ts = parseDateTimestamp(tx.date)

    const existing = statsMap.get(methodId)
    if (existing) {
      existing.frequency += 1
      if (ts > existing.lastUsedTimestamp) {
        existing.lastUsedTimestamp = ts
      }
    } else {
      statsMap.set(methodId, { frequency: 1, lastUsedTimestamp: ts })
    }
  }

  const activeWalletIndexMap = new Map(activeWallets.map((w, idx) => [w.id, idx]))

  // Only consider active wallets that have actually been used in history
  const usedWallets = activeWallets.filter(w => {
    const stat = statsMap.get(w.id)
    return stat !== undefined && stat.frequency > 0
  })

  // 2. Select top 3 most frequently used
  const byFrequency = [...usedWallets].sort((a, b) => {
    const freqA = statsMap.get(a.id)?.frequency ?? 0
    const freqB = statsMap.get(b.id)?.frequency ?? 0
    if (freqB !== freqA) return freqB - freqA

    const recA = statsMap.get(a.id)?.lastUsedTimestamp ?? 0
    const recB = statsMap.get(b.id)?.lastUsedTimestamp ?? 0
    if (recB !== recA) return recB - recA

    const idxA = activeWalletIndexMap.get(a.id) ?? 0
    const idxB = activeWalletIndexMap.get(b.id) ?? 0
    return idxA - idxB
  })
  const top3Frequent = byFrequency.slice(0, 3)

  // 3. Select top 3 most recently used
  const byRecency = [...usedWallets].sort((a, b) => {
    const recA = statsMap.get(a.id)?.lastUsedTimestamp ?? 0
    const recB = statsMap.get(b.id)?.lastUsedTimestamp ?? 0
    if (recB !== recA) return recB - recA

    const freqA = statsMap.get(a.id)?.frequency ?? 0
    const freqB = statsMap.get(b.id)?.frequency ?? 0
    if (freqB !== freqA) return freqB - freqA

    const idxA = activeWalletIndexMap.get(a.id) ?? 0
    const idxB = activeWalletIndexMap.get(b.id) ?? 0
    return idxA - idxB
  })
  const top3Recent = byRecency.slice(0, 3)

  // 4. Deduplicate union, sorting by recency first then frequency
  const unionMap = new Map<string, PaymentMethodItem>()
  for (const w of top3Recent) {
    unionMap.set(w.id, w)
  }
  for (const w of top3Frequent) {
    unionMap.set(w.id, w)
  }

  const unionList = Array.from(unionMap.values())
  unionList.sort((a, b) => {
    const recA = statsMap.get(a.id)?.lastUsedTimestamp ?? 0
    const recB = statsMap.get(b.id)?.lastUsedTimestamp ?? 0
    if (recB !== recA) return recB - recA

    const freqA = statsMap.get(a.id)?.frequency ?? 0
    const freqB = statsMap.get(b.id)?.frequency ?? 0
    if (freqB !== freqA) return freqB - freqA

    const idxA = activeWalletIndexMap.get(a.id) ?? 0
    const idxB = activeWalletIndexMap.get(b.id) ?? 0
    return idxA - idxB
  })

  // 5. Bound to maximum 5 items. If < 5, fill from default active wallets
  let compactList = unionList.slice(0, 5)

  const compactIdSet = new Set(compactList.map(w => w.id))
  for (const w of activeWallets) {
    if (compactList.length >= 5) break
    if (!compactIdSet.has(w.id)) {
      compactList.push(w)
      compactIdSet.add(w.id)
    }
  }

  // 6. In edit mode, ensure `activeMethodId` is present in visible items (pinned if needed)
  if (activeMethodId) {
    const isAlreadyVisible = compactList.some(w => w.id === activeMethodId)
    if (!isAlreadyVisible) {
      const rawMatch = rawWallets.find(w => w.id === activeMethodId)
      const pinnedItem: PaymentMethodItem = rawMatch
        ? { ...rawMatch, id: rawMatch.id, label: rawMatch.label || rawMatch.id, balance: typeof rawMatch.balance === 'number' ? rawMatch.balance : 0 }
        : { id: activeMethodId, label: activeMethodId, balance: 0 }

      compactList.unshift(pinnedItem)
      if (compactList.length > 5) {
        compactList = compactList.slice(0, 5)
      }
    }
  }

  // Compile remaining active methods not present in compactList
  const finalCompactIdSet = new Set(compactList.map(w => w.id))
  const remainingMethods: PaymentMethodItem[] = []

  for (const w of activeWallets) {
    if (!finalCompactIdSet.has(w.id)) {
      remainingMethods.push(w)
    }
  }

  return {
    compactMethods: compactList,
    remainingMethods,
    totalCount: compactList.length + remainingMethods.length,
  }
}
