/**
 * SakuKilat — Back Navigation Stack Unit Tests
 *
 * Verifies nested back stack behaviors, LIFO ordering, duplicate prevention,
 * and graceful handling of empty stacks.
 */

import assert from 'node:assert/strict'
import {
  pushBackLayer,
  popBackLayer,
  removeBackLayer,
  peekBackLayer,
  backStackDepth,
  clearBackStack,
} from '../lib/back-stack.ts'

console.log('--- Testing Navigation Back Stack ---')

// Reset stack before test
clearBackStack()
assert.equal(backStackDepth(), 0, 'Stack starts empty')

// Test 1: Pop on empty stack returns false
{
  const result = popBackLayer()
  assert.equal(result, false, 'popBackLayer on empty returns false')
  console.log('✓ Test 1: Pop on empty stack returns false')
}

// Test 2: Push and pop single layer
{
  let closed = false
  pushBackLayer({
    id: 'modal-1',
    type: 'modal',
    onClose: () => { closed = true },
  })

  assert.equal(backStackDepth(), 1, 'Depth is 1 after push')
  assert.equal(peekBackLayer()?.id, 'modal-1', 'Peek returns modal-1')

  const popped = popBackLayer()
  assert.equal(popped, true, 'popBackLayer returns true')
  assert.equal(closed, true, 'onClose was called')
  assert.equal(backStackDepth(), 0, 'Depth is 0 after pop')
  console.log('✓ Test 2: Push and pop single layer')
}

// Test 3: Duplicate ID push is ignored
{
  clearBackStack()
  let closeCount = 0
  const layer = {
    id: 'sheet-1',
    type: 'sheet',
    onClose: () => { closeCount++ },
  }

  pushBackLayer(layer)
  pushBackLayer(layer) // duplicate
  assert.equal(backStackDepth(), 1, 'Duplicate ID push ignored')
  popBackLayer()
  assert.equal(closeCount, 1, 'Called onClose exactly once')
  assert.equal(backStackDepth(), 0, 'Stack is empty')
  console.log('✓ Test 3: Duplicate ID push is ignored')
}

// Test 4: LIFO ordering with nested layers
{
  clearBackStack()
  const closedOrder = []

  pushBackLayer({
    id: 'parent-modal',
    type: 'modal',
    onClose: () => closedOrder.push('parent-modal'),
  })

  pushBackLayer({
    id: 'child-dialog',
    type: 'dialog',
    onClose: () => closedOrder.push('child-dialog'),
  })

  assert.equal(backStackDepth(), 2, 'Depth is 2')
  assert.equal(peekBackLayer()?.id, 'child-dialog', 'Top is child-dialog')

  // First back: closes child dialog
  const pop1 = popBackLayer()
  assert.equal(pop1, true)
  assert.deepEqual(closedOrder, ['child-dialog'], 'Child dialog closed first')
  assert.equal(backStackDepth(), 1, 'Parent modal remains on stack')
  assert.equal(peekBackLayer()?.id, 'parent-modal', 'Top is now parent-modal')

  // Second back: closes parent modal
  const pop2 = popBackLayer()
  assert.equal(pop2, true)
  assert.deepEqual(closedOrder, ['child-dialog', 'parent-modal'], 'Parent modal closed second')
  assert.equal(backStackDepth(), 0, 'Stack is empty')
  console.log('✓ Test 4: LIFO ordering with nested layers')
}

// Test 5: removeBackLayer removes without calling onClose
{
  clearBackStack()
  let closed = false

  pushBackLayer({
    id: 'temp-layer',
    type: 'sublayer',
    onClose: () => { closed = true },
  })

  assert.equal(backStackDepth(), 1)
  removeBackLayer('temp-layer')
  assert.equal(backStackDepth(), 0, 'Stack is empty after remove')
  assert.equal(closed, false, 'onClose was NOT called by removeBackLayer')
  console.log('✓ Test 5: removeBackLayer removes without calling onClose')
}

// Test 6: Removing non-existent ID does nothing
{
  clearBackStack()
  removeBackLayer('non-existent')
  assert.equal(backStackDepth(), 0)
  console.log('✓ Test 6: Removing non-existent ID does nothing')
}

// Test 7: clearBackStack empties stack without calling onClose
{
  clearBackStack()
  let c1 = false
  let c2 = false
  pushBackLayer({ id: 'l1', type: 'modal', onClose: () => { c1 = true } })
  pushBackLayer({ id: 'l2', type: 'modal', onClose: () => { c2 = true } })
  assert.equal(backStackDepth(), 2)

  clearBackStack()
  assert.equal(backStackDepth(), 0, 'Stack cleared')
  assert.equal(c1, false, 'c1 not called')
  assert.equal(c2, false, 'c2 not called')
  console.log('✓ Test 7: clearBackStack empties stack without calling onClose')
}

console.log('\nAll 7 navigation back stack tests PASSED!')
