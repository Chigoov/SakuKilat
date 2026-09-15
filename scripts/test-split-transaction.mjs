/**
 * SakuKilat — Split Transaction Validator & Distribution Engine Tests (Phase P11, Task 22.1)
 *
 * Verifies:
 * 1. SplitLineItem schema compliance (id, categoryId, subcategoryId, amount, note)
 * 2. Split sum validation: sum(splitItems.amount) === parentTransaction.amount (Requirement 11.2)
 * 3. Discrepancy calculation |parent - sum| and blocking save when sum !== parent (Requirement 11.3)
 * 4. Error messaging matching design format: "Selisih Rp{delta}. Total alokasi harus pas dengan transaksi induk."
 * 5. Input boundary handling: empty items, invalid categories, zero/negative amounts, parent <= 0
 * 6. Reporting distribution across individual split line items (Requirement 11.4)
 * 7. Retention of unified parent payment method and nominal in transaction ledger (Requirement 11.4)
 * 8. Category & subcategory distribution aggregates (distributeCategoryAmounts & slices)
 *
 * Jalankan: node scripts/test-split-transaction.mjs
 */

import {
  createSplitLineItem,
  calculateSplitTotal,
  calculateSplitDiscrepancy,
  validateSplitTransaction,
  canSaveSplitTransaction,
  isSplitTransaction,
  expandTransactionForReporting,
  expandTransactionsForReporting,
  distributeCategoryAmounts,
  distributeCategorySlices,
  distributeSubcategoryAmounts,
  SplitTransactionValidator,
} from '../lib/split-transaction.ts'

