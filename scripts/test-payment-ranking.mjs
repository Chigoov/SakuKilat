/**
 * SakuKilat — Unit & Regression Tests for Payment Method Ranking (Phase P2 / Task 4.1)
 *
 * Validates:
 * - Sub-task 1: Calculate usage frequency and last-used timestamp per payment method
 * - Sub-task 2: Extract top 3 most frequently used and top 3 most recently used methods
 * - Sub-task 3: Merge, deduplicate, sort by recency then frequency, bound to max 5
 * - Sub-task 4: Populate remaining slots from active wallets if history < 5 methods
 * - Sub-task 5: In edit mode, ensure assigned method is pinned into visible options
 * - Sub-task 6: In transfer mode, return all eligible wallets without 5-item bound
 * - Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7
 */

import assert from 'node:assert/strict'
import {
  getCompactPaymentMethods,
  calculatePaymentMethodStats,
  parseDateTimestamp,
} from '../lib/payment-ranking.ts'

console.log('====================================================')
console.log('  SAKUKILAT — UNIT TESTS: PAYMENT METHOD RANKING    ')
console.log('====================================================\n')

const sampleWallets = [
  { id: 'tunai', label: 'Tunai / Cash', balance: 500_000 },
  { id: 'bca', label: 'BCA', balance: 3_000_000 },
  { id: 'seabank', label: 'SeaBank', balance: 1_200_000 },
  { id: 'gopay', label: 'GoPay', balance: 250_000 },
  { id: 'ovo', label: 'OVO', balance: 180_000 },
  { id: 'dana', label: 'DANA', balance: 90_000 },
  { id: 'shopeepay', label: 'ShopeePay', balance: 75_000 },
  { id: 'tabungan', label: 'Tabungan', balance: 5_000_000 },
]

// ── Test 1: calculatePaymentMethodStats ──────────────────────────────────────
console.log('▶ Test 1: Usage frequency and last-used timestamp calculation...')
{
  const txHistory = [
    { paymentMethod: 'gopay', date: '2026-09-01T10:00:00Z' },
    { paymentMethod: 'gopay', date: '2026-09-05T14:00:00Z' },
    { paymentMethod: 'gopay', date: '2026-09-03T08:00:00Z' },
    { paymentMethod: 'bca', date: '2026-09-04T12:00:00Z' },
    { paymentMethod: 'ovo', date: '2026-09-02T16:00:00Z' },
  ]

  const stats = calculatePaymentMethodStats(sampleWallets, txHistory)
  const gopayStat = stats.find(s => s.id === 'gopay')
  const bcaStat = stats.find(s => s.id === 'bca')
  const tunaiStat = stats.find(s => s.id === 'tunai')

  assert.equal(gopayStat?.frequency, 3, 'GoPay should have frequency 3')
  assert.equal(
    gopayStat?.lastUsedTimestamp,
    new Date('2026-09-05T14:00:00Z').getTime(),
    'GoPay lastUsedTimestamp should be the maximum date'
  )
  assert.equal(bcaStat?.frequency, 1, 'BCA should have frequency 1')
  assert.equal(tunaiStat?.frequency, 0, 'Unused wallet should have frequency 0')
  assert.equal(tunaiStat?.lastUsedTimestamp, 0, 'Unused wallet should have lastUsedTimestamp 0')
  console.log('  ✓ Usage frequency and lastUsedTimestamp calculated accurately.')
}

