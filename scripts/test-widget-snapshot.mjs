/**
 * SakuKilat — Unit & Integration Test for NativeWidgetSnapshot Bridge (Task 8.1)
 *
 * Validates:
 * - Aggregation of totalBalance, monthlyExpense, monthlyExpenseTxCount, nearestBill, primaryGoal, recent 3 transactions
 * - Bounded payload size (< 4,096 bytes) and zero raw ledger leakage
 * - Storage synchronization under key 'sakukilat:v2:widget-snapshot'
 * - Update broadcast dispatching
 * - Widget layout dimension mapping (Small / Medium / Large)
 * - Beranda page isolation (untouched)
 * - Requirements: 4.1, 4.4, 4.5, 4.8, 4.9
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  generateWidgetSnapshot,
  serializeWidgetSnapshot,
  parseWidgetSnapshot,
  getWidgetLayoutForDimensions,
  MAX_WIDGET_SNAPSHOT_SIZE,
  WIDGET_SNAPSHOT_KEY,
} from '../lib/widget-snapshot.ts'
import {
  saveWidgetSnapshotToNative,
  readWidgetSnapshotFromNative,
  triggerWidgetUpdateBroadcast,
} from '../lib/native-store.ts'

console.log('====================================================')
console.log('   SAKUKILAT — NATIVE WIDGET SNAPSHOT UNIT TESTS    ')
console.log('====================================================\n')

// ── Mock window & localStorage for Node runtime ─────────────────────────────
const mockLocalStorage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => mockLocalStorage.get(k) ?? null,
    setItem: (k, v) => mockLocalStorage.set(k, String(v)),
    removeItem: (k) => mockLocalStorage.delete(k),
    clear: () => mockLocalStorage.clear(),
  },
  dispatchEvent: (event) => {
    dispatchedEvents.push(event)
    return true
  },
}
globalThis.CustomEvent = class CustomEvent {
  constructor(type, detail) {
    this.type = type
    this.detail = detail
  }
}

const dispatchedEvents = []

// ── Test 1: Aggregates totalBalance correctly ───────────────────────────────
{
  console.log('▶ Test 1: Aggregate totalBalance across multiple wallets...')
  const wallets = [
    { id: 'bca', label: 'BCA', balance: 5_000_000 },
    { id: 'gopay', label: 'GoPay', balance: 250_000 },
    { id: 'tunai', label: 'Tunai', balance: 100_000 },
  ]
  const snapshot = generateWidgetSnapshot({ wallets })

  assert.equal(snapshot.totalBalance, 5_350_000)
  assert.equal(snapshot.version, 1)
  assert.ok(snapshot.generatedAt > 0)
  console.log('  ✓ Total balance correctly aggregated to Rp5.350.000\n')
}

// ── Test 2: Monthly expense & transaction count calculation ─────────────────
{
  console.log('▶ Test 2: Monthly expense and transaction count (current month only)...')
  const now = new Date(2026, 8, 15, 12, 0, 0) // September 2026

  const transactions = [
    // Current month expenses:
    { id: 't1', description: 'Makan Siang', amount: 35_000, type: 'expense', date: new Date(2026, 8, 1) },
    { id: 't2', description: 'Bensin', amount: 50_000, type: 'expense', date: new Date(2026, 8, 10) },
    { id: 't3', description: 'Kopi', amount: 25_000, type: 'expense', date: new Date(2026, 8, 15) },
    // Current month income (excluded from monthlyExpense):
    { id: 't4', description: 'Gaji', amount: 5_000_000, type: 'income', date: new Date(2026, 8, 5) },
    // Current month transfer (excluded from monthlyExpense):
    { id: 't5', description: 'Tf BCA ke Gopay', amount: 100_000, type: 'expense', kind: 'transfer', date: new Date(2026, 8, 8) },
    // Previous month expense (excluded):
    { id: 't6', description: 'Belanja Agustus', amount: 200_000, type: 'expense', date: new Date(2026, 7, 28) },
    // Next month expense (excluded):
    { id: 't7', description: 'Belanja Oktober', amount: 150_000, type: 'expense', date: new Date(2026, 9, 2) },
  ]

  const snapshot = generateWidgetSnapshot({ transactions, now })

  assert.equal(snapshot.monthlyExpense, 110_000) // 35k + 50k + 25k
  assert.equal(snapshot.monthlyExpenseTxCount, 3) // 3 expense transactions in Sep 2026
  console.log('  ✓ Correctly aggregated 3 expense transactions = Rp110.000 (transfers and other months excluded)\n')
}

// ── Test 3: Recent transactions bounded to 3 items and sorted descending ───
{
  console.log('▶ Test 3: Recent transactions bounded to 3 items and isolated metadata...')
  const now = new Date(2026, 8, 15, 14, 30, 0)
  const transactions = [
    { id: 'old1', description: 'Old 1', amount: 10_000, type: 'expense', date: new Date(2026, 8, 1, 10, 0) },
    { id: 'old2', description: 'Old 2', amount: 20_000, type: 'expense', date: new Date(2026, 8, 5, 10, 0) },
    { id: 'rec1', description: 'Makan Siang', amount: 35_000, type: 'expense', date: new Date(2026, 8, 15, 12, 30) },
    { id: 'rec2', description: 'Kopi Sore', amount: 25_000, type: 'expense', date: new Date(2026, 8, 15, 14, 0) },
    { id: 'rec3', description: 'Transfer Tabungan', amount: 500_000, type: 'expense', kind: 'transfer', date: new Date(2026, 8, 15, 14, 15) },
  ]

  const snapshot = generateWidgetSnapshot({ transactions, now })

  assert.equal(snapshot.recentTransactions.length, 3)
  assert.equal(snapshot.recentTransactions[0].id, 'rec3')
  assert.equal(snapshot.recentTransactions[0].type, 'transfer')
  assert.equal(snapshot.recentTransactions[1].id, 'rec2')
  assert.equal(snapshot.recentTransactions[2].id, 'rec1')

  // Check formattedDate uses Indonesian format
  assert.ok(snapshot.recentTransactions[0].formattedDate.includes('Hari ini'))

  // Verify no raw transaction ledger leakage
  assert.equal(snapshot.transactions, undefined)
  console.log('  ✓ Recent transactions correctly bounded to 3, sorted newest first, with zero ledger leakage\n')
}

// ── Test 4: Nearest bill projection (Property 16) ───────────────────────────
{
  console.log('▶ Test 4: Nearest bill projection (minimum nextDueDate >= today)...')
  const now = new Date(2026, 8, 15) // 2026-09-15

  const bills = [
    { id: 'b1', name: 'Netflix', amount: 186_000, nextDueDate: '2026-09-10', isActive: true }, // Overdue
    { id: 'b2', name: 'Listrik PLN', amount: 450_000, nextDueDate: '2026-09-20', isActive: true }, // 5 days away
    { id: 'b3', name: 'Internet WiFi', amount: 350_000, nextDueDate: '2026-09-28', isActive: true }, // 13 days away
    { id: 'b4', name: 'Spotify (Nonaktif)', amount: 55_000, nextDueDate: '2026-09-16', isActive: false }, // Inactive
  ]

  const snapshot = generateWidgetSnapshot({ bills, now })

  assert.ok(snapshot.nearestBill)
  assert.equal(snapshot.nearestBill.name, 'Listrik PLN')
  assert.equal(snapshot.nearestBill.amount, 450_000)
  assert.equal(snapshot.nearestBill.dueDateStr, '2026-09-20')
  assert.equal(snapshot.nearestBill.isOverdue, false)
  console.log('  ✓ Nearest bill correctly selected as "Listrik PLN" (minimum nextDueDate >= today)\n')

  // Case: all bills overdue -> should pick closest overdue
  const overdueOnlyBills = [
    { id: 'b1', name: 'Air PAM', amount: 80_000, nextDueDate: '2026-09-05', isActive: true },
    { id: 'b2', name: 'Netflix', amount: 186_000, nextDueDate: '2026-09-12', isActive: true }, // Closer to 2026-09-15
  ]
  const overdueSnapshot = generateWidgetSnapshot({ bills: overdueOnlyBills, now })
  assert.ok(overdueSnapshot.nearestBill)
  assert.equal(overdueSnapshot.nearestBill.name, 'Netflix')
  assert.equal(overdueSnapshot.nearestBill.isOverdue, true)
  console.log('  ✓ All-overdue scenario picks closest overdue bill\n')
}

// ── Test 5: Primary goal progress calculation ───────────────────────────────
{
  console.log('▶ Test 5: Primary goal progress calculation...')
  const goals = [
    { id: 'g1', name: 'Dana Darurat', targetAmount: 10_000_000, currentAmount: 4_500_000 },
    { id: 'g2', name: 'Liburan Bali', targetAmount: 5_000_000, currentAmount: 1_000_000 },
  ]
  const snapshot = generateWidgetSnapshot({ goals })

  assert.ok(snapshot.primaryGoal)
  assert.equal(snapshot.primaryGoal.name, 'Dana Darurat')
  assert.equal(snapshot.primaryGoal.currentAmount, 4_500_000)
  assert.equal(snapshot.primaryGoal.targetAmount, 10_000_000)
  assert.equal(snapshot.primaryGoal.percentComplete, 45)
  console.log('  ✓ Primary goal correctly calculated: 45% completion\n')
}

// ── Test 6: Unreconciled wallets indicator & Net Worth ──────────────────────
{
  console.log('▶ Test 6: Unreconciled wallets indicator and Net Worth calculation...')
  const wallets = [
    { id: 'bca', balance: 10_000_000, lastReconciledAt: '2026-09-01T00:00:00Z' },
    { id: 'tunai', balance: 500_000 }, // undefined lastReconciledAt
  ]
  const debts = [
    { id: 'd1', principalAmount: 2_000_000, paidAmount: 500_000, remainingAmount: 1_500_000, isSettled: false },
  ]

  const snapshot = generateWidgetSnapshot({ wallets, debts })

  assert.equal(snapshot.hasUnreconciledWallets, true)
  // Net Worth = (10_000_000 + 500_000) - 1_500_000 = 9_000_000
  assert.equal(snapshot.netWorth, 9_000_000)
  console.log('  ✓ hasUnreconciledWallets is true and Net Worth = Rp9.000.000\n')
}

// ── Test 7: Strict Payload Size Bound (< 4,096 bytes) ───────────────────────
{
  console.log('▶ Test 7: Strict Payload Size Bound (< 4,096 bytes) under large inputs...')
  // Generate 100 transactions with long descriptions
  const hugeTransactions = Array.from({ length: 100 }, (_, i) => ({
    id: `tx-long-${i}`,
    description: `Transaksi sangat panjang nomor ${i} `.repeat(10),
    amount: (i + 1) * 10_000,
    type: 'expense',
    date: new Date(2026, 8, 1 + (i % 25)),
  }))

  const snapshot = generateWidgetSnapshot({
    transactions: hugeTransactions,
    wallets: [{ id: 'w1', balance: 1_000_000 }],
  })

  const serialized = serializeWidgetSnapshot(snapshot)
  console.log(`  Serialized snapshot byte length: ${serialized.length} bytes`)
  assert.ok(serialized.length < MAX_WIDGET_SNAPSHOT_SIZE)
  assert.ok(serialized.length < 2048) // typically well under 2KB
  assert.ok(!serialized.includes('tx-long-99')) // older transactions strictly excluded

  const parsed = parseWidgetSnapshot(serialized)
  assert.ok(parsed)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.recentTransactions.length, 3)
  console.log('  ✓ Serialized snapshot payload size strictly bounded (< 4,096 bytes)\n')
}

// ── Test 8: Native Storage Synchronization & Broadcast ───────────────────────
{
  console.log('▶ Test 8: Native Storage Synchronization & Broadcast...')
  const snapshot = generateWidgetSnapshot({
    wallets: [{ id: 'bca', balance: 2_500_000 }],
  })
  const json = serializeWidgetSnapshot(snapshot)

  // Save to native storage
  await saveWidgetSnapshotToNative(json)
  assert.equal(mockLocalStorage.get(WIDGET_SNAPSHOT_KEY), json)

  // Read back
  const readBack = await readWidgetSnapshotFromNative()
  assert.equal(readBack, json)

  // Trigger update broadcast
  dispatchedEvents.length = 0
  await triggerWidgetUpdateBroadcast()
  assert.equal(dispatchedEvents.length, 1)
  assert.equal(dispatchedEvents[0].type, 'sakukilat:widget-updated')
  console.log('  ✓ Snapshot successfully persisted to storage and broadcast event dispatched\n')
}

// ── Test 9: Widget Layout Dimension Mapping (Small, Medium, Large) ──────────
{
  console.log('▶ Test 9: Widget Layout Dimension Mapping...')
  assert.equal(getWidgetLayoutForDimensions(100), 'small')
  assert.equal(getWidgetLayoutForDimensions(179), 'small')
  assert.equal(getWidgetLayoutForDimensions(180), 'medium')
  assert.equal(getWidgetLayoutForDimensions(259), 'medium')
  assert.equal(getWidgetLayoutForDimensions(260), 'large')
  assert.equal(getWidgetLayoutForDimensions(350), 'large')
  console.log('  ✓ Dimension mapping: <180dp (Small), 180-259dp (Medium), >=260dp (Large)\n')
}

// ── Test 10: Beranda Page Invariant (Untouched) ──────────────────────────────
{
  console.log('▶ Test 10: Verify web app internal Beranda page is completely untouched...')
  const tabBerandaPath = resolve(import.meta.dirname, '../components/tab-beranda.tsx')
  const berandaContent = readFileSync(tabBerandaPath, 'utf8')

  // Verify no widget customization canvas or preview cards injected
  assert.ok(!berandaContent.includes('NativeWidgetSnapshot'))
  assert.ok(!berandaContent.includes('AppWidgetProvider'))
  assert.ok(!berandaContent.includes('widget_small'))
  assert.ok(!berandaContent.includes('Tambahkan Widget'))
  console.log('  ✓ Tab Beranda is 100% clean and untouched by widgets\n')
}

console.log('====================================================')
console.log('  ALL WIDGET SNAPSHOT TESTS PASSED SUCCESSFULLY! ✅ ')
console.log('====================================================\n')
