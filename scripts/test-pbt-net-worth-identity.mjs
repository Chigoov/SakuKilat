/**
 * SakuKilat — Property-Based Test Suite for Net Worth Calculation Identity (Phase P10)
 *
 * Feature: sakukilat-core-roadmap, Property 28: Net Worth Calculation Identity
 * Validates: Requirements 10.2, 10.3, 10.4, 10.6
 *
 * Formal Property Statement:
 * For any state of wallets and debts, totalAssets SHALL equal the sum of all positive
 * wallet balances, totalLiabilities SHALL equal the sum of remaining amounts of all active
 * debts, and netWorth SHALL equal totalAssets - totalLiabilities.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbPositiveRupiahAmount,
  arbCalendarDate,
} from './pbt-harness.mjs'
import {
  calculateTotalAssets,
  calculateTotalLiabilities,
  calculateTotalReceivables,
  calculateNetWorth,
  compileNetWorthSummary,
  createDebtItem,
  updateDebtItem,
  recordDebtPayment,
  NetWorthTracker,
} from '../lib/net-worth.ts'
import {
  generateWidgetSnapshot,
} from '../lib/widget-snapshot.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: NET WORTH CALCULATION IDENTITY (PROPERTY 28)         ')
console.log('========================================================================\n')

// ── Domain Arbitraries ────────────────────────────────────────────────────────

/**
 * Arbitrary wallet with positive, zero, or negative balance.
 */
const arbWallet = fc.record({
  id: fc.stringMatching(/^[a-z0-9_-]{3,16}$/),
  label: fc.string({ minLength: 1, maxLength: 25 }),
  balance: fc.integer({ min: -50_000_000, max: 200_000_000 }),
  type: fc.constantFrom('bank', 'ewallet', 'cash', 'credit'),
  lastReconciledAt: fc.option(fc.constant('2026-06-01T00:00:00Z'), { nil: undefined }),
})

/**
 * Arbitrary debt item with realistic principal, paid, remaining, and settled flag.
 */
