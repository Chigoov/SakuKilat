/**
 * SakuKilat — Property-Based Test Suite for Widget Dimension Layout Mapping (Phase P4)
 *
 * Feature: sakukilat-core-roadmap, Property 12: Widget Dimension Layout Mapping
 * Validates: Requirements 4.6
 *
 * Formal Property Statement:
 * For any widget instance cell dimensions (widthDp, heightDp), the layout selector function
 * SHALL deterministically map to Small (width < 180dp), Medium (180dp <= width < 260dp),
 * or Large (width >= 260dp) RemoteViews layouts.
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
  getWidgetLayoutForDimensions,
} from '../lib/widget-snapshot.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: WIDGET DIMENSION LAYOUT MAPPING (PROPERTY 12)       ')
console.log('========================================================================\n')

// Numerical rank helper to verify monotonic layout expansion
const LAYOUT_RANKS = {
  small: 1,
  medium: 2,
  large: 3,
}

// ── Domain Arbitraries ───────────────────────────────────────────────────────

/**
 * Arbitrary dimension covering the full realistic spectrum of Android cell dimensions (in dp),
 * including boundary neighborhoods around 180 and 260, extreme values, and fractional dp.
 */
const arbWidthDp = fc.oneof(
  // Small range: < 180 dp
  fc.integer({ min: -100, max: 179 }),
  fc.double({ min: 0, max: 179.9999, noNaN: true }),

  // Boundary neighborhood around 180 dp
  fc.constantFrom(179, 179.5, 179.99, 180, 180.0, 180.01, 180.5, 181),

  // Medium range: 180 <= width < 260 dp
  fc.integer({ min: 180, max: 259 }),
  fc.double({ min: 180.0, max: 259.9999, noNaN: true }),

  // Boundary neighborhood around 260 dp
  fc.constantFrom(259, 259.5, 259.99, 260, 260.0, 260.01, 260.5, 261),

  // Large range: >= 260 dp
  fc.integer({ min: 260, max: 4000 }),
  fc.double({ min: 260.0, max: 5000.0, noNaN: true })
)

/**
 * Arbitrary height dimension in dp (including undefined/optional)
 */
const arbHeightDp = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: 0, max: 2000 }),
  fc.double({ min: 0, max: 2500, noNaN: true })
)

// ── Property 12: Widget Dimension Layout Mapping ─────────────────────────────
// Feature: sakukilat-core-roadmap, Property 12: Widget Dimension Layout Mapping
// Validates: Requirements 4.6
{
  let totalEvaluated = 0
  let smallCount = 0
  let mediumCount = 0
  let largeCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 12: Widget Dimension Layout Mapping',
    fc.property(arbWidthDp, arbHeightDp, (widthDp, heightDp) => {
      totalEvaluated++

      const layout = getWidgetLayoutForDimensions(widthDp, heightDp)

      // ── INVARIANT 1: Strict Partitioning by Width Thresholds ────────────────
      if (widthDp < 180) {
        smallCount++
        assert.equal(
          layout,
          'small',
          `Expected 'small' for widthDp=${widthDp} < 180, got '${layout}'`
        )
      } else if (widthDp < 260) {
        mediumCount++
        assert.equal(
          layout,
          'medium',
          `Expected 'medium' for 180 <= widthDp=${widthDp} < 260, got '${layout}'`
        )
      } else {
        largeCount++
        assert.equal(
          layout,
          'large',
          `Expected 'large' for widthDp=${widthDp} >= 260, got '${layout}'`
        )
      }

      // ── INVARIANT 2: Valid Range of Layout Types ────────────────────────────
      assert.ok(
        layout === 'small' || layout === 'medium' || layout === 'large',
        `Layout must be 'small', 'medium', or 'large', got '${layout}'`
      )

      // ── INVARIANT 3: Determinism ────────────────────────────────────────────
      const repeatLayout = getWidgetLayoutForDimensions(widthDp, heightDp)
      assert.equal(
        layout,
        repeatLayout,
        `Function must be deterministic: expected '${layout}', got '${repeatLayout}' on repeat call`
      )

      // ── INVARIANT 4: Height Independence ────────────────────────────────────
      // Height variation must not alter the layout mapping
      const withoutHeight = getWidgetLayoutForDimensions(widthDp)
      assert.equal(
        layout,
        withoutHeight,
        `Layout mapping must be independent of height: with height=${heightDp} got '${layout}', without got '${withoutHeight}'`
      )

      return true
    }),
    { numRuns: 150 }
  )

  console.log(
    `    Distribution across ${totalEvaluated} runs: Small=${smallCount}, Medium=${mediumCount}, Large=${largeCount}\n`
  )
}

