/**
 * SakuKilat — Unit & Regression Tests for Task 12.4:
 * Reconciliation UI Modal & Tab Saku Wallet Warning Badges
 *
 * Requirements:
 * - 6.1: Retrieve current recorded balance from store and prompt for actual physical balance
 * - 6.2: Calculate and display variance between actual physical balance and recorded balance
 * - 6.3: Create explicit reconciliation adjustment record with date, expected, actual, difference, note
 * - 6.6: Display warning badge on wallets that have never been reconciled
 * - 3.5: Host Rekonsiliasi Saldo under Kontrol Keuangan section in Tab Saku
 *
 * Run: node scripts/test-reconciliation-ui.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  calculateReconciliationVariance,
  formatReconciliationVariance,
  createReconciliationRecord,
  createAdjustmentTransaction,
  hasNeverBeenReconciled,
  getWalletReconciliationHistory,
  ReconciliationManager,
} from '../lib/reconciliation.ts'

import {
  SAKU_SECTIONS,
  getSectionById,
  getSubmenuItem,
} from '../lib/saku-sections.ts'

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

console.log('====================================================================')
console.log('  SAKUKILAT — TASK 12.4: RECONCILIATION MODAL & TAB SAKU UI TESTS  ')
console.log('====================================================================\n')

// ── Group 1: Component Source & File Integrity ─────────────────────────────────
console.log('▶ Group 1: Component Source & File Integrity (Task 12.4)...')

test('components/reconciliation-modal.tsx exists and defines ReconciliationModal', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/reconciliation-modal.tsx')
  assert.ok(fs.existsSync(modalPath), 'reconciliation-modal.tsx must exist')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('export const ReconciliationModal'), 'Must export ReconciliationModal')
  assert.ok(content.includes('data-testid="reconciliation-modal"'), 'Must define modal testid')
  assert.ok(content.includes('data-testid="reconcile-expected-balance"'), 'Must define expected balance container')
  assert.ok(content.includes('data-testid="reconcile-variance-preview"'), 'Must define variance preview container')
  assert.ok(content.includes('data-testid="reconcile-submit-btn"'), 'Must define submit button')
  assert.ok(content.includes('data-testid="reconcile-adjustment-toggle"'), 'Must define adjustment toggle')
})

test('components/tab-saku.tsx imports and integrates ReconciliationModal', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  assert.ok(fs.existsSync(tabSakuPath), 'tab-saku.tsx must exist')
  const content = fs.readFileSync(tabSakuPath, 'utf8')
  assert.ok(content.includes("import { ReconciliationModal } from '@/components/reconciliation-modal'"), 'Must import ReconciliationModal')
  assert.ok(content.includes('<ReconciliationModal'), 'Must render ReconciliationModal')
})

// ── Group 2: Expected vs Actual Balance Comparison & Variance Preview (Req 6.1, 6.2) ──
console.log('\n▶ Group 2: Balance Comparison & Variance Preview (Req 6.1, 6.2)...')

test('Calculates and previews surplus variance (actual > expected)', () => {
  const expected = 1_500_000
  const actual = 1_650_000
  const diff = calculateReconciliationVariance(actual, expected)
  assert.equal(diff, 150_000, 'Surplus diff should be +150.000')

  const formatted = formatReconciliationVariance(diff)
  assert.equal(formatted.status, 'surplus')
  assert.equal(formatted.badgeText, 'Saldo Lebih')
  assert.ok(formatted.formattedDifference.startsWith('+Rp'), 'Formatted difference must have +Rp prefix')
})

test('Calculates and previews shortfall variance (actual < expected)', () => {
  const expected = 2_000_000
  const actual = 1_850_000
  const diff = calculateReconciliationVariance(actual, expected)
  assert.equal(diff, -150_000, 'Shortfall diff should be -150.000')

  const formatted = formatReconciliationVariance(diff)
  assert.equal(formatted.status, 'shortfall')
  assert.equal(formatted.badgeText, 'Saldo Kurang')
  assert.ok(formatted.formattedDifference.startsWith('-Rp'), 'Formatted difference must have -Rp prefix')
})

test('Calculates and previews balanced state (actual === expected)', () => {
  const expected = 750_000
  const actual = 750_000
  const diff = calculateReconciliationVariance(actual, expected)
  assert.equal(diff, 0, 'Balanced diff should be 0')

  const formatted = formatReconciliationVariance(diff)
  assert.equal(formatted.status, 'balanced')
  assert.equal(formatted.badgeText, 'Sesuai')
})

// ── Group 3: Adjustment Transaction & Audit Trail (Req 6.3, 6.4) ───────────────
console.log('\n▶ Group 3: Adjustment Transaction & Non-Destructive Audit Trail (Req 6.3, 6.4)...')

test('Creates explicit adjustment transaction for surplus with explicit audit note', () => {
  const adjTx = createAdjustmentTransaction('bca', 'BCA', 75_000, 'Koreksi bunga bank')
  assert.ok(adjTx, 'Adjustment transaction must be created')
  assert.equal(adjTx.type, 'income', 'Surplus adjustment must be income')
  assert.equal(adjTx.amount, 75_000)
  assert.equal(adjTx.paymentMethod, 'bca')
  assert.equal(adjTx.subcategory, 'Penyesuaian Saldo')
  assert.equal(adjTx.note, 'Koreksi bunga bank')
})

test('Creates explicit adjustment transaction for shortfall with explicit audit note', () => {
  const adjTx = createAdjustmentTransaction('cash', 'Tunai', -25_000, 'Biaya admin lupa catat')
  assert.ok(adjTx, 'Adjustment transaction must be created')
  assert.equal(adjTx.type, 'expense', 'Shortfall adjustment must be expense')
  assert.equal(adjTx.amount, 25_000)
  assert.equal(adjTx.paymentMethod, 'cash')
  assert.equal(adjTx.note, 'Biaya admin lupa catat')
})

test('Returns null adjustment transaction when difference is 0', () => {
  const adjTx = createAdjustmentTransaction('gopay', 'GoPay', 0, 'Semua cocok')
  assert.equal(adjTx, null, 'No adjustment transaction needed when difference is 0')
})

test('Reconciliation record contains expected schema fields and audit notes', () => {
  const rec = createReconciliationRecord({
    walletId: 'jago',
    expectedBalance: 500_000,
    actualBalance: 520_000,
    note: 'Cek saldo bulanan',
    adjustmentTransactionId: 'txn-adj-123',
  })

  assert.equal(rec.walletId, 'jago')
  assert.equal(rec.expectedBalance, 500_000)
  assert.equal(rec.actualBalance, 520_000)
  assert.equal(rec.difference, 20_000)
  assert.equal(rec.note, 'Cek saldo bulanan')
  assert.equal(rec.adjustmentTransactionId, 'txn-adj-123')
  assert.ok(typeof rec.reconciledAt === 'string')
})

// ── Group 4: Unreconciled Wallet Warning Badges (Req 6.6, Property 19) ─────────
console.log('\n▶ Group 4: Unreconciled Wallet Warning Badges (Req 6.6, Property 19)...')

test('hasNeverBeenReconciled evaluates accurately according to Property 19', () => {
  // Case A: lastReconciledAt undefined -> unreconciled
  assert.equal(hasNeverBeenReconciled({ id: 'w1' }, []), true)

  // Case B: lastReconciledAt present but 0 records in reconciliations array -> unreconciled
  assert.equal(hasNeverBeenReconciled({ id: 'w2', lastReconciledAt: '2026-01-01T00:00:00Z' }, []), true)

  // Case C: lastReconciledAt present AND matching record exists -> reconciled (false)
  const mockRec = {
    id: 'r1',
    walletId: 'w3',
    reconciledAt: '2026-03-01T00:00:00Z',
    expectedBalance: 100_000,
    actualBalance: 100_000,
    difference: 0,
  }
  assert.equal(hasNeverBeenReconciled({ id: 'w3', lastReconciledAt: '2026-03-01T00:00:00Z' }, [mockRec]), false)
})

test('tab-saku.tsx renders unreconciled warning badge on wallets', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')

  assert.ok(content.includes('hasNeverBeenReconciled(wallet, reconciliations)'), 'Must check hasNeverBeenReconciled per wallet')
  assert.ok(content.includes('data-testid={`unreconciled-badge-${wallet.id}`}'), 'Must define unreconciled badge testid')
  assert.ok(content.includes('Belum Rekonsiliasi'), 'Must display "Belum Rekonsiliasi" text')
  assert.ok(content.includes('aria-label={`Rekonsiliasi ${wallet.label}`}'), 'Must provide direct reconciliation button on wallet card')
})

// ── Group 5: Tab Saku Kontrol Keuangan Section Integration (Req 3.5) ───────────
console.log('\n▶ Group 5: Tab Saku Kontrol Keuangan Linking (Req 3.5)...')

test('tab-saku.tsx renders Rekonsiliasi Saldo in Kontrol Keuangan with action button', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')

  assert.ok(content.includes('data-testid="submenu-rekonsiliasi-saldo"'), 'Must define submenu-rekonsiliasi-saldo testid')
  assert.ok(content.includes('data-submenu-id="rekonsiliasi-saldo"'), 'Must define submenu-id')
  assert.ok(content.includes('data-testid="btn-open-reconciliation"'), 'Must provide open reconciliation action button')
  assert.ok(content.includes('data-testid="kontrol-unreconciled-count-badge"'), 'Must show count badge when wallets are unreconciled')
  assert.ok(!content.includes('href="/rekonsiliasi"'), 'Must NOT contain fake href link')
})

// ── Group 6: History Drawer Management (Req 6.5) ───────────────────────────────
console.log('\n▶ Group 6: Audit History Management (Req 6.5)...')

test('getWalletReconciliationHistory sorts newest first', () => {
  const reconciliations = [
    { id: 'r1', walletId: 'w1', reconciledAt: '2026-01-01T10:00:00Z', expectedBalance: 100, actualBalance: 100, difference: 0 },
    { id: 'r2', walletId: 'w1', reconciledAt: '2026-02-01T10:00:00Z', expectedBalance: 120, actualBalance: 150, difference: 30 },
    { id: 'r3', walletId: 'w2', reconciledAt: '2026-03-01T10:00:00Z', expectedBalance: 200, actualBalance: 200, difference: 0 },
  ]

  const historyW1 = getWalletReconciliationHistory('w1', reconciliations)
  assert.equal(historyW1.length, 2)
  assert.equal(historyW1[0].id, 'r2', 'Newest reconciliation must come first')
  assert.equal(historyW1[1].id, 'r1', 'Older reconciliation must follow')
})

console.log('\n────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)
if (failed === 0) {
  console.log('✅ SEMUA TEST REKONSILIASI UI & TAB SAKU (TASK 12.4) BERHASIL LULUS!\n')
  process.exitCode = 0
} else {
  console.error('❌ BEBERAPA TEST GAGAL.\n')
  process.exitCode = 1
}