let passed = 0
let failed = 0
let total = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ FAIL: ${name}`)
    console.log(`    → ${e.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

console.log('=== Task 22.1: Split Transaction Validator & Distribution Engine Tests ===\n')

// ── Group 1: SplitLineItem Schema Compliance (Requirement 11.1) ──
console.log('Group 1: SplitLineItem Schema Compliance (Req 11.1)')

test('createSplitLineItem creates valid item with required fields', () => {
  const item = createSplitLineItem({
    categoryId: 'makanan',
    subcategoryId: 'Kopi & Nongkrong',
    amount: 35000,
    note: 'Kopi susu gula aren',
  })

  assert(typeof item.id === 'string' && item.id.startsWith('split-'), 'id should be generated')
  assertEqual(item.categoryId, 'makanan', 'categoryId')
  assertEqual(item.subcategoryId, 'Kopi & Nongkrong', 'subcategoryId')
  assertEqual(item.amount, 35000, 'amount')
  assertEqual(item.note, 'Kopi susu gula aren', 'note')
})

test('createSplitLineItem sanitizes whitespace and rounds amount', () => {
  const item = createSplitLineItem({
    id: 'custom-split-1',
    categoryId: '  belanja  ',
    subcategoryId: '   ',
    amount: 49999.7,
    note: '   ',
  })

  assertEqual(item.id, 'custom-split-1', 'custom id preserved')
  assertEqual(item.categoryId, 'belanja', 'trimmed categoryId')
  assertEqual(item.subcategoryId, undefined, 'empty subcategory converted to undefined')
  assertEqual(item.amount, 50000, 'amount rounded to nearest integer')
  assertEqual(item.note, undefined, 'empty note converted to undefined')
})

// ── Group 2: Split Total & Discrepancy Math (Requirements 11.2, 11.3) ──
console.log('\nGroup 2: Split Total & Discrepancy Math (Req 11.2, 11.3)')

test('calculateSplitTotal sums all item amounts correctly', () => {
  const items = [
    createSplitLineItem({ categoryId: 'makanan', amount: 50000 }),
    createSplitLineItem({ categoryId: 'transportasi', amount: 25000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 75000 }),
  ]
  const total = calculateSplitTotal(items)
  assertEqual(total, 150000, 'Total of 50k + 25k + 75k')
})

test('calculateSplitTotal handles empty, null, and malformed inputs gracefully', () => {
  assertEqual(calculateSplitTotal([]), 0, 'Empty array')
  assertEqual(calculateSplitTotal(null), 0, 'Null input')
  assertEqual(calculateSplitTotal(undefined), 0, 'Undefined input')
  assertEqual(calculateSplitTotal([null, { amount: -100 }, { amount: 5000 }]), 5000, 'Ignores null and negative')
})

test('calculateSplitDiscrepancy computes exact absolute difference |parent - sum|', () => {
  const itemsUnder = [
    createSplitLineItem({ categoryId: 'makanan', amount: 40000 }),
  ]
  assertEqual(calculateSplitDiscrepancy(100000, itemsUnder), 60000, 'Underallocated discrepancy: 100k - 40k = 60k')

  const itemsOver = [
    createSplitLineItem({ categoryId: 'makanan', amount: 70000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 50000 }),
  ]
  assertEqual(calculateSplitDiscrepancy(100000, itemsOver), 20000, 'Overallocated discrepancy: |100k - 120k| = 20k')

  const itemsExact = [
    createSplitLineItem({ categoryId: 'makanan', amount: 60000 }),
    createSplitLineItem({ categoryId: 'transportasi', amount: 40000 }),
  ]
  assertEqual(calculateSplitDiscrepancy(100000, itemsExact), 0, 'Balanced discrepancy: 0')
})

// ── Group 3: Validation Engine & Save Blocking (Requirements 11.2, 11.3, Property 30) ──
console.log('\nGroup 3: Validation Engine & Save Blocking (Req 11.2, 11.3, Property 30)')

test('Balanced split validation passes with canSave === true and zero discrepancy', () => {
  const parentAmount = 250000
  const items = [
    createSplitLineItem({ categoryId: 'makanan', amount: 100000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 150000 }),
  ]

  const result = validateSplitTransaction(parentAmount, items)
  assertEqual(result.isValid, true, 'isValid')
  assertEqual(result.canSave, true, 'canSave')
  assertEqual(result.totalSplitAmount, 250000, 'totalSplitAmount')
  assertEqual(result.parentAmount, 250000, 'parentAmount')
  assertEqual(result.discrepancy, 0, 'discrepancy')
  assertEqual(result.isBalanced, true, 'isBalanced')
  assertEqual(result.isUnderAllocated, false, 'isUnderAllocated')
  assertEqual(result.isOverAllocated, false, 'isOverAllocated')
  assertEqual(result.errorMessage, undefined, 'No error message')
  assertEqual(canSaveSplitTransaction(parentAmount, items), true, 'canSaveSplitTransaction')
})

test('Under-allocated split is blocked with exact discrepancy error message', () => {
  const parentAmount = 200000
  const items = [
    createSplitLineItem({ categoryId: 'makanan', amount: 150000 }),
  ]

  const result = validateSplitTransaction(parentAmount, items)
  assertEqual(result.isValid, false, 'isValid')
  assertEqual(result.canSave, false, 'canSave blocked')
  assertEqual(result.totalSplitAmount, 150000, 'totalSplitAmount')
  assertEqual(result.discrepancy, 50000, 'discrepancy')
  assertEqual(result.isUnderAllocated, true, 'isUnderAllocated')
  assertEqual(result.isBalanced, false, 'isBalanced')
  assert(result.errorMessage?.includes('Selisih Rp50.000'), 'Error message contains formatted discrepancy')
  assert(result.errorMessage?.includes('Total alokasi harus pas dengan transaksi induk'), 'Error matches design message')
  assertEqual(canSaveSplitTransaction(parentAmount, items), false, 'canSaveSplitTransaction blocked')
})

test('Over-allocated split is blocked with exact discrepancy error message', () => {
  const parentAmount = 100000
  const items = [
    createSplitLineItem({ categoryId: 'makanan', amount: 80000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 45000 }),
  ]

  const result = validateSplitTransaction(parentAmount, items)
  assertEqual(result.isValid, false, 'isValid')
  assertEqual(result.canSave, false, 'canSave blocked')
  assertEqual(result.totalSplitAmount, 125000, 'totalSplitAmount')
  assertEqual(result.discrepancy, 25000, 'discrepancy')
  assertEqual(result.isOverAllocated, true, 'isOverAllocated')
  assertEqual(result.isBalanced, false, 'isBalanced')
  assert(result.errorMessage?.includes('Selisih Rp25.000'), 'Error message contains formatted discrepancy')
  assertEqual(canSaveSplitTransaction(parentAmount, items), false, 'canSaveSplitTransaction blocked')
})

test('Split with empty line item list is blocked', () => {
  const result = validateSplitTransaction(100000, [])
  assertEqual(result.isValid, false, 'isValid false')
  assertEqual(result.canSave, false, 'canSave false')
  assertEqual(result.totalSplitAmount, 0, 'totalSplitAmount 0')
  assertEqual(result.discrepancy, 100000, 'discrepancy 100k')
  assert(result.errorMessage?.includes('Minimal harus ada satu rincian'), 'Error on empty items')
})

test('Split with missing category in any line item is blocked', () => {
  const items = [
    createSplitLineItem({ categoryId: 'makanan', amount: 50000 }),
    createSplitLineItem({ categoryId: '', amount: 50000 }), // missing category
  ]
  const result = validateSplitTransaction(100000, items)
  assertEqual(result.isValid, false, 'isValid false')
  assertEqual(result.hasEmptyCategory, true, 'hasEmptyCategory flag')
  assert(result.errorMessage?.includes('kategori yang dipilih'), 'Error on empty category')
})

test('Split with zero or negative line item amount is blocked', () => {
  const items = [
    createSplitLineItem({ categoryId: 'makanan', amount: 100000 }),
    { id: 'zero-split', categoryId: 'belanja', amount: 0 },
  ]
  const result = validateSplitTransaction(100000, items)
  assertEqual(result.isValid, false, 'isValid false')
  assertEqual(result.hasInvalidAmount, true, 'hasInvalidAmount flag')
  assert(result.errorMessage?.includes('lebih besar dari Rp0'), 'Error on zero amount')
})

test('Non-positive parent nominal is blocked', () => {
  const items = [createSplitLineItem({ categoryId: 'makanan', amount: 50000 })]
  const result = validateSplitTransaction(0, items)
  assertEqual(result.isValid, false, 'isValid false')
  assert(result.errorMessage?.includes('lebih besar dari Rp0'), 'Error on parent <= 0')
})

// ── Group 4: Category Distribution Engine (Requirements 11.4, 11.5, Property 31) ──
console.log('\nGroup 4: Category Distribution Engine (Req 11.4, 11.5, Property 31)')

test('isSplitTransaction accurately detects presence of splitItems', () => {
  assertEqual(isSplitTransaction({ splitItems: [] }), false, 'Empty splitItems is not split')
  assertEqual(isSplitTransaction({}), false, 'No splitItems is not split')
  assertEqual(isSplitTransaction(null), false, 'Null is not split')
  assertEqual(isSplitTransaction({
    splitItems: [createSplitLineItem({ categoryId: 'makanan', amount: 10000 })],
  }), true, 'Non-empty splitItems is split')
})

test('expandTransactionForReporting returns single item for non-split transaction', () => {
  const date = new Date('2026-06-15T12:00:00')
  const tx = {
    id: 'txn-normal-1',
    description: 'Beli makan',
    amount: 35000,
    type: 'expense',
    category: 'makanan',
    subcategory: 'Makan Siang',
    paymentMethod: 'gopay',
    date,
    note: 'Soto ayam',
  }

  const expanded = expandTransactionForReporting(tx)
  assertEqual(expanded.length, 1, 'Length 1')
  assertEqual(expanded[0].transactionId, 'txn-normal-1', 'transactionId')
  assertEqual(expanded[0].category, 'makanan', 'category')
  assertEqual(expanded[0].subcategory, 'Makan Siang', 'subcategory')
  assertEqual(expanded[0].amount, 35000, 'amount')
  assertEqual(expanded[0].paymentMethod, 'gopay', 'paymentMethod')
  assertEqual(expanded[0].isSplitChild, false, 'isSplitChild')
})

test('expandTransactionForReporting distributes split items while preserving parent payment method and ID', () => {
  const date = new Date('2026-06-15T14:30:00')
  const tx = {
    id: 'txn-split-parent',
    description: 'Belanja supermarket',
    amount: 300000,
    type: 'expense',
    category: 'belanja',
    paymentMethod: 'bca', // Unified parent payment method
    date,
    note: 'Struk supermarket',
    splitItems: [
      createSplitLineItem({ id: 's1', categoryId: 'makanan', subcategoryId: 'Bahan Dapur', amount: 180000, note: 'Beras & sayur' }),
      createSplitLineItem({ id: 's2', categoryId: 'kesehatan', subcategoryId: 'Vitamin', amount: 70000, note: 'Vitamin C' }),
      createSplitLineItem({ id: 's3', categoryId: 'belanja', subcategoryId: 'Kebutuhan Rumah', amount: 50000, note: 'Sabun & deterjen' }),
    ],
  }

  const expanded = expandTransactionForReporting(tx)
  assertEqual(expanded.length, 3, '3 expanded split items')

  // Sum of expanded items equals parent amount
  const sumAmounts = expanded.reduce((sum, item) => sum + item.amount, 0)
  assertEqual(sumAmounts, tx.amount, 'Sum of split items equals parent amount')

  // Every child item preserves parent transaction ID and payment method
  for (const item of expanded) {
    assertEqual(item.transactionId, 'txn-split-parent', 'Inherits parent transaction ID')
    assertEqual(item.paymentMethod, 'bca', 'Inherits unified parent payment method')
    assertEqual(item.date, date, 'Inherits parent date')
    assertEqual(item.isSplitChild, true, 'isSplitChild flag')
    assertEqual(item.parentCategory, 'belanja', 'parentCategory')
    assertEqual(item.parentAmount, 300000, 'parentAmount')
  }

  // Individual split attributes are properly assigned
  assertEqual(expanded[0].category, 'makanan', 'Item 1 category')
  assertEqual(expanded[0].subcategory, 'Bahan Dapur', 'Item 1 subcategory')
  assertEqual(expanded[0].amount, 180000, 'Item 1 amount')
  assertEqual(expanded[0].note, 'Beras & sayur', 'Item 1 note')

  assertEqual(expanded[1].category, 'kesehatan', 'Item 2 category')
  assertEqual(expanded[1].subcategory, 'Vitamin', 'Item 2 subcategory')
  assertEqual(expanded[1].amount, 70000, 'Item 2 amount')

  assertEqual(expanded[2].category, 'belanja', 'Item 3 category')
  assertEqual(expanded[2].subcategory, 'Kebutuhan Rumah', 'Item 3 subcategory')
  assertEqual(expanded[2].amount, 50000, 'Item 3 amount')
})

test('distributeCategoryAmounts calculates correct totals across mixed normal and split transactions', () => {
  const date = new Date()
  const transactions = [
    // Normal transaction: 50k makanan
    { id: 't1', amount: 50000, type: 'expense', category: 'makanan', paymentMethod: 'tunai', date },
    // Split transaction: 150k total (100k makanan + 50k hiburan)
    {
      id: 't2',
      amount: 150000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'gopay',
      date,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 100000 }),
        createSplitLineItem({ categoryId: 'hiburan', amount: 50000 }),
      ],
    },
    // Normal transaction: 75k hiburan
    { id: 't3', amount: 75000, type: 'expense', category: 'hiburan', paymentMethod: 'bca', date },
    // Transfer move: should be ignored in category expense distribution
    { id: 't4', amount: 200000, type: 'expense', category: 'transfer', kind: 'transfer', paymentMethod: 'bca', date },
  ]

  const totals = distributeCategoryAmounts(transactions, 'expense')
  assertEqual(totals.get('makanan'), 150000, 'Makanan total: 50k (t1) + 100k (t2 split) = 150k')
  assertEqual(totals.get('hiburan'), 125000, 'Hiburan total: 50k (t2 split) + 75k (t3) = 125k')
  assertEqual(totals.get('transfer'), undefined, 'Transfer excluded')
})