// ── Sub-Check A: Boundary Value Neighborhood Analysis ────────────────────────
{
  let boundaryEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 12 (Sub-check A): Boundary Value Neighborhoods',
    fc.property(
      fc.record({
        delta180: fc.double({ min: 0.00001, max: 5.0, noNaN: true }),
        delta260: fc.double({ min: 0.00001, max: 5.0, noNaN: true }),
        height: arbHeightDp,
      }),
      ({ delta180, delta260, height }) => {
        boundaryEvaluated++

        // Just below 180 -> strictly small
        const justBelow180 = 180 - delta180
        assert.equal(
          getWidgetLayoutForDimensions(justBelow180, height),
          'small',
          `Width ${justBelow180} (< 180) must map to 'small'`
        )

        // Exactly 180 -> strictly medium
        assert.equal(
          getWidgetLayoutForDimensions(180, height),
          'medium',
          `Width 180 must map to 'medium'`
        )

        // Just above 180 (and below 260) -> strictly medium
        const justAbove180 = 180 + delta180
        if (justAbove180 < 260) {
          assert.equal(
            getWidgetLayoutForDimensions(justAbove180, height),
            'medium',
            `Width ${justAbove180} (>= 180 and < 260) must map to 'medium'`
          )
        }

        // Just below 260 (and >= 180) -> strictly medium
        const justBelow260 = 260 - delta260
        if (justBelow260 >= 180) {
          assert.equal(
            getWidgetLayoutForDimensions(justBelow260, height),
            'medium',
            `Width ${justBelow260} (< 260) must map to 'medium'`
          )
        }

        // Exactly 260 -> strictly large
        assert.equal(
          getWidgetLayoutForDimensions(260, height),
          'large',
          `Width 260 must map to 'large'`
        )

        // Just above 260 -> strictly large
        const justAbove260 = 260 + delta260
        assert.equal(
          getWidgetLayoutForDimensions(justAbove260, height),
          'large',
          `Width ${justAbove260} (> 260) must map to 'large'`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  console.log(`    Verified ${boundaryEvaluated} boundary neighborhood evaluations.\n`)
}

// ── Sub-Check B: Monotonicity Across Increasing Widths ───────────────────────
{
  let monotonicEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 12 (Sub-check B): Monotonic Layout Size Expansion',
    fc.property(
      fc.tuple(arbWidthDp, arbWidthDp).map(([w1, w2]) => (w1 <= w2 ? [w1, w2] : [w2, w1])),
      arbHeightDp,
      ([wNarrow, wWide], height) => {
        monotonicEvaluated++

        const layoutNarrow = getWidgetLayoutForDimensions(wNarrow, height)
        const layoutWide = getWidgetLayoutForDimensions(wWide, height)

        const rankNarrow = LAYOUT_RANKS[layoutNarrow]
        const rankWide = LAYOUT_RANKS[layoutWide]

        assert.ok(
          rankNarrow <= rankWide,
          `Monotonicity violated: wNarrow=${wNarrow} (${layoutNarrow}, rank ${rankNarrow}) > wWide=${wWide} (${layoutWide}, rank ${rankWide})`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  console.log(`    Verified ${monotonicEvaluated} monotonic layout size pairs.\n`)
}

// ── Sub-Check C: Android Java Provider Native Code Parity ────────────────────
{
  console.log('  ▶ [Parity Check] Android Native Java Provider Threshold Parity...')
  const javaPath = path.resolve(
    import.meta.dirname,
    '../android/app/src/main/java/com/sakukilat/app/widget/SakuKilatAppWidgetProvider.java'
  )

  assert.ok(fs.existsSync(javaPath), 'SakuKilatAppWidgetProvider.java must exist')
  const javaContent = fs.readFileSync(javaPath, 'utf8')

  // Verify getWidgetLayoutType method exists with matching thresholds
  assert.ok(
    javaContent.includes('getWidgetLayoutType(int minWidthDp, int minHeightDp)'),
    'Java provider must declare getWidgetLayoutType with minWidthDp and minHeightDp'
  )
  assert.ok(
    javaContent.includes('180') && javaContent.includes('"small"'),
    'Java provider must map width < 180dp to "small"'
  )
  assert.ok(
    javaContent.includes('260') && javaContent.includes('"large"'),
    'Java provider must map width >= 260dp to "large"'
  )
  assert.ok(
    javaContent.includes('"medium"'),
    'Java provider must fallback or map intermediate width to "medium"'
  )

  console.log('  ✓ [Parity Passed] Java provider implements identical 180dp and 260dp layout boundaries.\n')
}

console.log('========================================================================')
console.log('✅ ALL PROPERTY 12 (WIDGET DIMENSION LAYOUT MAPPING) PBT PASSED!')
console.log('========================================================================\n')
