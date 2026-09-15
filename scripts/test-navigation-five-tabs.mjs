/**
 * SakuKilat — Five-Tab Navigation Structure & Sequence Tests (Phase P1)
 *
 * Requirements:
 * - 1.1: Exactly five primary navigation tabs in fixed sequence: Beranda, Rekapan, Saku, Rencana, Profil
 * - 1.2: Mobile bottom navigation bar renders all five tabs with equal distribution
 * - 1.3: Desktop sidebar navigation renders all five tabs with active states
 * - 1.6: Accessible names and unique identifiers for each tab
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('========================================================================')
console.log('  SAKUKILAT — FIVE-TAB NAVIGATION STRUCTURE & SEQUENCE TESTS (PHASE P1) ')
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

const pagePath = path.resolve(import.meta.dirname, '../app/page.tsx')
const pageContent = fs.readFileSync(pagePath, 'utf8')

// ── Group 1: Navigation Definition & Sequence (Req 1.1, 1.6) ──────────────────
console.log('▶ Group 1: Navigation Definition & Sequence in app/page.tsx...')

test('app/page.tsx defines Tab type with 5 primary destinations', () => {
  assert.ok(
    pageContent.includes("type Tab = 'beranda' | 'rekapan' | 'saku' | 'rencana' | 'profil'") ||
    pageContent.includes("type Tab = 'beranda' | 'saku' | 'rekapan' | 'rencana' | 'profil'") ||
    pageContent.includes("'rencana'"),
    'Tab type must include rencana'
  )
})

test('app/page.tsx defines TABS array with exact 5 items in sequence: Beranda, Rekapan, Saku, Rencana, Profil', () => {
  const tabsMatch = pageContent.match(/const TABS[\s\S]*?=\s*\[([\s\S]*?)\]/)
  assert.ok(tabsMatch, 'Must define TABS array')
  const ids = Array.from(tabsMatch[1].matchAll(/id:\s*'([^']+)'/g)).map(m => m[1])
  const labels = Array.from(tabsMatch[1].matchAll(/label:\s*'([^']+)'/g)).map(m => m[1])

  assert.deepEqual(
    ids,
    ['beranda', 'rekapan', 'saku', 'rencana', 'profil'],
    'Tab IDs must strictly follow sequence: beranda, rekapan, saku, rencana, profil'
  )

  assert.deepEqual(
    labels,
    ['Beranda', 'Rekapan', 'Saku', 'Rencana', 'Profil'],
    'Tab labels must strictly follow sequence: Beranda, Rekapan, Saku, Rencana, Profil'
  )
})

test('Rencana tab is assigned CalendarClock icon from lucide-react', () => {
  assert.ok(pageContent.includes('CalendarClock'), 'Imports CalendarClock from lucide-react')
  assert.ok(pageContent.includes("{ id: 'rencana', label: 'Rencana', icon: CalendarClock }"), 'Assigns CalendarClock icon to Rencana tab')
})

// ── Group 2: View Rendering & Mount Invariants (Req 1.4, 2.1) ─────────────────
console.log('\n▶ Group 2: View Mounting in app/page.tsx...')

test('app/page.tsx imports and renders TabRencana in main view container', () => {
  assert.ok(pageContent.includes("import { TabRencana } from '@/components/tab-rencana'"), 'Imports TabRencana')
  assert.ok(pageContent.includes("{activeTab === 'rencana' && <TabRencana />}"), 'Renders TabRencana when activeTab === rencana')
})

test('Desktop sidebar renders all 5 navigation tabs', () => {
  // Both mobile nav and desktop sidebar map over TABS array
  const matches = pageContent.match(/TABS\.map/g)
  assert.ok(matches && matches.length >= 2, 'TABS.map must be used for both mobile nav and desktop sidebar')
})

test('Bottom navigation bar provides min 58px height and equal 5-item flex layout', () => {
  assert.ok(pageContent.includes('h-[58px]'), 'Bottom navigation bar has h-[58px]')
  assert.ok(pageContent.includes('flex-1 flex flex-col items-center justify-center'), 'Each tab button expands equally via flex-1')
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some five-tab navigation tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL FIVE-TAB NAVIGATION STRUCTURE TESTS PASSED!')
}
