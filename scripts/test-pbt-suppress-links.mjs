/**
 * SakuKilat — Property-Based Test Suite for Phase P3: Tab Saku Structured Submenus
 *
 * Feature: sakukilat-core-roadmap, Property 10: Unimplemented Submenu Link Suppression
 * Validates: Requirements 3.8
 *
 * Formal Property Statement:
 * For any submenu item configuration in Tab Saku where isImplemented is false,
 * the submenu renderer SHALL suppress interactive links and prevent rendering
 * empty placeholder destinations.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
} from './pbt-harness.mjs'
import {
  SAKU_SECTIONS,
  getSakuSections,
  getSectionById,
  getSubmenuItem,
  isSubmenuImplemented,
  resolveSubmenuLink,
  getSubmenuRenderDescriptor,
  renderUnimplementedSubmenuMarkup,
} from '../lib/saku-sections.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: UNIMPLEMENTED LINK SUPPRESSION   ')
console.log('====================================================\n')

// Pool of realistic submenu identifiers
const KNOWN_UNIMPLEMENTED_IDS = [
  'rekonsiliasi-saldo',
  'tutup-bulan',
  'net-worth',
]

const KNOWN_IMPLEMENTED_IDS = [
  'daftar-saku',
  'metode-pembayaran',
  'transfer-antar-saku',
  'kategori-pemasukan',
  'kategori-pengeluaran',
  'subkategori',
  'goals',
  'tagihan-langganan',
]

const TARGET_PHASES = ['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'v2', 'v3', 'Phase-Next']

// Smart generator for arbitrary unimplemented submenu item
const arbUnimplementedSubmenuItem = fc.record({
  id: fc.oneof(
    fc.constantFrom(...KNOWN_UNIMPLEMENTED_IDS),
    fc.stringMatching(/^[a-z]{3,10}(-[a-z]{3,10}){1,3}$/)
  ),
  label: fc.string({ minLength: 2, maxLength: 40 }),
  description: fc.option(fc.string({ minLength: 3, maxLength: 80 }), { nil: undefined }),
  isImplemented: fc.constant(false),
  targetPhase: fc.option(fc.constantFrom(...TARGET_PHASES), { nil: undefined }),
})

// Smart generator for arbitrary submenu item with mixed implementation status
const arbPolymorphicSubmenuItem = fc.record({
  id: fc.oneof(
    fc.constantFrom(...KNOWN_IMPLEMENTED_IDS, ...KNOWN_UNIMPLEMENTED_IDS),
    fc.stringMatching(/^[a-z]{3,10}(-[a-z]{3,10}){1,3}$/)
  ),
  label: fc.string({ minLength: 2, maxLength: 40 }),
  description: fc.option(fc.string({ minLength: 3, maxLength: 80 }), { nil: undefined }),
  isImplemented: fc.boolean(),
  targetPhase: fc.option(fc.constantFrom(...TARGET_PHASES), { nil: undefined }),
})

// ── Property 10: Unimplemented Submenu Link Suppression ────────────────────────
// Validates: Requirements 3.8
{
  let totalEvaluated = 0
  let withPhaseCount = 0
  let withDescCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 10: Unimplemented Submenu Link Suppression',
    fc.property(arbUnimplementedSubmenuItem, (item) => {
      totalEvaluated++
      if (item.targetPhase) withPhaseCount++
      if (item.description) withDescCount++

      // ── INVARIANT 1: Navigation Target Suppression ──────────────────────────
      // For any item where isImplemented is false, resolveSubmenuLink MUST return strictly null.
      const resolvedLink = resolveSubmenuLink(item)
      assert.equal(
        resolvedLink,
        null,
        `Unimplemented item "${item.id}" must NOT have a navigation link, got: "${resolvedLink}"`
      )

      // ── INVARIANT 2: Render Descriptor Non-Interactive Semantics ────────────
      const descriptor = getSubmenuRenderDescriptor(item)
      assert.equal(
        descriptor.isImplemented,
        false,
        `Descriptor isImplemented must be false for "${item.id}"`
      )
      assert.equal(
        descriptor.isInteractive,
        false,
        `Descriptor isInteractive must be false for unimplemented item "${item.id}"`
      )
      assert.equal(
        descriptor.href,
        null,
        `Descriptor href must be null for unimplemented item "${item.id}"`
      )
      assert.equal(
        descriptor.ariaDisabled,
        true,
        `Descriptor ariaDisabled must be true for unimplemented item "${item.id}"`
      )
      assert.equal(
        descriptor.dataImplemented,
        'false',
        `Descriptor dataImplemented must be string "false" for unimplemented item "${item.id}"`
      )
      assert.ok(
        typeof descriptor.badgeText === 'string' && descriptor.badgeText.length > 0,
        `Descriptor badgeText must be non-empty string for unimplemented item`
      )
      assert.ok(
        descriptor.badgeText.includes('Segera Hadir'),
        `Badge text must indicate "Segera Hadir", got: "${descriptor.badgeText}"`
      )
      if (item.targetPhase) {
        assert.ok(
          descriptor.badgeText.includes(item.targetPhase),
          `Badge text must include targetPhase "${item.targetPhase}", got: "${descriptor.badgeText}"`
        )
      }

      // ── INVARIANT 3: HTML Markup Link & Navigation Suppression ──────────────
      const markup = renderUnimplementedSubmenuMarkup(item)

      // 3.1: Zero <a> tags permitted
      assert.equal(
        /<a[\s>]/i.test(markup),
        false,
        `Unimplemented markup for "${item.id}" must NOT contain <a> anchor tags`
      )
      assert.equal(
        /<\/a>/i.test(markup),
        false,
        `Unimplemented markup for "${item.id}" must NOT contain </a> closing anchor tags`
      )

      // 3.2: Zero href attributes permitted (no href="#", href="/", href="", etc.)
      assert.equal(
        /href\s*=/i.test(markup),
        false,
        `Unimplemented markup for "${item.id}" must NOT contain any href attribute`
      )

      // 3.3: Zero link roles permitted
      assert.equal(
        /role\s*=\s*["']link["']/i.test(markup),
        false,
        `Unimplemented markup must NOT define role="link"`
      )

      // 3.4: Required accessibility and status data attributes
      assert.ok(
        markup.includes('data-implemented="false"'),
        `Markup must declare data-implemented="false"`
      )
      assert.ok(
        markup.includes('aria-disabled="true"'),
        `Markup must declare aria-disabled="true"`
      )
      assert.ok(
        markup.includes('cursor-not-allowed'),
        `Markup must convey non-interactive visual cursor (cursor-not-allowed)`
      )
      assert.ok(
        markup.includes('select-none'),
        `Markup must convey non-interactive select-none styling`
      )

      // 3.5: No empty placeholder destination patterns
      const placeholderAntiPatterns = [
        /href\s*=\s*["']#["']/,
        /href\s*=\s*["']\/["']/,
        /href\s*=\s*["']["']/,
        /href\s*=\s*["']javascript:.*["']/,
      ]
      for (const pattern of placeholderAntiPatterns) {
        assert.equal(
          pattern.test(markup),
          false,
          `Markup must not match placeholder anti-pattern ${pattern}`
        )
      }

      return true
    }),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} runs, evaluated ${totalEvaluated}`
  )
  assert.ok(withPhaseCount > 0, `Expected items with targetPhase, got ${withPhaseCount}`)
  assert.ok(withDescCount > 0, `Expected items with description, got ${withDescCount}`)
  console.log(`    Coverage: ${totalEvaluated} items tested (${withPhaseCount} with phase badge, ${withDescCount} with descriptions).`)
}

// ── Property 10 (Sub-check A): Partition and Link Filter Soundness ──────────────
// Validates: Requirements 3.8
// For any collection of submenu items, filtering for active links SHALL NEVER include
// any item where isImplemented is false.
{
  let partitionRuns = 0

  const arbMixedSection = fc.record({
    sectionId: fc.stringMatching(/^[a-z]{4,10}(-[a-z]{4,10})*$/),
    title: fc.string({ minLength: 3, maxLength: 30 }),
    items: fc.array(arbPolymorphicSubmenuItem, { minLength: 1, maxLength: 15 }),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 10 (Sub-check A): Partition and Link Filter Soundness',
    fc.property(arbMixedSection, (section) => {
      partitionRuns++

      const unimplementedItems = section.items.filter((i) => !i.isImplemented)
      const implementedItems = section.items.filter((i) => i.isImplemented)

      // 1. Every unimplemented item must resolve to null link
      for (const item of unimplementedItems) {
        assert.equal(
          resolveSubmenuLink(item),
          null,
          `Unimplemented item "${item.id}" must resolve to null link`
        )
        const desc = getSubmenuRenderDescriptor(item)
        assert.equal(desc.isInteractive, false)
        assert.equal(desc.ariaDisabled, true)
        assert.equal(desc.dataImplemented, 'false')
      }

      // 2. Filter for navigable links must contain ZERO items from unimplemented set
      const navigableLinks = section.items
        .map((i) => ({ item: i, link: resolveSubmenuLink(i) }))
        .filter((entry) => entry.link !== null)

      for (const entry of navigableLinks) {
        assert.equal(
          entry.item.isImplemented,
          true,
          `Navigable link "${entry.link}" must belong strictly to an implemented item, got "${entry.item.id}" (isImplemented=${entry.item.isImplemented})`
        )
      }

      assert.equal(
        navigableLinks.length,
        implementedItems.length,
        `Navigable links count (${navigableLinks.length}) must equal implemented items count (${implementedItems.length})`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(partitionRuns >= MIN_PBT_RUNS)
}

// ── Property 10 (Sub-check B): Prevention of Placeholder Destination Anti-Patterns
// Validates: Requirements 3.8
// Even under adversarial inputs (e.g. empty labels, tricky ID names, weird whitespace),
// no placeholder href is ever generated or leaked.
{
  let antiPatternRuns = 0

  const arbAdversarialUnimplemented = fc.record({
    id: fc.stringMatching(/^[a-z0-9_-]{1,20}$/),
    label: fc.string({ minLength: 0, maxLength: 50 }),
    description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    isImplemented: fc.constant(false),
    targetPhase: fc.option(fc.string({ minLength: 0, maxLength: 10 }), { nil: undefined }),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 10 (Sub-check B): Prevention of Placeholder Destination Anti-Patterns',
    fc.property(arbAdversarialUnimplemented, (item) => {
      antiPatternRuns++

      const link = resolveSubmenuLink(item)
      assert.equal(link, null, 'resolveSubmenuLink must strictly be null for unimplemented items')

      const descriptor = getSubmenuRenderDescriptor(item)
      assert.equal(descriptor.href, null, 'descriptor.href must be null')
      assert.equal(descriptor.isInteractive, false, 'descriptor.isInteractive must be false')
      assert.equal(descriptor.ariaDisabled, true, 'descriptor.ariaDisabled must be true')

      const markup = renderUnimplementedSubmenuMarkup(item)
      // Check for presence of forbidden href attributes
      assert.equal(/href/i.test(markup), false, 'Markup must never contain "href"')
      // Check for forbidden <a> tags
      assert.equal(/<a\b/i.test(markup), false, 'Markup must never contain <a> tags')

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(antiPatternRuns >= MIN_PBT_RUNS)
}

// ── Property 10 (Sub-check C): Availability Badge Text Formatting Invariance ───
// Validates: Requirements 3.8
{
  let badgeRuns = 0

  const arbBadgeScenario = fc.record({
    id: fc.stringMatching(/^[a-z0-9-]+$/),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    isImplemented: fc.boolean(),
    targetPhase: fc.option(fc.stringMatching(/^[A-Za-z0-9._-]{1,15}$/), { nil: undefined }),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 10 (Sub-check C): Availability Badge Text Formatting Invariance',
    fc.property(arbBadgeScenario, ({ id, label, isImplemented, targetPhase }) => {
      badgeRuns++

      const item = { id, label, isImplemented, targetPhase }
      const descriptor = getSubmenuRenderDescriptor(item)

      if (isImplemented) {
        assert.equal(
          descriptor.badgeText,
          null,
          'Implemented items must not have a "Segera Hadir" badge'
        )
      } else {
        assert.ok(
          descriptor.badgeText !== null && descriptor.badgeText !== undefined,
          'Unimplemented items must always have a badgeText'
        )
        if (targetPhase && targetPhase.trim().length > 0) {
          assert.equal(
            descriptor.badgeText,
            `Segera Hadir (${targetPhase.trim()})`,
            `Badge must format phase as "Segera Hadir (${targetPhase.trim()})"`
          )
        } else {
          assert.equal(
            descriptor.badgeText,
            'Segera Hadir',
            'Badge without targetPhase must be "Segera Hadir"'
          )
        }
      }

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(badgeRuns >= MIN_PBT_RUNS)
}

// ── Property 10 (Sub-check D): Static SAKU_SECTIONS and TabSaku Component Source Invariant ──
// Validates: Requirements 3.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
{
  console.log('Validating static SAKU_SECTIONS configuration & TabSaku source invariants...')

  const sections = getSakuSections()
  assert.equal(sections.length, 4, 'Must have exactly 4 collapsible sections')

  // Collect all items across sections
  const allItems = sections.flatMap((s) => s.items)

  // 1. Verify known unimplemented features are strictly marked as false
  for (const id of KNOWN_UNIMPLEMENTED_IDS) {
    const item = getSubmenuItem(id)
    assert.ok(item, `Item "${id}" must exist in SAKU_SECTIONS`)
    assert.equal(item.isImplemented, false, `Item "${id}" must have isImplemented=false`)
    assert.equal(isSubmenuImplemented(id), false, `isSubmenuImplemented("${id}") must be false`)
    assert.equal(resolveSubmenuLink(item), null, `resolveSubmenuLink("${id}") must be null`)

    const desc = getSubmenuRenderDescriptor(item)
    assert.equal(desc.isInteractive, false)
    assert.equal(desc.href, null)
    assert.equal(desc.ariaDisabled, true)
    assert.equal(desc.dataImplemented, 'false')
    assert.ok(desc.badgeText.includes('Segera Hadir'))
  }

  // 2. Verify known implemented features are strictly marked as true
  for (const id of KNOWN_IMPLEMENTED_IDS) {
    const item = getSubmenuItem(id)
    assert.ok(item, `Item "${id}" must exist in SAKU_SECTIONS`)
    assert.equal(item.isImplemented, true, `Item "${id}" must have isImplemented=true`)
    assert.equal(isSubmenuImplemented(id), true, `isSubmenuImplemented("${id}") must be true`)
    assert.ok(resolveSubmenuLink(item) !== null, `resolveSubmenuLink("${id}") must not be null`)
  }

  // 3. Inspect TabSaku component source code
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const tabSakuSource = fs.readFileSync(tabSakuPath, 'utf8')

  // Must define or import UnimplementedSubmenuItem
  assert.ok(
    tabSakuSource.includes('UnimplementedSubmenuItem'),
    'tab-saku.tsx must render UnimplementedSubmenuItem for pending features'
  )
  assert.ok(
    tabSakuSource.includes('data-implemented="false"'),
    'tab-saku.tsx must include data-implemented="false"'
  )
  assert.ok(
    tabSakuSource.includes('aria-disabled="true"'),
    'tab-saku.tsx must include aria-disabled="true"'
  )

  // Must NOT contain placeholder routes for pending features
  for (const id of KNOWN_UNIMPLEMENTED_IDS) {
    const placeholderRoutePattern = new RegExp(`href=["']/\\S*${id}\\S*["']`, 'i')
    assert.equal(
      placeholderRoutePattern.test(tabSakuSource),
      false,
      `tab-saku.tsx must NOT contain placeholder href route for unimplemented feature "${id}"`
    )
  }

  // 4. Verify bottom navigation invariant: exactly 4 primary tabs, no secondary nav bar
  const appPagePath = path.resolve(import.meta.dirname, '../app/page.tsx')
  const appPageSource = fs.readFileSync(appPagePath, 'utf8')
  assert.ok(
    appPageSource.includes("'beranda'") &&
    appPageSource.includes("'rekapan'") &&
    appPageSource.includes("'saku'") &&
    appPageSource.includes("'profil'"),
    'Primary navigation must maintain 4 tabs: beranda, rekapan, saku, profil'
  )
  assert.equal(
    tabSakuSource.includes('fixed bottom-0'),
    false,
    'tab-saku.tsx must NOT render any fixed bottom navigation'
  )

  console.log('✓ Static SAKU_SECTIONS and TabSaku component invariants verified successfully.\n')
}

console.log('✅ Property 10 (Unimplemented Submenu Link Suppression) PASSED all invariants with >= 100 iterations each!\n')