test('distributeCategorySlices returns sorted slices with accurate percentages', () => {
  const date = new Date()
  const transactions = [
    {
      id: 't1',
      amount: 100000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'dana',
      date,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 60000 }),
        createSplitLineItem({ categoryId: 'transportasi', amount: 40000 }),
      ],
    },
  ]

  const slices = distributeCategorySlices(transactions, 'expense')
  assertEqual(slices.length, 2, '2 category slices')
  assertEqual(slices[0].category, 'makanan', 'Top category is makanan (60k)')
  assertEqual(slices[0].total, 60000, 'Makanan total')
  assertEqual(slices[0].pct, 0.6, 'Makanan pct 60%')
  assertEqual(slices[1].category, 'transportasi', 'Second category is transportasi (40k)')
  assertEqual(slices[1].total, 40000, 'Transportasi total')
  assertEqual(slices[1].pct, 0.4, 'Transportasi pct 40%')
})

test('distributeSubcategoryAmounts breaks down subcategories within a category', () => {
  const date = new Date()
  const transactions = [
    {
      id: 't1',
      amount: 120000,
      type: 'expense',
      category: 'makanan',
      paymentMethod: 'bca',
      date,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Kopi', amount: 40000 }),
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Makan Siang', amount: 80000 }),
      ],
    },
    {
      id: 't2',
      amount: 25000,
      type: 'expense',
      category: 'makanan',
      subcategory: 'Kopi',
      paymentMethod: 'tunai',
      date,
    },
  ]

  const subTotals = distributeSubcategoryAmounts(transactions, 'makanan', 'expense')
  assertEqual(subTotals.get('Kopi'), 65000, 'Kopi subcategory: 40k + 25k = 65k')
  assertEqual(subTotals.get('Makan Siang'), 80000, 'Makan Siang subcategory: 80k')
})

