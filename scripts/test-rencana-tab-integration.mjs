/**
 * SakuKilat — Tab Rencana Integration & Module Hosting Tests (Phase P1)
 *
 * Requirements:
 * - 2.1: Rencana view hosts GoalPlanner, BillManager, MonthlyClose, and NetWorth
 * - 2.2: Preserves state and data without modifying underlying storage keys
 * - 2.3: Consistent store dispatch and validation rules
 * - 2.5: Zero horizontal overflow on Rencana view
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('========================================================================')
console.log('  SAKUKILAT — TAB RENCANA INTEGRATION & MODULE HOSTING TESTS (PHASE P1) ')
console.log('========================================================================\n')

let total = 0
let passed = 0
let failed = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}`)
    console.error(`    → ${err.message}`)
    failed++
  }
}

const rencanaPath = path.resolve(import.meta.dirname, '../components/tab-rencana.tsx')
assert.ok(fs.existsSync(rencanaPath), 'components/tab-rencana.tsx must exist')
const rencanaContent = fs.readFileSync(rencanaPath, 'utf8')

// ── Group 1: Module Hosting & Component Structure (Req 2.1) ───────────────────
console.log('▶ Group 1: Module Hosting & Component Structure...')

test('TabRencana exports memoized component with header title Rencana', () => {
  assert.ok(rencanaContent.includes('export const TabRencana = memo(function TabRencana'), 'Exports TabRencana')
  assert.ok(rencanaContent.includes('Rencana</h2>'), 'Renders title Rencana')
})

test('TabRencana hosts GoalPlanner under data-testid="rencana-module-goals"', () => {
  assert.ok(rencanaContent.includes("import { GoalPlanner } from '@/components/goal-planner'"), 'Imports GoalPlanner')
  assert.ok(rencanaContent.includes('data-testid="rencana-module-goals"'), 'Contains module goals testid')
  assert.ok(rencanaContent.includes('<GoalPlanner />'), 'Renders <GoalPlanner />')
})

test('TabRencana hosts BillManager under data-testid="rencana-module-bills"', () => {
  assert.ok(rencanaContent.includes("import { BillManager } from '@/components/bill-manager'"), 'Imports BillManager')
  assert.ok(rencanaContent.includes('data-testid="rencana-module-bills"'), 'Contains module bills testid')
  assert.ok(rencanaContent.includes('<BillManager />'), 'Renders <BillManager />')
})

test('TabRencana hosts MonthlyClose under data-testid="rencana-module-monthly-close"', () => {
  assert.ok(rencanaContent.includes("import { MonthlyCloseModal } from '@/components/monthly-close-modal'"), 'Imports MonthlyCloseModal')
  assert.ok(rencanaContent.includes('data-testid="rencana-module-monthly-close"'), 'Contains module monthly-close testid')
  assert.ok(rencanaContent.includes('data-testid="btn-open-monthly-close-rencana"'), 'Provides trigger button for MonthlyClose')
  assert.ok(rencanaContent.includes('<MonthlyCloseModal'), 'Renders MonthlyCloseModal')
})

test('TabRencana hosts NetWorth under data-testid="rencana-module-net-worth"', () => {
  assert.ok(rencanaContent.includes("import { NetWorthModal } from '@/components/net-worth-panel'"), 'Imports NetWorthModal')
  assert.ok(rencanaContent.includes('data-testid="rencana-module-net-worth"'), 'Contains module net-worth testid')
  assert.ok(rencanaContent.includes('data-testid="btn-open-net-worth-rencana"'), 'Provides trigger button for NetWorth')
  assert.ok(rencanaContent.includes('<NetWorthModal'), 'Renders NetWorthModal')
})

test('TabRencana hosts Wawasan & Analisis Lengkap under data-testid="rencana-module-analytics"', () => {
  assert.ok(rencanaContent.includes('data-testid="rencana-module-analytics"'), 'Contains module analytics testid')
  assert.ok(rencanaContent.includes('Wawasan & Analisis Lengkap'), 'Renders title Wawasan & Analisis Lengkap')
  assert.ok(rencanaContent.includes('<CategoryBudgetCard />'), 'Renders CategoryBudgetCard')
  assert.ok(rencanaContent.includes('Cashflow Pintar'), 'Renders Cashflow Pintar')
  assert.ok(rencanaContent.includes('Insight Bulan Ini'), 'Renders Insight Bulan Ini')
  assert.ok(rencanaContent.includes('Analisis Keuangan'), 'Renders Analisis Keuangan')
})

// ── Group 2: Deep Link Events & Store Integration (Req 2.2, 2.4) ──────────────
console.log('\n▶ Group 2: Deep Link Events & Store Integration...')

test('TabRencana listens to custom events for monthly-close and net-worth', () => {
  assert.ok(rencanaContent.includes('sakukilat:open-monthly-close'), 'Listens to open-monthly-close')
  assert.ok(rencanaContent.includes('sakukilat:open-net-worth'), 'Listens to open-net-worth')
})

test('app/page.tsx listens to open-goals and open-bills to route directly to Rencana', () => {
  const pagePath = path.resolve(import.meta.dirname, '../app/page.tsx')
  const pageContent = fs.readFileSync(pagePath, 'utf8')
  assert.ok(pageContent.includes('sakukilat:open-goals'), 'Listens to open-goals')
  assert.ok(pageContent.includes('sakukilat:open-bills'), 'Listens to open-bills')
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some Tab Rencana integration tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL TAB RENCANA INTEGRATION TESTS PASSED!')
}
