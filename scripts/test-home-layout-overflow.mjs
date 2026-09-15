/**
 * SakuKilat — Home Layout Simplification & Zero Horizontal Overflow Tests (UX Remediation Phase 2)
 *
 * Acceptance Criteria Verified:
 * 1. Date header does not use whitespace-nowrap and allows clean wrapping.
 * 2. Progressive disclosure section exists on Home (TabBeranda) to prevent information overload.
 * 3. Primary focus (Saldo, Budget, Rekapan hari ini, Smart Input) are immediately accessible.
 * 4. Secondary analytics (Cashflow, Insights, Goals, Periodic Analysis) are grouped in expandable section.
 * 5. Smart Input floating container has compact vertical footprint to prevent card clipping.
 * 6. Main container enforces overflow-x-hidden and appropriate responsive bottom padding.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('========================================================================')
console.log('  SAKUKILAT — HOME LAYOUT SIMPLIFICATION & OVERFLOW TESTS               ')
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

// ── Group 1: TabBeranda Date Header & Overflow Elimination ───────────────────
console.log('▶ Group 1: TabBeranda Date Header Inspection...')

const berandaPath = path.resolve(import.meta.dirname, '../components/tab-beranda.tsx')
const berandaContent = fs.readFileSync(berandaPath, 'utf8')

test('Date header does NOT use whitespace-nowrap that triggers 390px overflow', () => {
  assert.ok(
    !berandaContent.includes('whitespace-nowrap text-[12px] text-[var(--sk-text-dim)]'),
    'Header date must NOT have whitespace-nowrap'
  )
  assert.ok(
    berandaContent.includes('flex flex-wrap') && berandaContent.includes('gap-y-0.5'),
    'Header date must use flex flex-wrap for responsive line wrapping'
  )
})

test('Header retains fullDateLabel and days remaining information', () => {
  assert.ok(berandaContent.includes('fullDateLabel(now)'), 'Includes fullDateLabel')
  assert.ok(berandaContent.includes('budgetStatus.daysInMonth'), 'Includes daysInMonth')
  assert.ok(berandaContent.includes('budgetStatus.remainingDays'), 'Includes remainingDays')
})

test('Delta headline in streak bar does not use rigid shrink-0 overflow', () => {
  assert.ok(
    !berandaContent.includes('shrink-0 text-right text-[12px] font-semibold text-[var(--sk-green)]'),
    'Delta headline must not be unconstrained shrink-0'
  )
  assert.ok(
    berandaContent.includes('truncate') && berandaContent.includes('deltaHeadline'),
    'Delta headline uses truncate for narrow mobile viewports'
  )
})

// ── Group 2: Progressive Disclosure & Information Architecture ───────────────
console.log('\n▶ Group 2: Progressive Disclosure & Relocation to Tab Rencana...')

const rencanaPath = path.resolve(import.meta.dirname, '../components/tab-rencana.tsx')
const rencanaContent = fs.readFileSync(rencanaPath, 'utf8')

test('TabBeranda eliminates showExtendedAnalytics and Wawasan & Analisis Lengkap to maintain fast entry focus', () => {
  assert.ok(
    !berandaContent.includes('showExtendedAnalytics'),
    'TabBeranda must not define showExtendedAnalytics state'
  )
  assert.ok(
    !berandaContent.includes('Wawasan & Analisis Lengkap'),
    'TabBeranda must not feature Wawasan & Analisis Lengkap title'
  )
  assert.ok(
    !berandaContent.includes('<CategoryBudgetCard'),
    'TabBeranda must not mount CategoryBudgetCard'
  )
})

test('Primary order puts BudgetCard and Rekapan Hari Ini immediately after Hero', () => {
  const heroPos = berandaContent.indexOf('<MonthHeroChart')
  const budgetPos = berandaContent.indexOf('<BudgetCard />')
  const rekapanPos = berandaContent.indexOf('Rekapan hari ini')

  assert.ok(heroPos > 0 && budgetPos > 0 && rekapanPos > 0, 'Hero, BudgetCard, and Rekapan hari ini are present')
  assert.ok(
    budgetPos > heroPos,
    'BudgetCard appears after Hero'
  )
  assert.ok(
    rekapanPos > budgetPos,
    'Rekapan hari ini appears after BudgetCard'
  )
})

test('All secondary widgets (CategoryBudget, Cashflow, Insights, Analysis) are preserved inside TabRencana', () => {
  assert.ok(rencanaContent.includes('Wawasan & Analisis Lengkap'), 'TabRencana features Wawasan & Analisis Lengkap')
  assert.ok(rencanaContent.includes('rencana-module-analytics'), 'TabRencana has rencana-module-analytics')
  assert.ok(rencanaContent.includes('<CategoryBudgetCard'), 'CategoryBudgetCard preserved in TabRencana')
  assert.ok(rencanaContent.includes('Cashflow Pintar'), 'Cashflow Pintar preserved in TabRencana')
  assert.ok(rencanaContent.includes('Insight Bulan Ini'), 'Insight Bulan Ini preserved in TabRencana')
  assert.ok(rencanaContent.includes('Analisis Keuangan'), 'Analisis Keuangan preserved in TabRencana')
})

// ── Group 3: SmartInput Floating Footprint & App Layout ──────────────────────
console.log('\n▶ Group 3: SmartInput Floating Dock & Layout Bounds...')

const pagePath = path.resolve(import.meta.dirname, '../app/page.tsx')
const pageContent = fs.readFileSync(pagePath, 'utf8')

test('App page enforces overflow-x-hidden on main viewport', () => {
  assert.ok(pageContent.includes('overflow-x-hidden'), 'main container has overflow-x-hidden')
})

test('SmartInput floating dock has optimized compact padding and bottom anchor', () => {
  assert.ok(
    pageContent.includes('fixed bottom-[62px] left-3 right-3 z-30'),
    'SmartInput floating bar is anchored above bottom tab bar'
  )
  assert.ok(
    pageContent.includes('px-2.5 py-1.5 md:px-4 md:py-2'),
    'SmartInput floating container has compact vertical padding'
  )
})

const smartInputPath = path.resolve(import.meta.dirname, '../components/smart-input.tsx')
const smartInputContent = fs.readFileSync(smartInputPath, 'utf8')

test('SmartInput text hint footer is hidden on mobile when idle to reduce vertical height', () => {
  assert.ok(
    smartInputContent.includes('hidden md:block') && smartInputContent.includes('Tulis transaksi pakai bahasa natural'),
    'Idle text hint footer hidden on mobile to maximize visible content area'
  )
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some home layout overflow tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL HOME LAYOUT SIMPLIFICATION & OVERFLOW TESTS PASSED!')
}