// ── Test 2: Top 3 Frequent + Top 3 Recent Merge & Max 5 Bound ────────────────
console.log('▶ Test 2: Heuristic ranking: Top 3 Frequent + Top 3 Recent merged & sorted by recency...')
{
  // Setup 6 distinct wallets in history:
  // Frequencies: W1=10, W2=8, W3=6, W4=4, W5=2, W6=1
  // Dates (recency): W6 is newest, then W5, W4, W3, W2, W1 oldest
  const txs = [
    // W1 (tunai): freq 10, oldest (day 1)
    ...Array.from({ length: 10 }, () => ({ paymentMethod: 'tunai', date: '2026-09-01T10:00:00Z' })),
    // W2 (bca): freq 8, day 2
    ...Array.from({ length: 8 }, () => ({ paymentMethod: 'bca', date: '2026-09-02T10:00:00Z' })),
    // W3 (seabank): freq 6, day 3
    ...Array.from({ length: 6 }, () => ({ paymentMethod: 'seabank', date: '2026-09-03T10:00:00Z' })),
    // W4 (gopay): freq 4, day 4
    ...Array.from({ length: 4 }, () => ({ paymentMethod: 'gopay', date: '2026-09-04T10:00:00Z' })),
    // W5 (ovo): freq 2, day 5
    ...Array.from({ length: 2 }, () => ({ paymentMethod: 'ovo', date: '2026-09-05T10:00:00Z' })),
    // W6 (dana): freq 1, newest (day 6)
    { paymentMethod: 'dana', date: '2026-09-06T10:00:00Z' },
  ]

  // Top 3 frequent: tunai (10), bca (8), seabank (6)
  // Top 3 recent: dana (day 6), ovo (day 5), gopay (day 4)
  // Union = { dana, ovo, gopay, seabank, bca, tunai }
  // Sorted by recency first:
  // 1. dana (day 6)
  // 2. ovo (day 5)
  // 3. gopay (day 4)
  // 4. seabank (day 3)
  // 5. bca (day 2)
  // tunai (day 1) is 6th, so it falls into remainingMethods.

  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: txs,
  })

  assert.equal(result.compactMethods.length, 5, 'Compact methods must be bounded to maximum 5 items')
  assert.deepEqual(
    result.compactMethods.map(m => m.id),
    ['dana', 'ovo', 'gopay', 'seabank', 'bca'],
    'Compact methods must match recency-first sorted union bounded to 5 items'
  )
  assert.ok(
    result.remainingMethods.some(m => m.id === 'tunai'),
    'Tunai (6th in ranking) must be in remainingMethods'
  )
  console.log('  ✓ Top 3 frequent and top 3 recent successfully merged, sorted by recency, and bounded to 5.')
}

// ── Test 3: Populate remaining slots from active wallets if history < 5 ────────
console.log('▶ Test 3: Populating remaining slots when history has fewer than 5 methods...')
{
  const txs = [
    { paymentMethod: 'dana', date: '2026-09-10T10:00:00Z' },
    { paymentMethod: 'ovo', date: '2026-09-09T10:00:00Z' },
  ]

  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: txs,
  })

  assert.equal(result.compactMethods.length, 5, 'Must fill remaining slots up to 5 items')
  // First two must be dana (recent) and ovo
  assert.equal(result.compactMethods[0].id, 'dana')
  assert.equal(result.compactMethods[1].id, 'ovo')
  // Next 3 must be filled from default active wallets in order, skipping dana and ovo:
  // sampleWallets: [tunai, bca, seabank, gopay, ...]
  assert.equal(result.compactMethods[2].id, 'tunai')
  assert.equal(result.compactMethods[3].id, 'bca')
  assert.equal(result.compactMethods[4].id, 'seabank')

  // Check remaining wallets
  const expectedRemaining = ['gopay', 'shopeepay', 'tabungan']
  assert.deepEqual(
    result.remainingMethods.map(m => m.id),
    expectedRemaining,
    'Remaining methods should contain non-compact active wallets'
  )
  assert.equal(result.totalCount, sampleWallets.length)
  console.log('  ✓ Remaining slots successfully populated from default active wallets.')
}

// ── Test 4: Empty transaction history ─────────────────────────────────────────
console.log('▶ Test 4: Empty transaction history defaults to first 5 active wallets...')
{
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
  })

  assert.equal(result.compactMethods.length, 5)
  assert.deepEqual(
    result.compactMethods.map(m => m.id),
    ['tunai', 'bca', 'seabank', 'gopay', 'ovo']
  )
  assert.deepEqual(
    result.remainingMethods.map(m => m.id),
    ['dana', 'shopeepay', 'tabungan']
  )
  assert.equal(result.totalCount, 8)
  console.log('  ✓ Empty history handled cleanly with default wallet ordering.')
}

