/**
 * SakuKilat — Unit & Regression Tests for Task 6.2:
 * Subcategory Chips and Badges Using Strict `flex-wrap` Layout Without Horizontal Overflow
 *
 * Requirements:
 * - 3.7: WHEN displaying subcategory chips or badges, THE Saku_Submenu_Navigator SHALL render
 *        the items using a Flex_Wrap_Layout without horizontal scroll carousels.
 * - Design Doc Property 9: Subcategory Badge Flex-Wrap Layout
 *   For all category and subcategory chip views, the subcategory container element SHALL have
 *   CSS flex-wrap enabled (flex flex-wrap) and SHALL NOT contain horizontal scroll container
 *   styles (overflow-x-auto or overflow-x-scroll).
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('====================================================')
console.log(' SAKUKILAT — UNIT TESTS: SUBCATEGORY FLEX-WRAP (6.2)')
console.log('====================================================\n')

const ROOT = path.resolve(import.meta.dirname, '..')
const COMPONENTS_DIR = path.resolve(ROOT, 'components')

function readComponent(filename) {
  const filePath = path.join(COMPONENTS_DIR, filename)
  assert.ok(fs.existsSync(filePath), `File ${filename} must exist`)
  return fs.readFileSync(filePath, 'utf8')
}

// ── Group 1: Tab Saku Subcategory Badge Layout (Req 3.7) ─────────────────────
console.log('▶ Test Group 1: Tab Saku Subcategory Badge Container in Section 2...')
{
  const content = readComponent('tab-saku.tsx')

  // Find the subcategory badges container in Section 2 (kategori-subkategori)
  assert.ok(
    content.includes('data-testid="saku-subcategories-badge-container"'),
    'Tab Saku must have a testable badge container for subcategory chips'
  )

  const match = content.match(/<div[^>]*data-testid="saku-subcategories-badge-container"[^>]*>/)
  assert.ok(match, 'Must find saku-subcategories-badge-container element')

  const containerTag = match[0]
  assert.ok(containerTag.includes('flex'), 'Container must have "flex"')
  assert.ok(containerTag.includes('flex-wrap'), 'Container must have "flex-wrap"')
  assert.ok(containerTag.includes('gap-1.5'), 'Container must have "gap-1.5"')
  assert.ok(!containerTag.includes('overflow-x-auto'), 'Container must NOT have overflow-x-auto')
  assert.ok(!containerTag.includes('overflow-x-scroll'), 'Container must NOT have overflow-x-scroll')

  console.log('  ✓ Group 1: Tab Saku badge container strictly uses "flex flex-wrap gap-1.5"')
}

// ── Group 2: CategoryManager Subcategory Badges & Chips (Req 3.7) ────────────
console.log('▶ Test Group 2: CategoryManager Details & Editor Subcategory Containers...')
{
  const content = readComponent('category-manager.tsx')

  // 1. Editor Subcategories
  const editorMatch = content.match(/<div[^>]*data-testid="category-editor-subcategories"[^>]*>/)
  assert.ok(editorMatch, 'CategoryManager must have category-editor-subcategories container')
  const editorTag = editorMatch[0]
  assert.ok(editorTag.includes('flex'), 'Editor subcategories must have "flex"')
  assert.ok(editorTag.includes('flex-wrap'), 'Editor subcategories must have "flex-wrap"')
  assert.ok(editorTag.includes('gap-1.5'), 'Editor subcategories must have "gap-1.5"')
  assert.ok(!editorTag.includes('overflow-x-auto'), 'Editor subcategories must NOT have overflow-x-auto')
  assert.ok(!editorTag.includes('overflow-x-scroll'), 'Editor subcategories must NOT have overflow-x-scroll')

  // 2. Details Subcategories
  const detailsMatch = content.match(/<div[^>]*data-testid="category-details-subcategories"[^>]*>/)
  assert.ok(detailsMatch, 'CategoryManager must have category-details-subcategories container')
  const detailsTag = detailsMatch[0]
  assert.ok(detailsTag.includes('flex'), 'Details subcategories must have "flex"')
  assert.ok(detailsTag.includes('flex-wrap'), 'Details subcategories must have "flex-wrap"')
  assert.ok(detailsTag.includes('gap-1.5'), 'Details subcategories must have "gap-1.5"')
  assert.ok(!detailsTag.includes('overflow-x-auto'), 'Details subcategories must NOT have overflow-x-auto')
  assert.ok(!detailsTag.includes('overflow-x-scroll'), 'Details subcategories must NOT have overflow-x-scroll')

  console.log('  ✓ Group 2: CategoryManager editor & details containers use "flex flex-wrap gap-1.5"')
}

// ── Group 3: Transaction Forms Subcategory Chips (ManualEntry & EditModal) ───
console.log('▶ Test Group 3: Form Subcategory Chip Containers (ManualEntry & EditModal)...')
{
  // 1. EditTransactionModal
  const editModalContent = readComponent('edit-transaction-modal.tsx')
  const editModalMatch = editModalContent.match(/<div[^>]*data-testid="edit-modal-subcategories"[^>]*>/)
  assert.ok(editModalMatch, 'EditTransactionModal must have edit-modal-subcategories container')
  const editModalTag = editModalMatch[0]
  assert.ok(editModalTag.includes('flex'), 'Edit modal subcategories must have "flex"')
  assert.ok(editModalTag.includes('flex-wrap'), 'Edit modal subcategories must have "flex-wrap"')
  assert.ok(editModalTag.includes('gap-1.5'), 'Edit modal subcategories must have "gap-1.5"')
  assert.ok(!editModalTag.includes('overflow-x-auto'), 'Edit modal subcategories must NOT have overflow-x-auto')
  assert.ok(!editModalTag.includes('overflow-x-scroll'), 'Edit modal subcategories must NOT have overflow-x-scroll')

  // 2. ManualEntryForm
  const manualFormContent = readComponent('manual-entry-form.tsx')
  const manualMatch = manualFormContent.match(/<div[^>]*data-testid="manual-entry-subcategories"[^>]*>/)
  assert.ok(manualMatch, 'ManualEntryForm must have manual-entry-subcategories container')
  const manualTag = manualMatch[0]
  assert.ok(manualTag.includes('flex'), 'Manual form subcategories must have "flex"')
  assert.ok(manualTag.includes('flex-wrap'), 'Manual form subcategories must have "flex-wrap"')
  assert.ok(manualTag.includes('gap-1.5'), 'Manual form subcategories must have "gap-1.5"')
  assert.ok(!manualTag.includes('overflow-x-auto'), 'Manual form subcategories must NOT have overflow-x-auto')
  assert.ok(!manualTag.includes('overflow-x-scroll'), 'Manual form subcategories must NOT have overflow-x-scroll')

  console.log('  ✓ Group 3: Both ManualEntryForm and EditTransactionModal use "flex flex-wrap gap-1.5"')
}

// ── Group 4: CategoryYearExplorer Filter Chips (Req 3.7) ──────────────────────
console.log('▶ Test Group 4: CategoryYearExplorer Subcategory Filter Container...')
{
  const content = readComponent('category-year-explorer.tsx')
  const match = content.match(/<div[^>]*data-testid="year-explorer-subcategories"[^>]*>/)
  assert.ok(match, 'CategoryYearExplorer must have year-explorer-subcategories container')
  const tag = match[0]
  assert.ok(tag.includes('flex'), 'Year explorer subcategories must have "flex"')
  assert.ok(tag.includes('flex-wrap'), 'Year explorer subcategories must have "flex-wrap"')
  assert.ok(tag.includes('gap-1.5'), 'Year explorer subcategories must have "gap-1.5"')
  assert.ok(!tag.includes('overflow-x-auto'), 'Year explorer subcategories must NOT have overflow-x-auto')
  assert.ok(!tag.includes('overflow-x-scroll'), 'Year explorer subcategories must NOT have overflow-x-scroll')

  console.log('  ✓ Group 4: CategoryYearExplorer subcategories converted to strict "flex flex-wrap gap-1.5"')
}

// ── Group 5: Zero Horizontal Overflow Styles for Subcategories Across Codebase ─
console.log('▶ Test Group 5: Zero Horizontal Scrollbar Styles for Subcategories Across Codebase...')
{
  const componentFiles = fs.readdirSync(COMPONENTS_DIR).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))

  for (const file of componentFiles) {
    const code = fs.readFileSync(path.join(COMPONENTS_DIR, file), 'utf8')
    const lines = code.split('\n')

    lines.forEach((line, lineNum) => {
      const lower = line.toLowerCase()
      // If a line defines overflow-x-auto or overflow-x-scroll, ensure it is NOT a subcategory container
      if (lower.includes('overflow-x-auto') || lower.includes('overflow-x-scroll')) {
        const isSubcategoryContainer =
          lower.includes('subcategory') ||
          lower.includes('subcategories') ||
          lower.includes('sub kategori') ||
          lower.includes('subkategori')

        assert.equal(
          isSubcategoryContainer,
          false,
          `File ${file}:${lineNum + 1} contains horizontal scroll styles on a subcategory container: ${line.trim()}`
        )
      }
    })
  }

  console.log('  ✓ Group 5: Zero horizontal scrollbar/carousel styles on any subcategory container')
}

console.log('\n====================================================')
console.log('  ALL TASK 6.2 SUBCATEGORY FLEX-WRAP TESTS PASSED! ✅')
console.log('====================================================\n')
