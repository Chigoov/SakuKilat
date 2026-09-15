/**
 * SakuKilat — Property-Based Testing (PBT) Harness
 *
 * Configured with fast-check to enforce:
 * - Minimum 100 randomized iterations per property (configurable higher, never lower)
 * - Standardized property tagging format:
 *   // Feature: sakukilat-core-roadmap, Property X: Name
 * - Standardized failure logging with counterexample extraction
 * - Common financial and calendar domain arbitraries
 */

import fc from 'fast-check'

export { fc }

export const MIN_PBT_RUNS = 100

export const DEFAULT_PBT_CONFIG = {
  numRuns: MIN_PBT_RUNS,
  verbose: false,
}

/**
 * Runs a synchronous property-based test ensuring at least 100 iterations.
 *
 * @param {string} tag - Tag description, e.g. "Feature: sakukilat-core-roadmap, Property 1: ..."
 * @param {import('fast-check').IRawProperty} property - fast-check property
 * @param {import('fast-check').Parameters} [customOptions] - Optional configuration overrides
 */
export function testProperty(tag, property, customOptions = {}) {
  const requestedRuns = customOptions.numRuns ?? MIN_PBT_RUNS
  const numRuns = Math.max(MIN_PBT_RUNS, requestedRuns)
  const options = {
    ...DEFAULT_PBT_CONFIG,
    ...customOptions,
    numRuns,
  }

  console.log(`  ▶ [PBT Test] ${tag}`)
  console.log(`    Running ${numRuns} iterations...`)

  try {
    fc.assert(property, options)
    console.log(`  ✓ [PBT Passed] ${tag} (${numRuns} iterations verified)\n`)
    return { success: true, tag, numRuns }
  } catch (err) {
    console.error(`\n  ❌ [PBT FAILED] ${tag}`)
    console.error(`     Error: ${err.message}`)
    if (err.counterexample) {
      console.error(`     Failing Counterexample:`, JSON.stringify(err.counterexample, null, 2))
    }
    console.error('')
    throw err
  }
}

/**
 * Runs an asynchronous property-based test ensuring at least 100 iterations.
 *
 * @param {string} tag - Tag description
 * @param {import('fast-check').IRawProperty} property - async fast-check property
 * @param {import('fast-check').Parameters} [customOptions] - Optional configuration overrides
 */
export async function testAsyncProperty(tag, property, customOptions = {}) {
  const requestedRuns = customOptions.numRuns ?? MIN_PBT_RUNS
  const numRuns = Math.max(MIN_PBT_RUNS, requestedRuns)
  const options = {
    ...DEFAULT_PBT_CONFIG,
    ...customOptions,
    numRuns,
  }

  console.log(`  ▶ [PBT Async Test] ${tag}`)
  console.log(`    Running ${numRuns} iterations...`)

  try {
    await fc.assert(property, options)
    console.log(`  ✓ [PBT Passed] ${tag} (${numRuns} iterations verified)\n`)
    return { success: true, tag, numRuns }
  } catch (err) {
    console.error(`\n  ❌ [PBT FAILED] ${tag}`)
    console.error(`     Error: ${err.message}`)
    if (err.counterexample) {
      console.error(`     Failing Counterexample:`, JSON.stringify(err.counterexample, null, 2))
    }
    console.error('')
    throw err
  }
}

// ── SakuKilat Domain Arbitraries ─────────────────────────────────────

/**
 * Arbitrary Indonesian Rupiah integer nominal amount (Rp0 to Rp1.000.000.000)
 */
export const arbRupiahAmount = fc.integer({ min: 0, max: 1_000_000_000 })

/**
 * Arbitrary positive non-zero Indonesian Rupiah amount (Rp1 to Rp1.000.000.000)
 */
export const arbPositiveRupiahAmount = fc.integer({ min: 1, max: 1_000_000_000 })

/**
 * Arbitrary calendar date between years 2000 and 2050 (guaranteed valid date values)
 */
export const arbCalendarDate = fc.record({
  year: fc.integer({ min: 2000, max: 2050 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }), // Safe day range valid for all months
  hours: fc.integer({ min: 0, max: 23 }),
  minutes: fc.integer({ min: 0, max: 59 }),
}).map(({ year, month, day, hours, minutes }) => {
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
})

/**
 * Arbitrary payment method ID
 */
export const arbPaymentMethod = fc.constantFrom(
  'cash',
  'bca',
  'mandiri',
  'gopay',
  'ovo',
  'dana',
  'shopeepay'
)

/**
 * Arbitrary transaction category
 */
export const arbCategory = fc.constantFrom(
  'Makanan & Minuman',
  'Transportasi',
  'Belanja',
  'Tagihan',
  'Hiburan',
  'Kesehatan',
  'Gaji',
  'Investasi'
)