// ── Test 5: Fewer than 5 active wallets in total ──────────────────────────────
console.log('▶ Test 5: Fewer than 5 active wallets in total...')
{
  const miniWallets = [
    { id: 'tunai', label: 'Tunai', balance: 100_000 },
    { id: 'bca', label: 'BCA', balance: 500_000 },
    { id: 'gopay', label: 'GoPay', balance: 50_000 },
  ]

  const result = getCompactPaymentMethods({
    wallets: miniWallets,
    transactions: [],
  })

  assert.equal(result.compactMethods.length, 3, 'When total wallets < 5, return all in compact')
  assert.equal(result.remainingMethods.length, 0)
  assert.equal(result.totalCount, 3)
  console.log('  ✓ Total wallets < 5 correctly bounded to active wallet count.')
}

// ── Test 6: Edit Mode — Active Method Pinned into Visible Options ──────────────
console.log('▶ Test 6: Edit mode active method visibility...')
{
  // When activeMethodId is not in top 5 (e.g. 'tabungan' which is in remaining)
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    activeMethodId: 'tabungan',
  })

  assert.equal(result.compactMethods.length, 5, 'Compact methods must still be bounded to 5')
  assert.equal(result.compactMethods[0].id, 'tabungan', 'Tabungan must be pinned to index 0')
  assert.ok(
    result.compactMethods.some(m => m.id === 'tabungan'),
    'activeMethodId must be visible in compactMethods'
  )
  assert.ok(
    !result.remainingMethods.some(m => m.id === 'tabungan'),
    'activeMethodId must NOT be duplicated in remainingMethods'
  )
  assert.equal(result.totalCount, sampleWallets.length)

  // When activeMethodId is ALREADY in compactMethods (e.g. 'bca')
  const resultAlreadyVisible = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    activeMethodId: 'bca',
  })
  assert.ok(
    resultAlreadyVisible.compactMethods.some(m => m.id === 'bca'),
    'Already visible activeMethodId must remain in compactMethods'
  )
  assert.equal(resultAlreadyVisible.compactMethods.length, 5)

  // When activeMethodId is a hidden or deleted method
  const resultHidden = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    activeMethodId: 'old-custom-wallet',
  })
  assert.equal(resultHidden.compactMethods[0].id, 'old-custom-wallet', 'Unknown/deleted method is pinned with fallback')
  assert.equal(resultHidden.compactMethods.length, 5)

  console.log('  ✓ Edit mode activeMethodId pinning verified across all scenarios.')
}

// ── Test 7: Transfer Mode — All Wallets Returned Without 5-Item Bound ─────────
console.log('▶ Test 7: Transfer mode full wallet list without truncation...')
{
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    isTransferMode: true,
  })

  assert.equal(result.compactMethods.length, sampleWallets.length, 'All wallets must be returned in compactMethods')
  assert.equal(result.remainingMethods.length, 0, 'remainingMethods should be empty in transfer mode')
  assert.equal(result.totalCount, sampleWallets.length)
  console.log('  ✓ Transfer mode provides full wallet list without truncation.')
}

// ── Test 8: Hidden Payment Methods Non-Destructive Isolation ──────────────────
console.log('▶ Test 8: Hidden payment methods excluded from active selection...')
{
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [
      { paymentMethod: 'shopeepay', date: '2026-09-10T10:00:00Z' },
      { paymentMethod: 'shopeepay', date: '2026-09-09T10:00:00Z' },
    ],
    hiddenPaymentIds: ['shopeepay'],
  })

  assert.ok(
    !result.compactMethods.some(m => m.id === 'shopeepay'),
    'Hidden payment method ShopeePay must NOT be in compactMethods for new entry'
  )
  assert.ok(
    !result.remainingMethods.some(m => m.id === 'shopeepay'),
    'Hidden payment method ShopeePay must NOT be in remainingMethods'
  )
  assert.equal(result.totalCount, sampleWallets.length - 1)

  // But if editing an existing transaction paid with the hidden method:
  const editResult = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    hiddenPaymentIds: ['shopeepay'],
    activeMethodId: 'shopeepay',
  })
  assert.ok(
    editResult.compactMethods.some(m => m.id === 'shopeepay'),
    'Hidden method must be visible when editing an existing transaction that used it'
  )

  console.log('  ✓ Hidden payment method isolation verified.')
}

console.log('\n✅ SEMUA 8 UNIT TEST UNTUK PAYMENT METHOD RANKING BERHASIL LULUS!\n')