const arbDebtItem = fc
  .record({
    id: fc.stringMatching(/^debt-[a-z0-9]{5,10}$/),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    principalAmount: fc.integer({ min: 10_000, max: 500_000_000 }),
    paidRatio: fc.float({ min: 0, max: 1 }),
    isSettledExplicit: fc.boolean(),
    type: fc.constantFrom('payable', 'receivable'),
    lenderOrBorrower: fc.string({ minLength: 1, maxLength: 25 }),
    hasExplicitRemaining: fc.boolean(),
  })
  .map(({ id, name, principalAmount, paidRatio, isSettledExplicit, type, lenderOrBorrower, hasExplicitRemaining }) => {
    const paidAmount = Math.round(principalAmount * paidRatio)
    const derivedRemaining = Math.max(0, principalAmount - paidAmount)
    const isSettled = isSettledExplicit || derivedRemaining === 0
    const remainingAmount = isSettled ? 0 : derivedRemaining

    const item = {
      id,
      name,
      principalAmount,
      paidAmount,
      isSettled,
      type,
      lenderOrBorrower,
      payments: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    if (hasExplicitRemaining) {
      item.remainingAmount = remainingAmount
    }

    return item
  })

// ── Feature: sakukilat-core-roadmap, Property 28: Net Worth Calculation Identity ──
// Validates: Requirements 10.2, 10.3, 10.4, 10.6
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 28: Net Worth Calculation Identity',
    fc.property(
      fc.array(arbWallet, { minLength: 0, maxLength: 15 }),
      fc.array(arbDebtItem, { minLength: 0, maxLength: 15 }),
      arbCalendarDate,
      (wallets, debts, now) => {
        totalEvaluated++

        // 1. Calculate Expected Total Assets (Requirement 10.2)
        // Sum of all positive wallet balances, non-positive balances excluded
        let manualExpectedAssets = 0
        for (const w of wallets) {
          if (w && Number.isFinite(Number(w.balance)) && Number(w.balance) > 0) {
            manualExpectedAssets += Math.round(Number(w.balance))
          }
        }

        // 2. Calculate Expected Total Liabilities (Requirement 10.3)
        // Sum of remaining amounts of all active (!isSettled) debts
        let manualExpectedLiabilities = 0
        for (const d of debts) {
          if (d && !d.isSettled) {
            const rem = d.remainingAmount !== undefined && Number.isFinite(Number(d.remainingAmount))
              ? Number(d.remainingAmount)
              : Math.max(0, (Number(d.principalAmount) || 0) - (Number(d.paidAmount) || 0))
            manualExpectedLiabilities += Math.max(0, Math.round(rem))
          }
        }

        // 3. Expected Net Worth Identity (Requirement 10.4)
        const manualExpectedNetWorth = manualExpectedAssets - manualExpectedLiabilities

        // Execute functions under test
        const actualAssets = calculateTotalAssets(wallets)
        const actualLiabilities = calculateTotalLiabilities(debts)
        const actualNetWorth = calculateNetWorth(actualAssets, actualLiabilities)

        // INVARIANT 1: Total Assets Identity (Requirement 10.2)
        assert.equal(
          actualAssets,
          manualExpectedAssets,
          `Total assets mismatch: expected ${manualExpectedAssets}, got ${actualAssets}`
        )

        // INVARIANT 2: Total Liabilities Identity (Requirement 10.3)
        assert.equal(
          actualLiabilities,
          manualExpectedLiabilities,
          `Total liabilities mismatch: expected ${manualExpectedLiabilities}, got ${actualLiabilities}`
        )

        // INVARIANT 3: Net Worth Identity (Requirement 10.4)
        assert.equal(
          actualNetWorth,
          manualExpectedNetWorth,
          `Net worth mismatch: expected ${manualExpectedNetWorth}, got ${actualNetWorth}`
        )

        // INVARIANT 4: Summary Compilation Parity
        const summary = compileNetWorthSummary(wallets, debts, now)
        assert.equal(
          summary.totalAssets,
          manualExpectedAssets,
          'compileNetWorthSummary.totalAssets must match calculateTotalAssets'
        )
        assert.equal(
          summary.totalLiabilities,
          manualExpectedLiabilities,
          'compileNetWorthSummary.totalLiabilities must match calculateTotalLiabilities'
        )
        assert.equal(
          summary.netWorth,
          manualExpectedNetWorth,
          'compileNetWorthSummary.netWorth must equal totalAssets - totalLiabilities'
        )

        // INVARIANT 5: NetWorthTracker Static Class API Parity
        assert.equal(
          NetWorthTracker.calculateTotalAssets(wallets),
          actualAssets,
          'NetWorthTracker.calculateTotalAssets parity'
        )
        assert.equal(
          NetWorthTracker.calculateTotalLiabilities(debts),
          actualLiabilities,
          'NetWorthTracker.calculateTotalLiabilities parity'
        )
        assert.equal(
          NetWorthTracker.calculateNetWorth(actualAssets, actualLiabilities),
          actualNetWorth,
          'NetWorthTracker.calculateNetWorth parity'
        )

        // INVARIANT 6: Native Widget Snapshot Export Parity (Requirement 10.6)
        const snapshot = generateWidgetSnapshot({
          wallets,
          debts,
          now,
        })
        assert.equal(
          snapshot.netWorth,
          actualNetWorth,
          `generateWidgetSnapshot.netWorth must match calculated net worth: expected ${actualNetWorth}, got ${snapshot.netWorth}`
        )

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
  console.log(`    Main Property 28 verified with ${totalEvaluated} iterations across randomized state matrices.\n`)
}

// ── Sub-Check A: Additive Monotonicity and Linearity of Assets & Liabilities ──
// Verifies that:
// - Adding a positive balance wallet strictly increases totalAssets and netWorth by that exact amount.
// - Adding a non-positive wallet (0 or negative) has zero effect on totalAssets and netWorth.
// - Adding an active debt strictly increases totalLiabilities and strictly decreases netWorth by that amount.
// - Adding a settled debt has zero effect on totalLiabilities and netWorth.
{
  let monoEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 28 (Sub-check A): Additive Monotonicity & Linearity',
    fc.property(
      fc.array(arbWallet, { minLength: 0, maxLength: 8 }),
      fc.array(arbDebtItem, { minLength: 0, maxLength: 8 }),
      arbPositiveRupiahAmount,
      fc.integer({ min: -50_000_000, max: 0 }),
      arbPositiveRupiahAmount,
      (wallets, debts, positiveNominal, nonPositiveNominal, debtNominal) => {
        monoEvaluated++

        const baseAssets = calculateTotalAssets(wallets)
        const baseLiabilities = calculateTotalLiabilities(debts)
        const baseNetWorth = calculateNetWorth(baseAssets, baseLiabilities)

        // 1. Add positive wallet
        const walletPositive = { id: 'w-pos', label: 'Positive', balance: positiveNominal }
        const assetsWithPos = calculateTotalAssets([...wallets, walletPositive])
        const netWorthWithPos = calculateNetWorth(assetsWithPos, baseLiabilities)

        assert.equal(
          assetsWithPos,
          baseAssets + positiveNominal,
          `Positive wallet of ${positiveNominal} must increase assets by exact nominal`
        )
        assert.equal(
          netWorthWithPos,
          baseNetWorth + positiveNominal,
          `Positive wallet of ${positiveNominal} must increase net worth by exact nominal`
        )

        // 2. Add zero or negative wallet
        const walletNonPos = { id: 'w-nonpos', label: 'Non-Positive', balance: nonPositiveNominal }
        const assetsWithNonPos = calculateTotalAssets([...wallets, walletNonPos])
        const netWorthWithNonPos = calculateNetWorth(assetsWithNonPos, baseLiabilities)

        assert.equal(
          assetsWithNonPos,
          baseAssets,
          'Non-positive wallet must NOT modify total assets'
        )
        assert.equal(
          netWorthWithNonPos,
          baseNetWorth,
          'Non-positive wallet must NOT modify net worth'
        )

        // 3. Add active debt
        const activeDebt = {
          id: 'd-active',
          name: 'Active Debt',
          principalAmount: debtNominal,
          paidAmount: 0,
          remainingAmount: debtNominal,
          isSettled: false,
        }
        const liabilitiesWithDebt = calculateTotalLiabilities([...debts, activeDebt])
        const netWorthWithDebt = calculateNetWorth(baseAssets, liabilitiesWithDebt)

        assert.equal(
          liabilitiesWithDebt,
          baseLiabilities + debtNominal,
          `Active debt of ${debtNominal} must increase liabilities by exact remaining nominal`
        )
        assert.equal(
          netWorthWithDebt,
          baseNetWorth - debtNominal,
          `Active debt of ${debtNominal} must decrease net worth by exact remaining nominal`
        )

        // 4. Add settled debt
        const settledDebt = {
          id: 'd-settled',
          name: 'Settled Debt',
          principalAmount: debtNominal,
          paidAmount: debtNominal,
          remainingAmount: 0,
          isSettled: true,
        }
        const liabilitiesWithSettled = calculateTotalLiabilities([...debts, settledDebt])
        const netWorthWithSettled = calculateNetWorth(baseAssets, liabilitiesWithSettled)

        assert.equal(
          liabilitiesWithSettled,
          baseLiabilities,
          'Settled debt must NOT modify total liabilities'
        )
        assert.equal(
          netWorthWithSettled,
          baseNetWorth,
          'Settled debt must NOT modify net worth'
        )

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(monoEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${monoEvaluated} iterations for linearity and monotonicity.\n`)
}

// ── Sub-Check B: Debt Repayment Balance Shift / Net Worth Conservation Invariant ──
// When paying a debt from a funded wallet:
// wallet.balance decreases by P (reducing totalAssets by P)
// debt.remaining decreases by P (reducing totalLiabilities by P)
// Net Worth = (Assets - P) - (Liabilities - P) = Assets - Liabilities = UNCHANGED!
// This mathematically proves Net Worth invariance under internal debt settlement.
{
  let repaymentEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 28 (Sub-check B): Net Worth Conservation under Debt Repayment',
    fc.property(
      fc.integer({ min: 1_000_000, max: 50_000_000 }), // wallet initial balance
      fc.integer({ min: 500_000, max: 20_000_000 }),   // debt principal
      fc.integer({ min: 10_000, max: 10_000_000 }),    // payment amount
      (walletBalance, debtPrincipal, rawPayment) => {
        repaymentEvaluated++

        const wallet = { id: 'bca', label: 'BCA', balance: walletBalance }
        const debt = createDebtItem({
          name: 'Pinjaman Bank',
          principalAmount: debtPrincipal,
          paidAmount: 0,
        })

        const initialAssets = calculateTotalAssets([wallet])
        const initialLiabilities = calculateTotalLiabilities([debt])
        const initialNetWorth = calculateNetWorth(initialAssets, initialLiabilities)

        // Execute payment
        const paymentResult = recordDebtPayment(debt, {
          debtId: debt.id,
          amount: rawPayment,
          paymentMethodId: 'bca',
        })

        const actualPaid = paymentResult.payment.amount
        assert.ok(actualPaid > 0, 'Actual paid amount must be positive')

        // Apply deduction to wallet
        const updatedWallet = {
          ...wallet,
          balance: wallet.balance - actualPaid,
        }

        // Recompute net worth with updated wallet and updated debt
        const updatedAssets = calculateTotalAssets([updatedWallet])
        const updatedLiabilities = calculateTotalLiabilities([paymentResult.updatedDebt])
        const updatedNetWorth = calculateNetWorth(updatedAssets, updatedLiabilities)

        // INVARIANT: If wallet balance remained positive or zero after payment,
        // Net Worth is strictly CONSERVED because reduction in assets equals reduction in liabilities!
        if (updatedWallet.balance >= 0) {
          assert.equal(
            updatedNetWorth,
            initialNetWorth,
            `Net worth must remain invariant under debt repayment when wallet remains non-negative: before ${initialNetWorth}, after ${updatedNetWorth}`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(repaymentEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${repaymentEvaluated} iterations for Net Worth conservation.\n`)
}

// ── Sub-Check C: Negative, Zero, and Massive Net Worth Scale Invariance ───────
// Explores boundary scales:
// - Heavily in debt: liabilities >> assets (negative Net Worth)
// - Balanced: assets == liabilities (zero Net Worth)
// - Wealth accumulation: assets >> liabilities (large positive Net Worth)
{
  let scaleEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 28 (Sub-check C): Scale and Sign Boundary Invariance',
    fc.property(
      fc.constantFrom(
        'negative_net_worth',
        'zero_net_worth',
        'positive_net_worth',
        'huge_numbers'
      ),
      fc.integer({ min: 1, max: 100_000_000 }),
      (scenario, baseValue) => {
        scaleEvaluated++

        let wallets = []
        let debts = []

        if (scenario === 'negative_net_worth') {
          // Assets = 1x base, Liabilities = 3x base -> Net Worth = -2x base
          wallets = [{ id: 'w1', balance: baseValue }]
          debts = [{
            id: 'd1',
            name: 'Hutang Besar',
            principalAmount: baseValue * 3,
            remainingAmount: baseValue * 3,
            isSettled: false,
          }]
        } else if (scenario === 'zero_net_worth') {
          // Assets = base, Liabilities = base -> Net Worth = 0
          wallets = [{ id: 'w1', balance: baseValue }]
          debts = [{
            id: 'd1',
            name: 'Hutang Pas',
            principalAmount: baseValue,
            remainingAmount: baseValue,
            isSettled: false,
          }]
        } else if (scenario === 'positive_net_worth') {
          // Assets = 5x base, Liabilities = base -> Net Worth = 4x base
          wallets = [{ id: 'w1', balance: baseValue * 5 }]
          debts = [{
            id: 'd1',
            name: 'Hutang Kecil',
            principalAmount: baseValue,
            remainingAmount: baseValue,
            isSettled: false,
          }]
        } else if (scenario === 'huge_numbers') {
          // Billions of Rupiah
          const massive = 50_000_000_000 // 50 Miliar
          wallets = [{ id: 'w-whale', balance: massive }]
          debts = [{
            id: 'd-whale',
            name: 'Kredit Korporat',
            principalAmount: 20_000_000_000,
            remainingAmount: 20_000_000_000,
            isSettled: false,
          }]
        }

        const assets = calculateTotalAssets(wallets)
        const liabilities = calculateTotalLiabilities(debts)
        const netWorth = calculateNetWorth(assets, liabilities)

        assert.equal(
          netWorth,
          assets - liabilities,
          `Identity netWorth === assets - liabilities must hold in scenario ${scenario}`
        )

        if (scenario === 'negative_net_worth') {
          assert.ok(netWorth < 0, `Net worth must be negative in scenario ${scenario}`)
        } else if (scenario === 'zero_net_worth') {
          assert.equal(netWorth, 0, `Net worth must be exactly 0 in scenario ${scenario}`)
        } else if (scenario === 'positive_net_worth') {
          assert.ok(netWorth > 0, `Net worth must be positive in scenario ${scenario}`)
        } else if (scenario === 'huge_numbers') {
          assert.equal(netWorth, 30_000_000_000, '50M - 20M = 30M')
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(scaleEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${scaleEvaluated} iterations across scale boundaries.\n`)
}

// ── Sub-Check D: Dirty / Malformed / Empty State Resilience ───────────────────
// Ensures zero exceptions, zero NaN values, and safe fallbacks when handling:
// - null / undefined inputs
// - NaN / non-numeric balance values
// - missing remainingAmount fields
{
  let dirtyEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 28 (Sub-check D): Dirty & Malformed State Resilience',
    fc.property(
      fc.array(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ id: fc.string(), balance: fc.constant(Number.NaN) }),
          fc.record({ id: fc.string(), balance: fc.constant('invalid-string') }),
          fc.record({ id: fc.string(), balance: fc.constant(0) }),
          fc.record({ id: fc.string(), balance: fc.constant(-999999) })
        ),
        { minLength: 1, maxLength: 10 }
      ),
      fc.array(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ id: fc.string(), principalAmount: fc.constant(Number.NaN) }),
          fc.record({ id: fc.string(), isSettled: fc.constant(true), remainingAmount: fc.constant(100000) })
        ),
        { minLength: 1, maxLength: 10 }
      ),
      (dirtyWallets, dirtyDebts) => {
        dirtyEvaluated++

        const assets = calculateTotalAssets(dirtyWallets)
        const liabilities = calculateTotalLiabilities(dirtyDebts)
        const netWorth = calculateNetWorth(assets, liabilities)

        assert.ok(Number.isFinite(assets), 'Assets must always be a finite number')
        assert.ok(Number.isFinite(liabilities), 'Liabilities must always be a finite number')
        assert.ok(Number.isFinite(netWorth), 'Net Worth must always be a finite number')

        assert.equal(assets, 0, 'Dirty non-positive wallet list must yield 0 assets')
        assert.equal(liabilities, 0, 'Dirty / settled debt list must yield 0 liabilities')
        assert.equal(netWorth, 0, '0 - 0 must equal 0 net worth')

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(dirtyEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${dirtyEvaluated} iterations for dirty input resilience.\n`)
}

// ── Concrete Blueprint Scenarios ──────────────────────────────────────────────
{
  console.log('▶ Running Concrete Blueprint Scenario Validations...')

  // Blueprint Scenario 1: Typical Indonesian Household
  // Wallets: BCA Rp12.500.000, Tunai Rp1.200.000, GoPay Rp350.000, PayLater -Rp500.000 (negative)
  // Debts: Cicilan Laptop (Rp10jt, paid Rp4jt, remaining Rp6jt), Pinjaman Teman (Rp1jt, paid Rp200k, remaining Rp800k)
  const bpWallets = [
    { id: 'bca', label: 'BCA', balance: 12_500_000 },
    { id: 'tunai', label: 'Tunai', balance: 1_200_000 },
    { id: 'gopay', label: 'GoPay', balance: 350_000 },
    { id: 'paylater', label: 'PayLater', balance: -500_000 }, // excluded from assets
  ]
  const bpDebts = [
    {
      id: 'd-laptop',
      name: 'Cicilan Laptop',
      principalAmount: 10_000_000,
      paidAmount: 4_000_000,
      remainingAmount: 6_000_000,
      isSettled: false,
    },
    {
      id: 'd-teman',
      name: 'Pinjaman Teman',
      principalAmount: 1_000_000,
      paidAmount: 200_000,
      remainingAmount: 800_000,
      isSettled: false,
    },
    {
      id: 'd-lunas',
      name: 'Pinjaman Lama',
      principalAmount: 5_000_000,
      paidAmount: 5_000_000,
      remainingAmount: 0,
      isSettled: true, // excluded from liabilities
    },
  ]

  const bpAssets = calculateTotalAssets(bpWallets)
  const bpLiabilities = calculateTotalLiabilities(bpDebts)
  const bpNetWorth = calculateNetWorth(bpAssets, bpLiabilities)

  assert.equal(bpAssets, 14_050_000, 'Total Assets: 12.5M + 1.2M + 350k = 14.05M')
  assert.equal(bpLiabilities, 6_800_000, 'Total Liabilities: 6M + 800k = 6.8M')
  assert.equal(bpNetWorth, 7_250_000, 'Net Worth: 14.05M - 6.8M = 7.25M')

  // Widget snapshot export test
  const bpSnapshot = generateWidgetSnapshot({
    wallets: bpWallets,
    debts: bpDebts,
  })
  assert.equal(bpSnapshot.netWorth, 7_250_000, 'Widget snapshot netWorth matches 7.25M')

  console.log('✓ Concrete blueprint validations passed successfully.')
}

console.log('\n========================================================================')
console.log('✅ ALL PROPERTY 28 (NET WORTH CALCULATION IDENTITY) PBT SUITES PASSED!')
console.log('========================================================================\n')
