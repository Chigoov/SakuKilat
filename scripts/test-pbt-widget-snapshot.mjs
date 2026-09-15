/**
 * SakuKilat — Property-Based Test Suite for Native Widget Snapshot Bridge (Phase P4)
 *
 * Feature: sakukilat-core-roadmap, Property 11: Widget Snapshot Ledger Isolation and Bounded Size
 * Validates: Requirements 4.4, 4.5
 *
 * Formal Property Statement:
 * For all app ledger states (regardless of transaction count), the generated NativeWidgetSnapshot
 * payload SHALL contain only aggregated scalars (totalBalance, monthlyExpense, etc.) and at most 3
 * recent transaction summaries, and its serialized JSON size SHALL be strictly bounded
 * (less than 4,096 bytes), containing no complete transaction ledger entries.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
  arbRupiahAmount,
  arbCategory,
  arbPaymentMethod,
} from './pbt-harness.mjs'
import {
  generateWidgetSnapshot,
  serializeWidgetSnapshot,
  parseWidgetSnapshot,
  MAX_WIDGET_SNAPSHOT_SIZE,
} from '../lib/widget-snapshot.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: WIDGET SNAPSHOT LEDGER ISOLATION & BOUNDED SIZE       ')
console.log('========================================================================\n')

// ── Domain Arbitraries for Snapshot State Generation ─────────────────────────

// Arbitrary wallet with realistic ID, label, balance, and reconciliation metadata
const arbWallet = fc.record({
  id: fc.stringMatching(/^[a-z0-9_-]{3,16}$/),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  balance: fc.integer({ min: -10_000_000, max: 1_000_000_000 }),
  lastReconciledAt: fc.option(fc.constant('2026-09-01T00:00:00Z'), { nil: undefined }),
})

// Arbitrary transaction covering normal, transfer, saving, and split line item types
const arbTransaction = fc.record({
  id: fc.stringMatching(/^tx-[a-z0-9]{8,16}$/),
  description: fc.oneof(
    fc.string({ minLength: 1, maxLength: 80 }),
    fc.string({ minLength: 100, maxLength: 250 }) // stress test long descriptions
  ),
  amount: fc.integer({ min: 0, max: 500_000_000 }),
  type: fc.constantFrom('expense', 'income'),
  date: arbCalendarDate,
  kind: fc.constantFrom('transaction', 'transfer', 'saving', undefined),
  category: arbCategory,
  subcategory: fc.option(fc.string({ minLength: 2, maxLength: 20 }), { nil: undefined }),
  paymentMethod: arbPaymentMethod,
  note: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
  splitItems: fc.option(
    fc.array(
      fc.record({
        id: fc.stringMatching(/^sp-[0-9]{3}$/),
        categoryId: arbCategory,
        amount: fc.integer({ min: 1000, max: 100000 }),
      }),
      { minLength: 1, maxLength: 4 }
    ),
    { nil: undefined }
  ),
})

// Arbitrary recurring bill
const arbBill = fc.record({
  id: fc.stringMatching(/^bill-[0-9]{3}$/),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  amount: fc.integer({ min: 10_000, max: 50_000_000 }),
  nextDueDate: fc
    .record({
      year: fc.integer({ min: 2025, max: 2027 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`),
  isActive: fc.boolean(),
})

// Arbitrary financial goal
const arbGoal = fc.record({
  id: fc.stringMatching(/^goal-[0-9]{3}$/),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  targetAmount: fc.integer({ min: 100_000, max: 500_000_000 }),
  currentAmount: fc.integer({ min: 0, max: 500_000_000 }),
})

// Arbitrary debt item
const arbDebt = fc.record({
  id: fc.stringMatching(/^debt-[0-9]{3}$/),
  principalAmount: fc.integer({ min: 100_000, max: 50_000_000 }),
  paidAmount: fc.integer({ min: 0, max: 50_000_000 }),
  isSettled: fc.boolean(),
})

// Composite state arbitrary representing arbitrary application ledger states
const arbLedgerState = fc.record({
  now: arbCalendarDate,
  wallets: fc.array(arbWallet, { minLength: 0, maxLength: 10 }),
  transactions: fc.array(arbTransaction, { minLength: 0, maxLength: 70 }),
  bills: fc.array(arbBill, { minLength: 0, maxLength: 6 }),
  goals: fc.array(arbGoal, { minLength: 0, maxLength: 4 }),
  debts: fc.array(arbDebt, { minLength: 0, maxLength: 4 }),
})

// ── Property 11: Widget Snapshot Ledger Isolation and Bounded Size ───────────
// Feature: sakukilat-core-roadmap, Property 11: Widget Snapshot Ledger Isolation and Bounded Size
// Validates: Requirements 4.4, 4.5
{
  let runsEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 11: Widget Snapshot Ledger Isolation and Bounded Size',
    fc.property(arbLedgerState, ({ now, wallets, transactions, bills, goals, debts }) => {
      runsEvaluated++

      // Generate the snapshot for the random ledger state
      const snapshot = generateWidgetSnapshot({
        now,
        wallets,
        transactions,
        bills,
        goals,
        debts,
      })

      // ── INVARIANT 1: Strict Ledger Isolation (Requirements 4.5) ─────────────
      // Raw transactions and wallets arrays must NEVER be leaked to the snapshot object
      assert.equal(
        snapshot.transactions,
        undefined,
        'Snapshot must NEVER contain raw transactions array (ledger leakage)'
      )
      assert.equal(
        snapshot.wallets,
        undefined,
        'Snapshot must NEVER contain raw wallets array (ledger leakage)'
      )
      assert.equal(
        snapshot.customCategories,
        undefined,
        'Snapshot must NEVER contain internal categories or custom items'
      )

      // Recent transactions count is strictly bounded to at most 3
      assert.ok(
        Array.isArray(snapshot.recentTransactions),
        'recentTransactions must be an array'
      )
      assert.ok(
        snapshot.recentTransactions.length <= 3,
        `recentTransactions must be at most 3 items, got ${snapshot.recentTransactions.length}`
      )

      // Recent transaction items contain only sanitized presentation metadata
      for (const item of snapshot.recentTransactions) {
        assert.ok(typeof item.id === 'string' && item.id.length > 0, 'Recent tx must have valid id string')
        assert.ok(typeof item.description === 'string', 'Recent tx must have description string')
        assert.ok(typeof item.amount === 'number' && item.amount >= 0, 'Recent tx amount must be non-negative')
        assert.ok(
          item.type === 'expense' || item.type === 'income' || item.type === 'transfer',
          `Recent tx type must be expense/income/transfer, got ${item.type}`
        )
        assert.ok(typeof item.formattedDate === 'string' && item.formattedDate.length > 0, 'Recent tx must have formattedDate')

        // Verify absence of raw ledger fields on recent items
        assert.equal(item.category, undefined, 'Recent tx must NOT leak internal category')
        assert.equal(item.subcategory, undefined, 'Recent tx must NOT leak subcategory')
        assert.equal(item.paymentMethod, undefined, 'Recent tx must NOT leak paymentMethod')
        assert.equal(item.note, undefined, 'Recent tx must NOT leak note')
        assert.equal(item.splitItems, undefined, 'Recent tx must NOT leak splitItems')
        assert.equal(item.fromWalletId, undefined, 'Recent tx must NOT leak fromWalletId')
        assert.equal(item.toWalletId, undefined, 'Recent tx must NOT leak toWalletId')
      }

      // ── INVARIANT 2: Correct Aggregated Scalars ─────────────────────────────
      // totalBalance = sum of all wallet balances
      const expectedTotalBalance = Math.round(
        wallets.reduce((sum, w) => sum + (Number.isFinite(Number(w.balance)) ? Number(w.balance) : 0), 0)
      )
      assert.equal(
        snapshot.totalBalance,
        expectedTotalBalance,
        `totalBalance mismatch: expected ${expectedTotalBalance}, got ${snapshot.totalBalance}`
      )

      // monthlyExpense & monthlyExpenseTxCount: sum and count of current month expenses
      const refYear = now.getFullYear()
      const refMonth = now.getMonth()
      let expectedMonthlyExpense = 0
      let expectedMonthlyExpenseTxCount = 0

      for (const t of transactions) {
        if (!t) continue
        const isMove = t.kind === 'transfer' || t.kind === 'saving' || t.category === 'transfer'
        if (isMove) continue

        const d = new Date(t.date)
        if (d.getFullYear() === refYear && d.getMonth() === refMonth && t.type === 'expense') {
          const amt = Math.round(Number(t.amount) || 0)
          if (amt > 0) {
            expectedMonthlyExpense += amt
            expectedMonthlyExpenseTxCount += 1
          }
        }
      }

      assert.equal(
        snapshot.monthlyExpense,
        expectedMonthlyExpense,
        `monthlyExpense mismatch: expected ${expectedMonthlyExpense}, got ${snapshot.monthlyExpense}`
      )
      assert.equal(
        snapshot.monthlyExpenseTxCount,
        expectedMonthlyExpenseTxCount,
        `monthlyExpenseTxCount mismatch: expected ${expectedMonthlyExpenseTxCount}, got ${snapshot.monthlyExpenseTxCount}`
      )

      // Invariant metadata
      assert.equal(snapshot.version, 1, 'Snapshot version must be 1')
      assert.equal(snapshot.generatedAt, now.getTime(), 'generatedAt must equal ref date epoch ms')

      // hasUnreconciledWallets indicator
      const expectedUnreconciled = wallets.length > 0 && wallets.some((w) => w.lastReconciledAt === undefined)
      assert.equal(
        snapshot.hasUnreconciledWallets,
        expectedUnreconciled,
        `hasUnreconciledWallets mismatch: expected ${expectedUnreconciled}`
      )

      // ── INVARIANT 3: Bounded Payload Size (< 4,096 bytes) (Requirements 4.4, 4.5) ─
      const serialized = serializeWidgetSnapshot(snapshot)

      assert.ok(typeof serialized === 'string', 'Serialized snapshot must be a string')
      assert.ok(
        serialized.length < MAX_WIDGET_SNAPSHOT_SIZE,
        `Serialized length ${serialized.length} must be strictly less than ${MAX_WIDGET_SNAPSHOT_SIZE}`
      )
      assert.ok(
        Buffer.byteLength(serialized, 'utf8') < 4096,
        `Serialized byte length must be strictly less than 4,096 bytes`
      )

      // Verify no complete ledger entries exist in the serialized string
      assert.ok(
        !serialized.includes('"transactions":['),
        'Serialized snapshot JSON must NOT contain raw "transactions" array'
      )
      assert.ok(
        !serialized.includes('"wallets":['),
        'Serialized snapshot JSON must NOT contain raw "wallets" array'
      )

      // ── INVARIANT 4: Parse / Deserialization Soundness ────────────────────────
      const parsed = parseWidgetSnapshot(serialized)
      assert.ok(parsed !== null, 'parseWidgetSnapshot must return non-null object')
      assert.equal(parsed.version, 1)
      assert.equal(parsed.totalBalance, snapshot.totalBalance)
      assert.equal(parsed.monthlyExpense, snapshot.monthlyExpense)
      assert.equal(parsed.monthlyExpenseTxCount, snapshot.monthlyExpenseTxCount)
      assert.equal(parsed.recentTransactions.length, snapshot.recentTransactions.length)
      assert.equal(parsed.hasUnreconciledWallets, snapshot.hasUnreconciledWallets)

      return true
    }),
    { numRuns: 150 }
  )

  console.log(`    Verified ${runsEvaluated} random ledger states with all invariants holding.\n`)
}

// ── Sub-Check A: Stress Testing with 100+ Transactions & Oversized Strings ───
{
  let stressRunsEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 11 (Sub-check A): Stress Testing with 100+ Transactions',
    fc.property(
      fc.record({
        now: arbCalendarDate,
        txCount: fc.integer({ min: 100, max: 200 }),
        descLength: fc.integer({ min: 100, max: 300 }),
        walletCount: fc.integer({ min: 5, max: 15 }),
      }),
      ({ now, txCount, descLength, walletCount }) => {
        stressRunsEvaluated++

        const wallets = Array.from({ length: walletCount }, (_, i) => ({
          id: `w-${i}`,
          label: `Dompet ${i}`,
          balance: (i + 1) * 250_000,
        }))

        const transactions = Array.from({ length: txCount }, (_, i) => ({
          id: `tx-stress-${i}`,
          description: `Deskripsi panjang transaksi nomor ${i} `.repeat(Math.ceil(descLength / 35)),
          amount: (i + 1) * 5_000,
          type: i % 3 === 0 ? 'income' : 'expense',
          date: new Date(now.getFullYear(), now.getMonth(), 1 + (i % 25)),
          category: 'Belanja',
          note: 'Catatan internal rahasia '.repeat(10),
        }))

        const snapshot = generateWidgetSnapshot({ now, wallets, transactions })
        const serialized = serializeWidgetSnapshot(snapshot)

        // Must still strictly stay below 4,096 bytes
        assert.ok(
          serialized.length < MAX_WIDGET_SNAPSHOT_SIZE,
          `Stress snapshot exceeded ${MAX_WIDGET_SNAPSHOT_SIZE} bytes: got ${serialized.length}`
        )
        assert.ok(
          Buffer.byteLength(serialized, 'utf8') < 4096,
          'Stress snapshot byte length must be < 4096'
        )

        // Recent items still bounded to at most 3
        assert.ok(snapshot.recentTransactions.length <= 3)

        // Older transaction IDs (e.g. index 50, 99) must NOT be present anywhere in serialized JSON
        assert.ok(
          !serialized.includes('tx-stress-99'),
          'Older transaction IDs must be isolated and excluded from snapshot'
        )
        assert.ok(
          !serialized.includes('Catatan internal rahasia'),
          'Private transaction notes must NOT be leaked'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  console.log(`    Verified ${stressRunsEvaluated} stress runs with 100-200 transactions each.\n`)
}

// ── Sub-Check B: Boundary & Empty Ledger States ───────────────────────────────
{
  let boundaryRunsEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 11 (Sub-check B): Boundary & Empty Ledger States',
    fc.property(
      fc.record({
        now: arbCalendarDate,
        emptyWallets: fc.boolean(),
        emptyTx: fc.boolean(),
        txCount: fc.constantFrom(0, 1, 2, 3),
      }),
      ({ now, emptyWallets, emptyTx, txCount }) => {
        boundaryRunsEvaluated++

        const wallets = emptyWallets ? [] : [{ id: 'w-single', balance: 0 }]
        const transactions = emptyTx
          ? []
          : Array.from({ length: txCount }, (_, i) => ({
              id: `tx-bound-${i}`,
              description: `Item ${i}`,
              amount: 10_000,
              type: 'expense',
              date: now,
            }))

        const snapshot = generateWidgetSnapshot({ now, wallets, transactions })
        const serialized = serializeWidgetSnapshot(snapshot)

        assert.ok(serialized.length < MAX_WIDGET_SNAPSHOT_SIZE)
        assert.equal(snapshot.recentTransactions.length, Math.min(3, transactions.length))
        assert.equal(snapshot.transactions, undefined)
        assert.equal(snapshot.wallets, undefined)

        const parsed = parseWidgetSnapshot(serialized)
        assert.ok(parsed !== null)
        assert.equal(parsed.recentTransactions.length, transactions.length)

        return true
      }
    ),
    { numRuns: 100 }
  )

  console.log(`    Verified ${boundaryRunsEvaluated} boundary runs (empty and 0-3 items).\n`)
}

console.log('========================================================================')
console.log('✅ ALL PROPERTY 11 (WIDGET SNAPSHOT ISOLATION & BOUNDED SIZE) PBT PASSED!')
console.log('========================================================================\n')
