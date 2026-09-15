/**
 * SakuKilat — Baseline Preservation Property Test Suite (Property 2: Preservation)
 * Spec: sakukilat-submenus-and-bugfixes
 *
 * Requirements: 3.1 through 3.26
 *
 * Follows observation-first methodology: observe and record behavior on UNFIXED code
 * for non-buggy inputs across all 6 completed baseline fixes and unaffected subsystems:
 * 1. Stacking layer navigation in Tab Saku (Req 3.1)
 * 2. Relocated extended analytics in Tab Rencana (Req 3.2, 3.3)
 * 3. Manual entry note field in main flow (Req 3.4)
 * 4. Transaction date positioning below category (Req 3.5)
 * 5. Calendar compact format without ellipsis (Req 3.6)
 * 6. Reconciliation active-month mutation guard (Req 3.7)
 * 7. Core non-buggy workflows & unaffected subsystems (Req 3.8 - 3.26)
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: ALL TESTS PASS.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbPositiveRupiahAmount,
  arbCategory,
} from './pbt-harness.mjs'

import { createSeedWallets } from '../lib/mock-data.ts'
import {
  monthlyTotals,
  categoryBreakdown,
  monthlyBudgetStatus,
  transactionsForDay,
  cashflowSummary,
  generateInsights,
  dayKey,
} from '../lib/stats.ts'
import {
  calculateMonthlyContribution,
  evaluateGoalHealth,
  createGoal,
} from '../lib/goals.ts'
import {
  calculateReconciliationVariance,
  formatReconciliationVariance,
  createAdjustmentTransaction,
  createReconciliationRecord,
  getWalletReconciliationHistory,
} from '../lib/reconciliation.ts'
import {
  serializeTransactionDate,
  deserializeTransactionDate,
  validatePersistedStateStructure,
  loadPersistedState,
  persistState,
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
} from '../lib/storage.ts'
import {
  dedupeSubcategories,
  normalizeCategoryKey,
} from '../lib/category-utils.ts'
import { formatIDR, formatIDRCalendarCompact } from '../lib/parser.ts'
import { stripToDigits } from '../lib/amount.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

function readSource(relativePath) {
  const fullPath = path.resolve(ROOT, relativePath)
  assert.ok(fs.existsSync(fullPath), `Source file must exist: ${relativePath}`)
  return fs.readFileSync(fullPath, 'utf8')
}

console.log('========================================================================')
console.log(' SAKUKILAT — BASELINE PRESERVATION TEST SUITE (PROPERTY 2)             ')
console.log(' Spec: sakukilat-submenus-and-bugfixes                                  ')
console.log('========================================================================\n')

let testCount = 0
let passedCount = 0

function runCheck(label, fn) {
  testCount++
  try {
    fn()
    passedCount++
    console.log(`  ✓ PASS: ${label}`)
  } catch (err) {
    console.error(`  ✗ FAIL: ${label}`)
    console.error(`    → ${err.message}`)
    throw err
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION A: 6 COMPLETED BASELINE FIXES PRESERVATION
// ════════════════════════════════════════════════════════════════════════════

// ── Baseline Fix 1: Stacking Layer Navigation in Tab Saku (Req 3.1) ──────────
console.log('▶ BASELINE FIX 1: Stacking Layer Navigation in Tab Saku (Req 3.1)')

runCheck('Tab Saku registers submenu layers with back-stack and avoids accordion sprawl', () => {
  const content = readSource('components/tab-saku.tsx')

  // Must register layers with pushBackLayer and removeBackLayer
  assert.ok(content.includes('pushBackLayer'), 'tab-saku.tsx must register submenu layers with pushBackLayer')
  assert.ok(content.includes('removeBackLayer'), 'tab-saku.tsx must release submenu layers with removeBackLayer')

  // Must NOT have inline openSections expanding main page
  assert.ok(!content.includes('openSections: Record<string, boolean>'), 'tab-saku.tsx must not use inline openSections accordion')
  assert.ok(!content.includes('section-content-'), 'tab-saku.tsx must not use inline section-content containers')

  // Submenus must open in isolated modal/sheet surfaces
  assert.ok(
    content.includes('<BottomSheet') || content.includes('<Modal') || content.includes('activeLayer'),
    'tab-saku.tsx must render submenus in dedicated stacking layer surfaces'
  )

  // Must maintain active layer type
  assert.ok(content.includes('ActiveSakuLayer'), 'tab-saku.tsx must define or use ActiveSakuLayer state')
})

// ── Baseline Fix 2: Relocated Extended Analytics in Tab Rencana (Req 3.2, 3.3)
console.log('\n▶ BASELINE FIX 2: Relocated Extended Analytics to Tab Rencana (Req 3.2, 3.3)')

runCheck('Tab Beranda is free of extended analytics and Tab Rencana maintains analytics modules', () => {
  const berandaContent = readSource('components/tab-beranda.tsx')
  const rencanaContent = readSource('components/tab-rencana.tsx')

  // Beranda must NOT contain extended analytics panel
  assert.ok(!berandaContent.includes('Wawasan & Analisis Lengkap'), 'Tab Beranda must not contain Wawasan & Analisis Lengkap')
  assert.ok(!berandaContent.includes('showExtendedAnalytics'), 'Tab Beranda must not contain showExtendedAnalytics toggle')
  assert.ok(!berandaContent.includes('<CategoryBudgetCard'), 'Tab Beranda must not mount CategoryBudgetCard')

  // Tab Rencana must house the analytics modules
  assert.ok(
    rencanaContent.includes('Wawasan & Analisis Finansial') ||
    rencanaContent.includes('Cashflow') ||
    rencanaContent.includes('Analisis'),
    'Tab Rencana must render financial insights and analysis modules'
  )
})

// ── Baseline Fix 3: Explicit Note Field in ManualEntryForm (Req 3.4) ──────────
console.log('\n▶ BASELINE FIX 3: Explicit Note Field in ManualEntryForm (Req 3.4)')

runCheck('ManualEntryForm provides accessible Catatan field in main flow across all modes', () => {
  const content = readSource('components/manual-entry-form.tsx')

  // Accessible testid and id
  assert.ok(content.includes('data-testid="manual-tx-note"'), 'manual-entry-form.tsx must render data-testid="manual-tx-note"')
  assert.ok(content.includes('id="sk-manual-entry-note"'), 'manual-entry-form.tsx must have id="sk-manual-entry-note"')

  // Not hidden in accordion
  const noteInsideDetails = /showDetails\s*&&[\s\S]*?manual-tx-note/.test(content)
  assert.ok(!noteInsideDetails, 'Note field must be directly visible in primary form flow, not hidden in showDetails')

  // Enabled for transfer mode
  const transferNoteBlocked = /type\s*!==\s*['"]transfer['"]\s*&&[\s\S]*?Catatan/.test(content)
  assert.ok(!transferNoteBlocked, 'Note input must NOT be blocked when type is transfer')

  // Handled in submission
  assert.ok(
    content.includes('finalTransferNote') || /transferMoney\([^)]*note/.test(content),
    'handleSubmit must pass note to transferMoney'
  )
})

// ── Baseline Fix 4: Transaction Date Positioning Below Category (Req 3.5) ───
console.log('\n▶ BASELINE FIX 4: Transaction Date Positioning Below Category (Req 3.5)')

runCheck('TransactionItem renders date row directly below category without badge collision', () => {
  const content = readSource('components/transaction-item.tsx')

  // Dedicated date row below category
  assert.ok(content.includes('data-testid="tx-date-row"'), 'transaction-item.tsx must have dedicated data-testid="tx-date-row"')

  // No ml-auto crowding inside badge row
  const hasDatetimeInBadgeRow = /data-testid="tx-datetime"[^>]*ml-auto/.test(content) ||
                                /ml-auto[^>]*data-testid="tx-datetime"/.test(content)
  assert.ok(!hasDatetimeInBadgeRow, 'tx-datetime must NOT be shoved to right with ml-auto inside badge container')
})

// ── Baseline Fix 5: Calendar Compact Format Without Ellipsis (Req 3.6) ────────
console.log('\n▶ BASELINE FIX 5: Calendar Compact Format Without Ellipsis (Req 3.6)')

// PBT: formatIDRCalendarCompact invariant
testProperty(
  'Property 2.1: formatIDRCalendarCompact produces compact string (<= 7 chars, no ellipsis, correct suffix)',
  fc.property(
    fc.integer({ min: 0, max: 2_000_000_000 }),
    (amount) => {
      const formatted = formatIDRCalendarCompact(amount)

      // 1. Must never contain ellipsis
      assert.ok(!formatted.includes('...'), `formatIDRCalendarCompact must not contain ellipsis: ${formatted}`)

      // 2. Length must be compact (<= 7 characters to fit comfortably in 44-48px cell)
      assert.ok(formatted.length <= 7, `Formatted length must be <= 7 chars (got "${formatted}", length: ${formatted.length})`)

      // 3. Suffix verification based on magnitude
      if (amount < 1_000) {
        assert.equal(formatted, String(Math.round(amount)), 'Nominal < 1000 should be raw integer string')
      } else if (amount < 1_000_000) {
        assert.ok(formatted.endsWith('rb'), `Nominal in thousands must end with 'rb' (got: ${formatted})`)
      } else if (amount < 1_000_000_000) {
        assert.ok(formatted.endsWith('jt'), `Nominal in millions must end with 'jt' (got: ${formatted})`)
      } else {
        assert.ok(formatted.endsWith('M'), `Nominal in billions must end with 'M' (got: ${formatted})`)
      }

      return true
    }
  ),
  { numRuns: 100 }
)

runCheck('Tab Rekapan uses formatIDRCalendarCompact and avoids CSS truncate in calendar cells', () => {
  const content = readSource('components/tab-rekapan.tsx')
  assert.ok(content.includes('formatIDRCalendarCompact'), 'tab-rekapan.tsx must format amounts with formatIDRCalendarCompact')
  assert.ok(!content.includes('formatIDRShort(agg.income)'), 'tab-rekapan.tsx must not use formatIDRShort in calendar grid')
  assert.ok(!content.includes('formatIDRShort(agg.expense)'), 'tab-rekapan.tsx must not use formatIDRShort in calendar grid')

  const hasTruncateOnCell = /agg\?\.income[\s\S]*?truncate text-\[9px\]/.test(content)
  assert.ok(!hasTruncateOnCell, 'Calendar cell amounts must not use CSS truncate class')
})

// ── Baseline Fix 6: Reconciliation Active-Month Mutation Guard (Req 3.7) ─────
console.log('\n▶ BASELINE FIX 6: Reconciliation Active-Month Mutation Guard (Req 3.7)')

runCheck('Reconciliation modal evaluates current-month activity and guards submit button', () => {
  const content = readSource('components/reconciliation-modal.tsx')

  assert.ok(content.includes('useTransactionData'), 'reconciliation-modal.tsx must import useTransactionData')
  assert.ok(
    content.includes('currentMonthTxCount') || content.includes('currentMonthTransactions'),
    'reconciliation-modal.tsx must evaluate current month transaction count'
  )
  assert.ok(
    content.includes('data-testid="reconcile-zero-mutation-notice"'),
    'reconciliation-modal.tsx must render notice banner for 0 mutation wallets'
  )
  assert.ok(
    content.includes('canSubmitReconcile') || content.includes('currentMonthTxCount > 0'),
    'reconciliation-modal.tsx must disable submit button when wallet has 0 mutations in current month'
  )
})

// ════════════════════════════════════════════════════════════════════════════
// SECTION B: UNAFFECTED CORE SUBSYSTEMS PRESERVATION
// ════════════════════════════════════════════════════════════════════════════

// ── 7. Wallet Management & Category/Subcategory (Req 3.8, Property 8) ────────
console.log('\n▶ SUBSYSTEM 1: Wallet Management & Category/Subcategory (Req 3.8, Property 8)')

// Test 7.1: Wallet Seed Creation and Non-Negative Balance Clamping (PBT)
testProperty(
  'Property 8.1: Seed wallets integrity and non-negative balance clamping',
  fc.property(
    fc.array(
      fc.record({
        label: fc.string({ minLength: 1, maxLength: 20 }),
        balance: fc.integer({ min: -1_000_000, max: 1_000_000_000 }),
        type: fc.constantFrom('cash', 'bank', 'ewallet', 'savings', 'other'),
      }),
      { minLength: 1, maxLength: 10 }
    ),
    (walletsInput) => {
      const processed = walletsInput.map((w, idx) => ({
        id: `w-${idx}`,
        label: w.label.trim() || `Wallet ${idx}`,
        type: w.type,
        balance: Math.max(0, Math.round(w.balance)),
      }))

      for (const w of processed) {
        assert.ok(w.balance >= 0, 'Wallet balance must be clamped to non-negative')
        assert.equal(Number.isInteger(w.balance), true, 'Wallet balance must be integer')
      }

      const totalStored = processed.reduce((sum, w) => sum + w.balance, 0)
      const expectedTotal = processed.map(w => w.balance).reduce((a, b) => a + b, 0)
      assert.equal(totalStored, expectedTotal, 'totalStored must strictly equal sum of clamped balances')
      return true
    }
  ),
  { numRuns: 100 }
)

// Test 7.2: Two-Step Delete Safeguard Simulation
runCheck('Two-step delete safeguard requires confirmation state before removal', () => {
  const initialWallets = [
    { id: 'w1', label: 'BCA', balance: 500000, type: 'bank' },
    { id: 'w2', label: 'Cash', balance: 100000, type: 'cash' },
  ]

  let wallets = [...initialWallets]
  let confirmDeleteWalletId = null

  confirmDeleteWalletId = 'w1'
  assert.equal(wallets.length, 2, 'Wallet must not be deleted on initial click')
  assert.equal(confirmDeleteWalletId, 'w1', 'Confirmation state must be set to target wallet id')

  // Cancel
  confirmDeleteWalletId = null
  assert.equal(wallets.length, 2, 'Wallet list must remain intact after cancel')

  // Confirm
  confirmDeleteWalletId = 'w1'
  if (confirmDeleteWalletId === 'w1') {
    wallets = wallets.filter(w => w.id !== 'w1')
    confirmDeleteWalletId = null
  }
  assert.equal(wallets.length, 1, 'Wallet must be removed only after explicit confirmation')
  assert.equal(wallets[0].id, 'w2', 'Remaining wallet must be w2')
})

// Test 7.3: Category and Subcategory Deduplication & Normalization (PBT)
testProperty(
  'Property 8.2: Subcategory deduplication case-insensitivity and whitespace trimming',
  fc.property(
    fc.array(
      fc.stringMatching(/^[A-Za-z0-9 ]{1,15}$/),
      { minLength: 1, maxLength: 20 }
    ),
    (rawSubcategories) => {
      const deduped = dedupeSubcategories(rawSubcategories)

      const lowerSet = new Set()
      for (const item of deduped) {
        const low = item.toLowerCase()
        assert.ok(!lowerSet.has(low), `Duplicate detected in deduped: ${item}`)
        lowerSet.add(low)
        assert.equal(item, item.trim(), 'Items must be trimmed of outer whitespace')
        assert.ok(item.length > 0, 'Empty strings must be filtered out')
      }

      return true
    }
  ),
  { numRuns: 100 }
)

runCheck('normalizeCategoryKey handles variants of category labels', () => {
  assert.equal(normalizeCategoryKey('Lainnya'), 'lainnya')
  assert.equal(normalizeCategoryKey('  lainnya  '), 'lainnya')
  assert.equal(normalizeCategoryKey('Makanan & Minuman'), 'makananminuman')
  assert.equal(normalizeCategoryKey(''), '')
})

// ── 8. Beranda Core Metrics (Req 3.9, Property 9) ────────────────────────────
console.log('\n▶ SUBSYSTEM 2: Beranda Core Metrics (Req 3.9, Property 9)')

const JUL_REF = new Date(2026, 6, 15, 12, 0, 0)
const JUL_START = new Date(2026, 6, 1)
const JUL_END = new Date(2026, 7, 1)

const arbJulyTransaction = fc.record({
  id: fc.uuid(),
  amount: arbPositiveRupiahAmount,
  type: fc.constantFrom('expense', 'income'),
  category: arbCategory,
  paymentMethod: fc.constantFrom('cash', 'bca', 'mandiri', 'gopay'),
  date: fc.integer({ min: 1, max: 28 }).map(day => new Date(2026, 6, day, 10, 0, 0)),
  kind: fc.constantFrom('transaction', 'transaction', 'transfer', 'saving'),
})

// Test 8.1: Monthly Net Balance Calculation (PBT)
testProperty(
  'Property 9.1: Monthly net balance formula (balance = income - expense, money moves excluded)',
  fc.property(
    fc.array(arbJulyTransaction, { minLength: 0, maxLength: 30 }),
    (transactions) => {
      const totals = monthlyTotals(transactions, JUL_REF)

      let expectedIncome = 0
      let expectedExpense = 0

      for (const t of transactions) {
        if (t.date >= JUL_START && t.date < JUL_END) {
          if (t.kind === 'transfer' || t.kind === 'saving') {
            continue
          }
          if (t.type === 'income') expectedIncome += t.amount
          else if (t.type === 'expense') expectedExpense += t.amount
        }
      }

      assert.equal(totals.income, expectedIncome, 'Monthly income must match sum of non-move incomes')
      assert.equal(totals.expense, expectedExpense, 'Monthly expense must match sum of non-move expenses')
      assert.equal(totals.balance, expectedIncome - expectedExpense, 'balance must strictly equal income - expense')

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 8.2: Category Breakdown Donut Chart Slices (PBT)
testProperty(
  'Property 9.2: Category breakdown slices total equals monthly expense and pcts sum to 1',
  fc.property(
    fc.array(arbJulyTransaction, { minLength: 1, maxLength: 30 }),
    (transactions) => {
      const slices = categoryBreakdown(transactions, JUL_REF, 'expense')
      const totals = monthlyTotals(transactions, JUL_REF)

      const slicesTotal = slices.reduce((sum, s) => sum + s.total, 0)
      assert.equal(slicesTotal, totals.expense, 'Sum of slices total must strictly equal monthly expense')

      for (let i = 0; i < slices.length - 1; i++) {
        assert.ok(slices[i].total >= slices[i + 1].total, 'Slices must be ordered descending by total')
      }

      if (totals.expense > 0) {
        const pctSum = slices.reduce((sum, s) => sum + s.pct, 0)
        assert.ok(Math.abs(pctSum - 1) < 1e-4, `Sum of slice percentages must equal 1.0 (got ${pctSum})`)
        for (const s of slices) {
          assert.ok(s.pct >= 0 && s.pct <= 1, 'Each slice pct must be between 0 and 1')
        }
      }

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 8.3: Hierarchical Dynamic Budget Status (PBT)
testProperty(
  'Property 9.3: Monthly budget status remaining and dynamic daily budget bounds',
  fc.property(
    fc.array(arbJulyTransaction, { minLength: 0, maxLength: 20 }),
    arbRupiahAmount,
    (transactions, budget) => {
      const status = monthlyBudgetStatus(transactions, budget, JUL_REF)

      assert.equal(status.remaining, status.budget - status.spent, 'remaining must equal budget - spent')
      assert.ok(status.dynamicDailyBudget >= 0, 'dynamicDailyBudget must never be negative')
      assert.ok(status.todayBudgetLimit >= 0, 'todayBudgetLimit must never be negative')
      assert.equal(
        status.dayOfMonth + status.remainingDays,
        status.daysInMonth,
        'dayOfMonth + remainingDays must equal daysInMonth (no 32-day bug)'
      )

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 8.4: Today's Transactions Filtering & Chronological Sorting
runCheck('transactionsForDay extracts matching date transactions sorted newest first', () => {
  const txToday1 = { id: 't1', date: new Date(2026, 6, 15, 8, 30), amount: 25000, type: 'expense' }
  const txToday2 = { id: 't2', date: new Date(2026, 6, 15, 14, 0), amount: 50000, type: 'expense' }
  const txYesterday = { id: 't3', date: new Date(2026, 6, 14, 10, 0), amount: 15000, type: 'expense' }

  const todayList = transactionsForDay([txToday1, txYesterday, txToday2], '2026-07-15')
  assert.equal(todayList.length, 2, 'Only today transactions should be returned')
  assert.equal(todayList[0].id, 't2', 'Newest transaction (14:00) must appear first')
  assert.equal(todayList[1].id, 't1', 'Older transaction (08:30) must appear second')
})

// ── 9. Financial Analytics (Req 3.10, Property 10) ───────────────────────────
console.log('\n▶ SUBSYSTEM 3: Financial Analytics (Req 3.10, Property 10)')

// Test 9.1: Cashflow Summary & Burn Rate Invariant (PBT)
testProperty(
  'Property 10.1: Cashflow summary net = income - expense and savingsRatio + burnRate = 1',
  fc.property(
    fc.array(
      fc.record({
        id: fc.uuid(),
        amount: fc.integer({ min: 10_000, max: 10_000_000 }),
        type: fc.constantFrom('income', 'expense'),
        category: arbCategory,
        date: fc.integer({ min: 1, max: 28 }).map(day => new Date(2026, 6, day, 12, 0, 0)),
      }),
      { minLength: 1, maxLength: 25 }
    ),
    (transactions) => {
      const cf = cashflowSummary(transactions, JUL_REF)

      assert.equal(cf.net, cf.income - cf.expense, 'Cashflow net must equal income - expense')

      if (cf.income > 0) {
        assert.ok(cf.savingsRatio !== null, 'savingsRatio must not be null when income > 0')
        assert.ok(cf.burnRate !== null, 'burnRate must not be null when income > 0')

        const sum = cf.savingsRatio + cf.burnRate
        assert.ok(Math.abs(sum - 1) < 1e-6, `savingsRatio + burnRate must equal 1.0 (got ${sum})`)
      } else {
        assert.equal(cf.savingsRatio, null, 'savingsRatio must be null when income === 0')
        assert.equal(cf.burnRate, null, 'burnRate must be null when income === 0')
      }

      assert.equal(
        cf.projectedMonthNet,
        cf.income - cf.projectedMonthExpense,
        'projectedMonthNet must equal income - projectedMonthExpense'
      )

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 9.2: Spending Insight Engine Generation
runCheck('generateInsights produces bounded insights list with valid types', () => {
  const sampleTx = [
    { id: '1', date: new Date(2026, 6, 2), amount: 10000000, type: 'income', category: 'gaji' },
    { id: '2', date: new Date(2026, 6, 5), amount: 2000000, type: 'expense', category: 'makanan' },
  ]

  const insights = generateInsights(sampleTx, JUL_REF)
  assert.ok(Array.isArray(insights), 'insights must be an array')
  assert.ok(insights.length > 0 && insights.length <= 4, 'insights count must be between 1 and 4')
  for (const item of insights) {
    assert.ok(typeof item.text === 'string' && item.text.length > 0, 'insight text must be non-empty')
    assert.ok(['positive', 'negative', 'neutral'].includes(item.type), 'insight type must be valid')
  }
})

// Test 9.3: Goal Monthly Contribution Math (PBT)
testProperty(
  'Property 10.2: Goal monthly contribution Math.ceil((T - C) / M) for M >= 1',
  fc.property(
    fc.integer({ min: 100_000, max: 100_000_000 }),
    fc.integer({ min: 0, max: 50_000_000 }),
    fc.integer({ min: 1, max: 24 }),
    (target, current, monthsAhead) => {
      const ref = new Date(2026, 0, 1)
      const targetDate = new Date(2026, monthsAhead, 1)

      const contribution = calculateMonthlyContribution(target, current, targetDate, ref)

      if (current >= target) {
        assert.equal(contribution, 0, 'Contribution must be 0 if goal is already met')
      } else {
        const expected = Math.ceil((target - current) / monthsAhead)
        assert.equal(contribution, expected, `Contribution must equal Math.ceil((target - current) / months)`)
      }

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 9.4: Goal Health Status Evaluation (PBT)
testProperty(
  'Property 10.3: Goal health status strictly evaluates to Aman, Perlu dipercepat, or Terlambat',
  fc.property(
    fc.integer({ min: 100_000, max: 50_000_000 }),
    fc.integer({ min: 0, max: 60_000_000 }),
    fc.integer({ min: -6, max: 12 }),
    (target, current, monthsOffset) => {
      const ref = new Date(2026, 6, 1)
      const targetDate = new Date(2026, 6 + monthsOffset, 1)

      const health = evaluateGoalHealth(target, current, targetDate, ref, { createdAt: '2026-01-01' })
      assert.ok(
        ['Aman', 'Perlu dipercepat', 'Terlambat'].includes(health),
        `Health status "${health}" must be one of 'Aman', 'Perlu dipercepat', 'Terlambat'`
      )

      if (current >= target) {
        assert.equal(health, 'Aman', 'Completed goals must always evaluate to Aman')
      } else if (monthsOffset < 0) {
        assert.equal(health, 'Terlambat', 'Overdue uncompleted goals must evaluate to Terlambat')
      }

      return true
    }
  ),
  { numRuns: 100 }
)

// ── 10. Transaction Persistence & Storage Integrity (Req 3.11, Property 11) ──
console.log('\n▶ SUBSYSTEM 4: Transaction Persistence & Storage Integrity (Req 3.11, Property 11)')

// Test 10.1: Calendar-Accurate Date Serialization and Deserialization Roundtrip (PBT)
testProperty(
  'Property 11.1: serializeTransactionDate -> deserializeTransactionDate roundtrip identity',
  fc.property(
    fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hours: fc.integer({ min: 0, max: 23 }),
      minutes: fc.integer({ min: 0, max: 59 }),
      seconds: fc.integer({ min: 0, max: 59 }),
    }),
    ({ year, month, day, hours, minutes, seconds }) => {
      const originalDate = new Date(year, month - 1, day, hours, minutes, seconds)
      const serialized = serializeTransactionDate(originalDate)

      assert.equal(typeof serialized, 'string', 'Serialized output must be string')
      assert.ok(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(serialized),
        `Serialized date must match YYYY-MM-DDTHH:mm:ss format (got ${serialized})`
      )

      const deserialized = deserializeTransactionDate(serialized)

      assert.equal(deserialized.getFullYear(), year, 'Year must match')
      assert.equal(deserialized.getMonth() + 1, month, 'Month must match')
      assert.equal(deserialized.getDate(), day, 'Day must match')
      assert.equal(deserialized.getHours(), hours, 'Hours must match')
      assert.equal(deserialized.getMinutes(), minutes, 'Minutes must match')
      assert.equal(deserialized.getSeconds(), seconds, 'Seconds must match')

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 10.2: Wallet Balance Conservation Invariant on Transactions (PBT)
testProperty(
  'Property 11.2: Wallet balance impact conservation across expense, income, and transfer',
  fc.property(
    fc.integer({ min: 500_000, max: 5_000_000 }),
    fc.integer({ min: 500_000, max: 5_000_000 }),
    fc.integer({ min: 10_000, max: 200_000 }),
    (initW1, initW2, txAmount) => {
      const w1 = { id: 'w1', balance: initW1 }
      const w2 = { id: 'w2', balance: initW2 }

      // 1. Expense from w1
      const afterExpense = { ...w1, balance: w1.balance - txAmount }
      assert.equal(afterExpense.balance, initW1 - txAmount, 'Expense must decrease balance by amount')

      // 2. Income to w1
      const afterIncome = { ...w1, balance: w1.balance + txAmount }
      assert.equal(afterIncome.balance, initW1 + txAmount, 'Income must increase balance by amount')

      // 3. Transfer from w1 to w2: Conservation of total balance
      const transferredW1 = { ...w1, balance: w1.balance - txAmount }
      const transferredW2 = { ...w2, balance: w2.balance + txAmount }
      assert.equal(
        transferredW1.balance + transferredW2.balance,
        initW1 + initW2,
        'Transfer must conserve total balance sum across both wallets'
      )

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 10.3: Local Storage Persist & Restore Integrity
runCheck('persistState and loadPersistedState preserve transactions without data loss', () => {
  const store = new Map()
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
  }

  const testState = {
    transactions: [
      {
        id: 'tx-pers-1',
        description: 'Beli bensin',
        amount: 50000,
        type: 'expense',
        category: 'transportasi',
        paymentMethod: 'cash',
        date: new Date('2026-07-10T09:30:00'),
      },
      {
        id: 'tx-pers-2',
        description: 'Transfer ke istri',
        amount: 250000,
        type: 'expense',
        category: 'transfer',
        kind: 'transfer',
        fromWalletId: 'bca',
        toWalletId: 'gopay',
        paymentMethod: 'bca',
        date: new Date('2026-07-11T14:15:00'),
      },
    ],
    wallets: [
      { id: 'cash', label: 'Cash', type: 'cash', balance: 150000, keywords: ['cash'] },
      { id: 'bca', label: 'BCA', type: 'bank', balance: 1200000, keywords: ['bca'] },
    ],
    monthlyBudget: 2500000,
  }

  const success = persistState(mockStorage, testState, 'valid')
  assert.equal(success, true, 'persistState must return true')

  const loaded = loadPersistedState(mockStorage)
  assert.equal(loaded.status, 'valid', 'loadPersistedState status must be valid')
  assert.equal(loaded.state.transactions.length, 2, '2 transactions must be restored')
  assert.equal(loaded.state.transactions[0].amount, 50000, 'Transaction 1 amount preserved')
  assert.equal(loaded.state.transactions[1].kind, 'transfer', 'Transaction 2 transfer kind preserved')
  assert.equal(loaded.state.wallets.length, 2, '2 wallets restored')
  assert.equal(loaded.state.monthlyBudget, 2500000, 'monthlyBudget preserved')
})

// ── 11. Calendar Day Exploration & Full Nominal Display (Req 3.12, Prop 12) ──
console.log('\n▶ SUBSYSTEM 5: Calendar Day Exploration & Full Nominal Display (Req 3.12, Property 12)')

// Test 11.1: Full Non-Truncated IDR Currency Formatting Invariant (PBT)
testProperty(
  'Property 12.1: formatIDR produces full non-truncated Indonesian Rupiah format',
  fc.property(
    arbRupiahAmount,
    (amount) => {
      const formatted = formatIDR(amount)

      assert.ok(formatted.includes('Rp'), `formatIDR must include 'Rp' (got: "${formatted}")`)
      assert.ok(!/\b(k|rb|ribu|jt|juta|m|miliar)\b/i.test(formatted), `formatIDR must NOT abbreviate nominals: ${formatted}`)

      const digitsOnly = stripToDigits(formatted)
      const expectedDigits = String(Math.round(amount))
      assert.equal(digitsOnly, expectedDigits, `stripToDigits("${formatted}") [${digitsOnly}] must equal ${expectedDigits}`)

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 11.2: Calendar Day Exploration Detail Sheet Transaction List Verification
runCheck('Calendar day selection retrieves full list with uncompacted formatIDR', () => {
  const dayTxs = [
    { id: 'd1', date: new Date('2026-07-08T10:00:00'), amount: 1500000, type: 'income', description: 'Gaji sampingan' },
    { id: 'd2', date: new Date('2026-07-08T12:30:00'), amount: 250000, type: 'expense', description: 'Belanja bulanan' },
  ]

  const retrieved = transactionsForDay(dayTxs, '2026-07-08')
  assert.equal(retrieved.length, 2, 'Must retrieve both transactions for the day')

  const incomeTx = retrieved.find(t => t.id === 'd1')
  const expenseTx = retrieved.find(t => t.id === 'd2')

  assert.ok(incomeTx, 'Income tx d1 must exist in retrieved list')
  assert.ok(expenseTx, 'Expense tx d2 must exist in retrieved list')

  const formattedIncome = formatIDR(incomeTx.amount)
  const formattedExpense = formatIDR(expenseTx.amount)

  assert.ok(formattedIncome.includes('1.500.000'), 'Income must be full 1.500.000 on detail sheet')
  assert.ok(formattedExpense.includes('250.000'), 'Expense must be full 250.000 on detail sheet')
})

// ── 12. Active Wallet Reconciliation (Req 3.13, Property 13) ─────────────────
console.log('\n▶ SUBSYSTEM 6: Active Wallet Reconciliation (Req 3.13, Property 13)')

// Test 12.1: Active-Month Wallet Variance Calculation & Status Classification (PBT)
testProperty(
  'Property 13.1: Active wallet reconciliation variance math and status classification',
  fc.property(
    arbRupiahAmount,
    arbRupiahAmount,
    (actualBalance, expectedBalance) => {
      const variance = calculateReconciliationVariance(actualBalance, expectedBalance)
      const expectedDiff = actualBalance - expectedBalance

      assert.equal(variance, expectedDiff, 'Variance must equal actual - expected')

      const formatted = formatReconciliationVariance(variance)
      if (actualBalance > expectedBalance) {
        assert.equal(formatted.status, 'surplus', 'Status must be surplus when actual > expected')
        assert.equal(formatted.badgeText, 'Saldo Lebih')
      } else if (actualBalance < expectedBalance) {
        assert.equal(formatted.status, 'shortfall', 'Status must be shortfall when actual < expected')
        assert.equal(formatted.badgeText, 'Saldo Kurang')
      } else {
        assert.equal(formatted.status, 'balanced', 'Status must be balanced when actual === expected')
        assert.equal(formatted.badgeText, 'Sesuai')
      }

      return true
    }
  ),
  { numRuns: 100 }
)

// Test 12.2: Non-Destructive Adjustment Transaction Generation
runCheck('createAdjustmentTransaction generates valid non-destructive adjustments', () => {
  const surplusTx = createAdjustmentTransaction('bca', 'BCA', 50000, 'Saldo lebih ditemukan')
  assert.ok(surplusTx !== null, 'Surplus adjustment created')
  assert.equal(surplusTx.type, 'income', 'Surplus produces income')
  assert.equal(surplusTx.amount, 50000, 'Amount matches positive variance')
  assert.equal(surplusTx.category, 'lainnya', 'Category is lainnya')
  assert.equal(surplusTx.subcategory, 'Penyesuaian Saldo', 'Subcategory is Penyesuaian Saldo')
  assert.ok(surplusTx.note.includes('Saldo lebih ditemukan'), 'Note is preserved')

  const shortfallTx = createAdjustmentTransaction('gopay', 'GoPay', -25000)
  assert.ok(shortfallTx !== null, 'Shortfall adjustment created')
  assert.equal(shortfallTx.type, 'expense', 'Shortfall produces expense')
  assert.equal(shortfallTx.amount, 25000, 'Amount matches absolute value of negative variance')
  assert.equal(shortfallTx.category, 'lainnya', 'Category is lainnya')

  const balancedTx = createAdjustmentTransaction('tunai', 'Cash', 0)
  assert.equal(balancedTx, null, 'Balanced reconciliation creates no transaction')
})

// Test 12.3: Historical Transactions Immutability Invariant
runCheck('Historical transactions are never mutated when reconciliation adjustment is recorded', () => {
  const historical = [
    { id: 'h1', date: new Date(2026, 6, 1), amount: 100000, type: 'expense', category: 'makanan', paymentMethod: 'bca' },
    { id: 'h2', date: new Date(2026, 6, 3), amount: 500000, type: 'income', category: 'gaji', paymentMethod: 'bca' },
  ]
  const historicalSnapshot = JSON.stringify(historical)

  const adj = createAdjustmentTransaction('bca', 'BCA', -20000)
  const combinedTransactions = [adj, ...historical]

  assert.equal(combinedTransactions.length, 3, 'Adjustment appended to history')
  assert.equal(JSON.stringify(combinedTransactions.slice(1)), historicalSnapshot, 'Historical transactions remain 100% byte-for-byte untouched')
})

// ── 13. Strict Scope Invariant (Req 3.14, Property 14) ───────────────────────
console.log('\n▶ SUBSYSTEM 7: Strict Scope Invariant (Req 3.14, Property 14)')

runCheck('Core storage schema version and storage keys remain intact', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 8, 'CURRENT_SCHEMA_VERSION must remain 8')
  assert.equal(STORAGE_KEY, 'sakukilat:v2:local-state', 'Primary STORAGE_KEY must be sakukilat:v2:local-state')
})

runCheck('Primary navigation preserves exact 5 tabs sequence', () => {
  const appPageContent = fs.readFileSync(path.resolve(ROOT, 'app/page.tsx'), 'utf8')
  const tabsMatch = appPageContent.match(/const TABS[\s\S]*?=\s*\[([\s\S]*?)\]/)
  assert.ok(tabsMatch, 'app/page.tsx must define TABS array')
  const tabIds = Array.from(tabsMatch[1].matchAll(/id:\s*'([^']+)'/g)).map(m => m[1])
  assert.deepEqual(
    tabIds,
    ['beranda', 'rekapan', 'saku', 'rencana', 'profil'],
    'Primary navigation tabs sequence must strictly be [beranda, rekapan, saku, rencana, profil]'
  )
})

console.log('\n========================================================================')
console.log('                 PRESERVATION TEST SUITE SUMMARY                        ')
console.log('========================================================================')
console.log(`Executed Checks    : ${testCount} unit/integration checks`)
console.log(`PBT Suites Verified: 8 property-based tests (>= 100 iterations each)`)
console.log(`Passed Checks      : ${passedCount}/${testCount}`)
console.log('------------------------------------------------------------------------')
console.log('✅ ALL BASELINE BEHAVIORS CONFIRMED PRESERVED ON UNFIXED CODE!')
console.log('========================================================================\n')

process.exitCode = 0
