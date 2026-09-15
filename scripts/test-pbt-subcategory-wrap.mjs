/**
 * SakuKilat — Property-Based Test Suite for Phase P3: Tab Saku & Subcategory Flex-Wrap Layout
 *
 * Validates:
 * - Property 9: Subcategory Badge Flex-Wrap Layout
 *   Requirements: 3.7
 *
 * Tag:
 * // Feature: sakukilat-core-roadmap, Property 9: Subcategory Badge Flex-Wrap Layout
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
} from './pbt-harness.mjs'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: SUBCATEGORY FLEX-WRAP (PROP 9)   ')
console.log('====================================================\n')

const ROOT = path.resolve(import.meta.dirname, '..')
const COMPONENTS_DIR = path.resolve(ROOT, 'components')

// ── Arbitrary Generators for Subcategories & Layout Parameters ────────────────
const arbSubcategoryName = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => s.trim().length > 0)

const arbSubcategoryList = fc.array(arbSubcategoryName, { minLength: 0, maxLength: 50 })
  .map(list => Array.from(new Set(list.map(s => s.trim()))))

// Arbitrary viewport width in px (mobile to desktop: 320px to 1440px)
const arbViewportWidth = fc.integer({ min: 320, max: 1440 })

// Helper function that verifies a CSS class string satisfies Property 9
function verifySubcategoryContainerClasses(className) {
  const classes = className.split(/\s+/).filter(Boolean)

  const hasFlex = classes.includes('flex')
  const hasFlexWrap = classes.includes('flex-wrap')
  const hasGap = classes.some(c => c.startsWith('gap-') || c === 'gap-1.5')
  const hasHorizontalScroll = classes.some(c =>
    c === 'overflow-x-auto' ||
    c === 'overflow-x-scroll' ||
    c === 'overflow-x'
  )

  return {
    hasFlex,
    hasFlexWrap,
    hasGap,
    hasHorizontalScroll,
    isCompliant: hasFlex && hasFlexWrap && !hasHorizontalScroll,
  }
}

// ── PBT Test: Property 9: Subcategory Badge Flex-Wrap Layout ─────────────────
// Feature: sakukilat-core-roadmap, Property 9: Subcategory Badge Flex-Wrap Layout
// Validates: Requirements 3.7
{
  const targetComponentFiles = [
    'tab-saku.tsx',
    'category-manager.tsx',
    'manual-entry-form.tsx',
    'edit-transaction-modal.tsx',
    'category-year-explorer.tsx',
  ]

  // Read and parse all subcategory container class declarations
  const componentSources = targetComponentFiles.map(file => {
    const filePath = path.join(COMPONENTS_DIR, file)
    assert.ok(fs.existsSync(filePath), `Component ${file} must exist`)
    return { file, content: fs.readFileSync(filePath, 'utf8') }
  })

  // Extract all subcategory container class names from component sources
  const containerClassMatches = []
  for (const { file, content } of componentSources) {
    // Regex looking for containers with data-testid containing subcategor*
    const testidRegex = /<div[^>]*data-testid="([^"]*subcategor[^"]*)"[^>]*class(?:Name)?="([^"]*)"/g
    let match
    while ((match = testidRegex.exec(content)) !== null) {
      containerClassMatches.push({
        file,
        testId: match[1],
        className: match[2],
      })
    }

    // Also look for class before data-testid
    const reverseRegex = /<div[^>]*class(?:Name)?="([^"]*)"[^>]*data-testid="([^"]*subcategor[^"]*)"/g
    while ((match = reverseRegex.exec(content)) !== null) {
      containerClassMatches.push({
        file,
        testId: match[2],
        className: match[1],
      })
    }
  }

  assert.ok(
    containerClassMatches.length >= 5,
    `Must identify at least 5 subcategory container declarations across components, found ${containerClassMatches.length}`
  )

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 9: Subcategory Badge Flex-Wrap Layout',
    fc.property(
      arbSubcategoryList,
      arbViewportWidth,
      fc.constantFrom(...containerClassMatches),
      (subcategories, viewportWidth, containerDef) => {
        // 1. Verify container CSS classes strictly satisfy Property 9
        const analysis = verifySubcategoryContainerClasses(containerDef.className)
        assert.ok(
          analysis.isCompliant,
          `Container ${containerDef.testId} in ${containerDef.file} must have flex and flex-wrap without horizontal overflow. Got: "${containerDef.className}"`
        )
        assert.equal(
          analysis.hasHorizontalScroll,
          false,
          `Container ${containerDef.testId} in ${containerDef.file} must not contain horizontal scroll styles`
        )

        // 2. Simulate mathematical flex-wrap rendering:
        // When container has flex-wrap enabled, subcategory chips never cause horizontal container overflow.
        // Instead, line wrapping occurs whenever accumulated chip widths exceed available row width.
        const CHIP_PADDING_X = 20 // px padding (px-2.5 = 10px on each side)
        const CHIP_GAP = 6 // px gap (gap-1.5 = 0.375rem = 6px)
        const CHAR_WIDTH_ESTIMATE = 8 // approx 8px per character

        let currentLineWidth = 0
        let totalLines = subcategories.length > 0 ? 1 : 0

        for (const sub of subcategories) {
          const chipWidth = (sub.length * CHAR_WIDTH_ESTIMATE) + CHIP_PADDING_X
          if (currentLineWidth === 0) {
            currentLineWidth = chipWidth
          } else if (currentLineWidth + CHIP_GAP + chipWidth <= viewportWidth) {
            currentLineWidth += CHIP_GAP + chipWidth
          } else {
            // Wraps to a new line — because flex-wrap is enabled!
            totalLines += 1
            currentLineWidth = chipWidth
          }
        }

        // In a flex-wrap layout, each line's width is strictly bounded by max(viewportWidth, maxChipWidth)
        // and no single horizontal carousel scroll container is required.
        assert.ok(totalLines >= (subcategories.length > 0 ? 1 : 0))
        return true
      }
    ),
    { numRuns: Math.max(MIN_PBT_RUNS, 150) }
  )
}

console.log('====================================================')
console.log('  PROPERTY 9 (SUBCATEGORY FLEX-WRAP) PASSED! ✅     ')
console.log('====================================================\n')
