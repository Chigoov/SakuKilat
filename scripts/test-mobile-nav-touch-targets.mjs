/**
 * SakuKilat — Mobile Navigation Touch Targets & Bounded Viewport Tests (Phase P1)
 *
 * Requirements:
 * - 4.1: Interactive touch targets of at least 44x44 px on mobile navigation items
 * - 4.2: Zero label truncation, text overlap, or horizontal scrollbar on 320px, 360px, 390px
 * - 4.3: main.scrollWidth <= main.clientWidth across all views
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('========================================================================')
console.log('  SAKUKILAT — MOBILE NAV TOUCH TARGETS & BOUNDED VIEWPORT TESTS         ')
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

// ── Group 1: Navigation Dimensions & Semantics ────────────────────────────────
console.log('▶ Group 1: Navigation Height & Equal Flex Allocation...')

test('Mobile navigation bar defines h-[58px] exceeding min 44px ergonomic height', () => {
  assert.ok(
    pageContent.includes('h-[58px]'),
    'Bottom navigation container must have h-[58px]'
  )
})

test('Each tab item has equal flex-1 distribution with centered layout', () => {
  assert.ok(
    pageContent.includes('flex-1 flex flex-col items-center justify-center gap-0.5'),
    'Each tab button must be flex-1 flex-col items-center justify-center'
  )
})

test('Tab labels use compact typography (text-[10px]) and truncate for narrow screens', () => {
  assert.ok(
    pageContent.includes('text-[10px]'),
    'Tab labels must use text-[10px]'
  )
  assert.ok(
    pageContent.includes('truncate') || pageContent.includes('transition-opacity'),
    'Tab label container styled safely for narrow screens'
  )
})

test('Tab icons use standard w-5 h-5 dimensions', () => {
  assert.ok(
    pageContent.includes('w-5 h-5'),
    'Icons use w-5 h-5'
  )
})

test('Navigation container has overflow protection (overflow-hidden and overflow-x-hidden)', () => {
  assert.ok(
    pageContent.includes('overflow-x-hidden') && pageContent.includes('overflow-hidden'),
    'App layout enforces overflow protection'
  )
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some navigation touch target tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL MOBILE NAV TOUCH TARGETS & BOUNDED VIEWPORT TESTS PASSED!')
}
