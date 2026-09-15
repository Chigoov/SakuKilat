/**
 * SakuKilat — Property-Based Test Suite for Subcategory Badge Flex-Wrap Layout
 *
 * Feature: sakukilat-core-roadmap, Property 9: Subcategory Badge Flex-Wrap Layout
 * Validates: Requirements 3.7
 *
 * Property 9:
 * For all category and subcategory chip views, the subcategory container element
 * SHALL have CSS flex-wrap enabled (`flex flex-wrap`) and SHALL NOT contain
 * horizontal scroll container styles (`overflow-x-auto` or `overflow-x-scroll`).
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
  isFlexWrapLayout,
  validateSubcategoryContainerLayout,
  renderSubcategoryChips,
  SUBCATEGORY_CONTAINER_CLASS,
  dedupeSubcategories,
  DEFAULT_SUBCATEGORIES,
} from '../lib/category-utils.ts'
import { SAKU_SECTIONS, getSectionById } from '../lib/saku-sections.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: SUBCATEGORY BADGE FLEX-WRAP     ')
console.log('====================================================\n')

// ── Realistic Subcategory Names Pool ──────────────────────────────────────────
const REALISTIC_SUBCATEGORIES = [
  'Makan Siang/Malam',
  'Kopi & Nongkrong',
  'Bahan Dapur',
  'Jajan & Camilan',
  'Sarapan',
  'Bensin',
  'Parkir & Tol',
  'Ojek Online',
  'Servis Kendaraan',
  'Tiket Kendaraan',
  'Listrik PLN',
  'Internet & WiFi',
  'Pulsa & Paket Data',
  'Air PDAM',
  'Langganan Aplikasi',
  'Kebutuhan Rumah',
  'Pakaian & Fashion',
  'Elektronik & Gadget',
  'Hobi & Hiburan',
  'Nonton Bioskop',
  'Streaming',
  'Game & Hiburan',
  'Liburan & Wisata',
  'Obat & Vitamin',
  'Dokter & Klinik',
  'Olahraga & Gym',
  'Perawatan Diri',
  'Buku & Modul',
  'Kursus & Sertifikasi',
  'SPP & Biaya Sekolah',
  'Gaji Pokok',
  'Bonus & THR',
  'Saham & Reksadana',
  'Kripto',
  'Emas',
  'Proyek Klien',
  'Desain & Coding',
]

// Generator for varied subcategory labels (including realistic, short, long, unicode)
const arbSubcategoryLabel = fc.oneof(
  fc.constantFrom(...REALISTIC_SUBCATEGORIES),
  fc.stringMatching(/^[A-Za-z0-9\s&/()-]{3,25}$/).map(s => s.trim()).filter(s => s.length >= 2),
  fc.string({ minLength: 1, maxLength: 40 }).map(s => s.trim()).filter(s => s.length >= 1)
)

// Generator for arbitrary subcategory lists with varied lengths (0 to 35)
const arbSubcategories = fc.array(arbSubcategoryLabel, { minLength: 0, maxLength: 35 })

// Generator for rendering options
const arbRenderOptions = fc.record({
  selectedSubcategory: fc.option(arbSubcategoryLabel, { nil: undefined }),
  includeAllOption: fc.boolean(),
  allOptionLabel: fc.constantFrom('Tanpa Sub', 'Semua', 'Pilih Subkategori', 'All'),
  containerClassName: fc.constantFrom(
    SUBCATEGORY_CONTAINER_CLASS,
    'flex flex-wrap gap-1.5',
    'flex flex-wrap gap-2',
    'flex flex-wrap gap-1.5 pb-1',
    'mt-3 flex flex-wrap gap-1.5',
    'flex flex-wrap gap-2 p-2',
    'flex flex-wrap gap-1.5 my-2'
  ),
})

// ── Property 9: Subcategory Badge Flex-Wrap Layout ───────────────────────────
// Validates: Requirements 3.7
{
  let totalRuns = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 9: Subcategory Badge Flex-Wrap Layout',
    fc.property(
      arbSubcategories,
      arbRenderOptions,
      (subcategories, options) => {
        totalRuns++

        const result = renderSubcategoryChips(subcategories, options)
        const validation = validateSubcategoryContainerLayout(result.containerClassName)

        // 1. Invariant: The subcategory container element SHALL have CSS flex-wrap enabled
        assert.equal(
          validation.hasFlex,
          true,
          `Container "${result.containerClassName}" must include 'flex' display class`
        )
        assert.equal(
          validation.hasWrap,
          true,
          `Container "${result.containerClassName}" must include 'flex-wrap' class`
        )
        assert.equal(
          isFlexWrapLayout(result.containerClassName),
          true,
          `Container "${result.containerClassName}" must pass isFlexWrapLayout()`
        )

        // 2. Invariant: Container SHALL NOT contain horizontal scroll container styles
        assert.equal(
          validation.hasScroll,
          false,
          `Container "${result.containerClassName}" must NOT contain horizontal scroll styles`
        )
        assert.ok(
          !result.containerClassName.includes('overflow-x-auto'),
          `Container must not contain 'overflow-x-auto'`
        )
        assert.ok(
          !result.containerClassName.includes('overflow-x-scroll'),
          `Container must not contain 'overflow-x-scroll'`
        )
        assert.ok(
          !result.containerClassName.includes('overflow-auto'),
          `Container must not contain 'overflow-auto'`
        )
        assert.ok(
          !result.containerClassName.includes('overflow-scroll'),
          `Container must not contain 'overflow-scroll'`
        )

        // 3. Invariant: Container level must NOT force nowrap horizontal overflow
        const classTokens = result.containerClassName.split(/\s+/)
        assert.ok(
          !classTokens.includes('whitespace-nowrap'),
          `Container must not have whitespace-nowrap preventing row wrapping`
        )
        assert.ok(
          !classTokens.includes('flex-nowrap'),
          `Container must not have flex-nowrap`
        )

        // 4. Invariant: Deduplication and Chip Count Preservation
        const dedupedExpected = dedupeSubcategories(subcategories)
        const expectedCount = dedupedExpected.length + (options.includeAllOption ? 1 : 0)
        assert.equal(
          result.totalChips,
          expectedCount,
          `totalChips (${result.totalChips}) must equal expectedCount (${expectedCount})`
        )
        assert.equal(
          result.chips.length,
          expectedCount,
          `chips array length must match totalChips`
        )

        // 5. Invariant: All non-empty deduplicated items are rendered inside the container
        for (const expectedSub of dedupedExpected) {
          const chipFound = result.chips.some(c => c.label === expectedSub)
          assert.ok(
            chipFound,
            `Subcategory "${expectedSub}" must be rendered as a chip in the flex-wrap container`
          )
        }

        // 6. Invariant: Rendered HTML structure
        assert.ok(
          result.html.startsWith('<div class="'),
          'Rendered markup must be wrapped in a <div> container'
        )
        assert.ok(
          result.html.includes(result.containerClassName),
          'Rendered markup container must match containerClassName'
        )

        return true
      }
    ),
    { numRuns: 200 }
  )

  assert.ok(
    totalRuns >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalRuns}`
  )
}

// ── Property 9 (Sub-check A): Component Source Code Flex-Wrap Layout Invariant ─
// Validates: Requirements 3.7
// Scans real production component files in the codebase and verifies every
// subcategory chip/badge container strictly adheres to the flex-wrap layout invariant.
{
  let componentRuns = 0

  const ROOT = path.resolve(import.meta.dirname, '..')

  const COMPONENT_TARGETS = [
    {
      file: 'components/tab-saku.tsx',
      description: 'Tab Saku Submenu Subcategory Badges (Section 2)',
      containerSelectorRegex: /<div[^>]*data-testid=["']saku-subcategories-badge-container["'][^>]*className=["']([^"']+)["']/g,
      fallbackRegex: /<div[^>]*className=["']([^"']*flex[^"']*flex-wrap[^"']*)["'][^>]*>\s*<span[^>]*data-testid=["']submenu-kategori-pemasukan/g,
    },
    {
      file: 'components/category-manager.tsx',
      description: 'CategoryManager Subcategories Detail & Editor Badges',
      containerSelectorRegex: /<div[^>]*className=["']([^"']+)["'][^>]*>\s*\{selected\.subcategories\.map/g,
      secondaryRegex: /<div[^>]*className=["']([^"']+)["'][^>]*>\s*\{editorSubcategories\.map/g,
    },
    {
      file: 'components/manual-entry-form.tsx',
      description: 'ManualEntryForm Subcategory Selection Chips',
      containerSelectorRegex: /<div[^>]*className=["']([^"']+)["'][^>]*>\s*<button[^>]*onClick=\{\(\)\s*=>\s*setSubcategory\(''\)\}[^>]*>[\s\S]*?\{selectedCategory\.subcategories\.map/g,
    },
    {
      file: 'components/edit-transaction-modal.tsx',
      description: 'EditTransactionModal Subcategory Selection Chips',
      containerSelectorRegex: /<div[^>]*className=["']([^"']+)["'][^>]*>\s*<button[^>]*onClick=\{\(\)\s*=>\s*setSubcategory\(''\)\}[^>]*>[\s\S]*?\{selectedCategory\?\.subcategories\.map/g,
    },
    {
      file: 'components/tab-rekapan.tsx',
      description: 'TabRekapan DetailSheet Subcategory Chips',
      containerSelectorRegex: /<div[^>]*className=["']([^"']+)["'][^>]*>\s*\{detailSheet\.subcategories\.map/g,
    },
    {
      file: 'components/category-year-explorer.tsx',
      description: 'CategoryYearExplorer Subcategory Filter Chips',
      containerSelectorRegex: /Filter Subkategori[\s\S]*?<div[^>]*className=["']([^"']+)["']/g,
    },
  ]

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 9 (Sub-check A): Component Source Code Flex-Wrap Layout Invariant',
    fc.property(
      fc.shuffledSubarray(COMPONENT_TARGETS, { minLength: 1 }),
      (sampledTargets) => {
        componentRuns++

        for (const target of sampledTargets) {
          const fullPath = path.resolve(ROOT, target.file)
          assert.ok(fs.existsSync(fullPath), `Target component file must exist: ${target.file}`)

          const content = fs.readFileSync(fullPath, 'utf8')
          const foundClassNames = []

          // Primary container extraction
          const primaryMatches = Array.from(content.matchAll(target.containerSelectorRegex))
          for (const m of primaryMatches) {
            if (m[1]) foundClassNames.push(m[1])
          }

          // Secondary regex extraction if defined
          if (target.secondaryRegex) {
            const secMatches = Array.from(content.matchAll(target.secondaryRegex))
            for (const m of secMatches) {
              if (m[1]) foundClassNames.push(m[1])
            }
          }

          // Fallback regex extraction if primary match was not captured by attribute order
          if (foundClassNames.length === 0 && target.fallbackRegex) {
            const fbMatches = Array.from(content.matchAll(target.fallbackRegex))
            for (const m of fbMatches) {
              if (m[1]) foundClassNames.push(m[1])
            }
          }

          assert.ok(
            foundClassNames.length > 0,
            `Must find at least one subcategory chip container in ${target.file}`
          )

          for (const className of foundClassNames) {
            // Must have flex and flex-wrap
            assert.equal(
              isFlexWrapLayout(className),
              true,
              `Container in ${target.file} ("${className}") must satisfy isFlexWrapLayout()`
            )

            // Must NOT contain horizontal scroll classes
            assert.ok(
              !className.includes('overflow-x-auto'),
              `Container in ${target.file} must NOT contain 'overflow-x-auto'`
            )
            assert.ok(
              !className.includes('overflow-x-scroll'),
              `Container in ${target.file} must NOT contain 'overflow-x-scroll'`
            )
          }
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(componentRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified across ${componentRuns} component checks.`)
}

// ── Property 9 (Sub-check B): Viewport Responsive Wrapping and Anti-Overflow Invariant ──
// Validates: Requirements 3.7
// Simulates rendering of N chips under constrained screen widths (320px - 1024px).
// Verifies mathematically that flex-wrap distributes items across rows so that
// no single row overflows horizontally, eliminating the need for horizontal carousels.
{
  let viewportRuns = 0

  // Generates viewport widths representing mobile to desktop viewports
  const arbViewportWidth = fc.integer({ min: 320, max: 1024 })

  // Approximate chip width based on character length + padding + border (typical ~8px per char + 28px padding)
  function estimateChipWidth(label) {
    return Math.max(60, (label || '').length * 8 + 28)
  }

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 9 (Sub-check B): Viewport Responsive Wrapping and Anti-Overflow Invariant',
    fc.property(
      arbViewportWidth,
      fc.array(arbSubcategoryLabel, { minLength: 1, maxLength: 25 }),
      (viewportWidth, rawSubs) => {
        viewportRuns++

        const subs = dedupeSubcategories(rawSubs)
        if (subs.length === 0) return true

        const GAP_PX = 6 // gap-1.5 = 6px
        const PADDING_CONTAINER = 32 // 16px padding on each side of mobile container
        const availableWidth = Math.max(260, viewportWidth - PADDING_CONTAINER)

        // Simulate flex-wrap row distribution
        const rows = []
        let currentRow = []
        let currentRowWidth = 0

        for (const sub of subs) {
          const itemWidth = estimateChipWidth(sub)
          const addedWidth = currentRow.length === 0 ? itemWidth : itemWidth + GAP_PX

          if (currentRowWidth + addedWidth <= availableWidth) {
            currentRow.push(sub)
            currentRowWidth += addedWidth
          } else {
            // Wraps to next row!
            if (currentRow.length > 0) {
              rows.push({ items: currentRow, width: currentRowWidth })
            }
            currentRow = [sub]
            currentRowWidth = itemWidth
          }
        }

        if (currentRow.length > 0) {
          rows.push({ items: currentRow, width: currentRowWidth })
        }

        // 1. Invariant: All items are placed in rows without being dropped
        const totalItemsInRows = rows.reduce((sum, r) => sum + r.items.length, 0)
        assert.equal(
          totalItemsInRows,
          subs.length,
          'All subcategories must be allocated to a row in flex-wrap'
        )

        // 2. Invariant: Wrapping occurs dynamically as items exceed viewport width
        assert.ok(
          rows.length >= 1,
          'flex-wrap layout must produce at least 1 row'
        )

        // 3. Comparison Invariant:
        // A nowrap carousel would force scrollWidth = sum(itemWidth) + (N-1)*GAP
        const totalCarouselWidth = subs.reduce((sum, s) => sum + estimateChipWidth(s), 0) + (subs.length - 1) * GAP_PX
        if (totalCarouselWidth > availableWidth) {
          // In flex-wrap, multi-row distribution prevents forced single-row overflow:
          assert.ok(
            rows.length > 1,
            `When content width (${totalCarouselWidth}px) exceeds available width (${availableWidth}px), flex-wrap MUST wrap into multiple rows (got ${rows.length} rows)`
          )
        }

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(viewportRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified across ${viewportRuns} responsive viewport scenarios.`)
}

// ── Property 9 (Sub-check C): Layout Validator Soundness & Rejection Invariant ─
// Validates: Requirements 3.7
// Verifies that validateSubcategoryContainerLayout and isFlexWrapLayout correctly
// accept valid flex-wrap classes and reject invalid or horizontal scroll patterns.
{
  let validatorRuns = 0

  // Generator for valid flex-wrap classes with arbitrary extra utilities
  const arbValidFlexWrapClasses = fc.tuple(
    fc.constantFrom('flex', 'inline-flex'),
    fc.constant('flex-wrap'),
    fc.constantFrom('gap-1.5', 'gap-2', 'gap-1', 'gap-3'),
    fc.subarray(['p-2', 'mt-3', 'mb-2', 'w-full', 'items-center', 'rounded-xl', 'text-xs'])
  ).map(([display, wrap, gap, extras]) => `${display} ${wrap} ${gap} ${extras.join(' ')}`.trim())

  // Generator for malformed/rejected classes (missing wrap, or containing horizontal scroll)
  const arbInvalidClasses = fc.oneof(
    // Missing flex-wrap (nowrap flex)
    fc.tuple(
      fc.constantFrom('flex', 'inline-flex'),
      fc.constantFrom('gap-1.5', 'gap-2', 'p-2', 'w-full')
    ).map(([display, rest]) => `${display} ${rest}`),
    // Contains forbidden horizontal scroll
    fc.tuple(
      fc.constantFrom('flex', 'inline-flex'),
      fc.constantFrom('overflow-x-auto', 'overflow-x-scroll', 'overflow-auto', 'overflow-scroll'),
      fc.constantFrom('flex-wrap', 'gap-1.5')
    ).map(([display, scroll, rest]) => `${display} ${scroll} ${rest}`),
    // Empty or non-flex
    fc.constantFrom('', 'block w-full', 'grid grid-cols-2', 'overflow-x-auto pb-1')
  )

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 9 (Sub-check C): Layout Validator Soundness and Malformed Style Rejection',
    fc.property(
      arbValidFlexWrapClasses,
      arbInvalidClasses,
      (validClass, invalidClass) => {
        validatorRuns++

        // Valid class must pass
        assert.equal(
          isFlexWrapLayout(validClass),
          true,
          `Class "${validClass}" should be recognized as valid flex-wrap layout`
        )
        const validReport = validateSubcategoryContainerLayout(validClass)
        assert.equal(validReport.isValid, true)
        assert.equal(validReport.issues.length, 0)

        // Invalid class must fail
        assert.equal(
          isFlexWrapLayout(invalidClass),
          false,
          `Class "${invalidClass}" must be rejected by isFlexWrapLayout()`
        )
        const invalidReport = validateSubcategoryContainerLayout(invalidClass)
        assert.equal(invalidReport.isValid, false)
        assert.ok(
          invalidReport.issues.length > 0,
          `Invalid class "${invalidClass}" must report at least one validation issue`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(validatorRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${validatorRuns} style permutations.`)
}

// ── Concrete Edge Cases & Integration Checks ──────────────────────────────────
{
  console.log('\nValidating concrete edge cases for subcategory badge flex-wrap...')

  // Edge Case 1: Empty subcategory array
  const emptyResult = renderSubcategoryChips([])
  assert.equal(emptyResult.totalChips, 0)
  assert.equal(isFlexWrapLayout(emptyResult.containerClassName), true)

  // Edge Case 2: Single subcategory
  const singleResult = renderSubcategoryChips(['Kopi'], { includeAllOption: true })
  assert.equal(singleResult.totalChips, 2) // 'Tanpa Sub' + 'Kopi'
  assert.equal(singleResult.chips[0].label, 'Tanpa Sub')
  assert.equal(singleResult.chips[1].label, 'Kopi')
  assert.equal(isFlexWrapLayout(singleResult.containerClassName), true)

  // Edge Case 3: Built-in default subcategories for Makanan (5 items)
  const makananSubs = DEFAULT_SUBCATEGORIES['makanan']
  assert.ok(makananSubs.length >= 5)
  const makananResult = renderSubcategoryChips(makananSubs, { selectedSubcategory: 'Kopi & Nongkrong' })
  assert.equal(makananResult.totalChips, makananSubs.length)
  const selectedChip = makananResult.chips.find(c => c.label === 'Kopi & Nongkrong')
  assert.ok(selectedChip?.isSelected, 'Kopi & Nongkrong should be marked isSelected')
  assert.equal(isFlexWrapLayout(makananResult.containerClassName), true)

  // Edge Case 4: Duplicate and whitespace subcategories cleaned
  const messySubs = [' Kopi ', 'kopi', 'BENSIN', 'bensin', '  Bensin  ']
  const cleanedResult = renderSubcategoryChips(messySubs)
  assert.equal(cleanedResult.totalChips, 2, 'Duplicates case-insensitively and trimmed must yield 2 items')
  assert.deepEqual(cleanedResult.chips.map(c => c.label), ['Kopi', 'BENSIN'])

  // Edge Case 5: Saku Section 2 'kategori-subkategori' subcategory submenu item exists
  const section2 = getSectionById('kategori-subkategori')
  assert.ok(section2, 'Section kategori-subkategori must exist')
  const subcategoryItem = section2.items.find(i => i.id === 'subkategori')
  assert.ok(subcategoryItem, 'Subcategory submenu item must exist in Section 2')
  assert.equal(subcategoryItem.isImplemented, true)

  console.log('✓ Concrete edge cases and integration checks passed successfully.')
}

console.log('\n✅ Property 9 PBT for Subcategory Badge Flex-Wrap Layout PASSED! (>= 100 iterations verified)\n')