test('SplitTransactionValidator static class provides all core functions', () => {
  assertEqual(typeof SplitTransactionValidator.createLineItem, 'function', 'createLineItem')
  assertEqual(typeof SplitTransactionValidator.calculateTotal, 'function', 'calculateTotal')
  assertEqual(typeof SplitTransactionValidator.calculateDiscrepancy, 'function', 'calculateDiscrepancy')
  assertEqual(typeof SplitTransactionValidator.validate, 'function', 'validate')
  assertEqual(typeof SplitTransactionValidator.canSave, 'function', 'canSave')
  assertEqual(typeof SplitTransactionValidator.isSplit, 'function', 'isSplit')
  assertEqual(typeof SplitTransactionValidator.expandTransaction, 'function', 'expandTransaction')
  assertEqual(typeof SplitTransactionValidator.expandTransactions, 'function', 'expandTransactions')
  assertEqual(typeof SplitTransactionValidator.distributeCategoryAmounts, 'function', 'distributeCategoryAmounts')
  assertEqual(typeof SplitTransactionValidator.distributeCategorySlices, 'function', 'distributeCategorySlices')
  assertEqual(typeof SplitTransactionValidator.distributeSubcategoryAmounts, 'function', 'distributeSubcategoryAmounts')
})

// ── Summary ──
console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some Task 22.1 tests failed!')
  process.exit(1)
} else {
  console.log('✅ All Task 22.1 Split Transaction tests passed!')
}
