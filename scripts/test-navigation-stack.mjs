/**
 * SakuKilat — Back Navigation Stack Unit & Integration Tests
 *
 * Verifies nested back stack behaviors, LIFO ordering, duplicate prevention,
 * initBackStack lifecycle, popstate integration, and programmatic close safety.
 */

import assert from 'node:assert/strict'
import {
  pushBackLayer,
  popBackLayer,
  removeBackLayer,
  peekBackLayer,
  backStackDepth,
  clearBackStack,
  initBackStack,
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

// Mock DOM environment for popstate and initBackStack integration tests
const listeners = new Map()
globalThis.window = {
  addEventListener: (evt, fn) => {
    if (!listeners.has(evt)) listeners.set(evt, [])
    listeners.get(evt).push(fn)
  },
  removeEventListener: (evt, fn) => {
    if (listeners.has(evt)) {
      const filtered = listeners.get(evt).filter(cb => cb !== fn)
      listeners.set(evt, filtered)
    }
  },
}
globalThis.history = {
  state: null,
  pushState: (state) => { globalThis.history.state = state },
  back: () => {
    // Simulate browser dispatching popstate on back
    const cbs = listeners.get('popstate') || []
    for (const cb of cbs) cb(new Event('popstate'))
  },
}

// Test 8: initBackStack registers popstate listener and handles popstate event
{
  clearBackStack()
  const cleanup = initBackStack()
  assert.equal(typeof cleanup, 'function', 'cleanup is a function')
  assert(listeners.get('popstate')?.length > 0, 'popstate listener registered')

  let modalClosed = false
  pushBackLayer({
    id: 'history-modal',
    type: 'modal',
    onClose: () => { modalClosed = true },
  })
  assert.equal(backStackDepth(), 1, 'Modal pushed')

  // Trigger popstate directly
  const popstateCbs = listeners.get('popstate') || []
  popstateCbs[0](new Event('popstate'))

  assert.equal(modalClosed, true, 'onClose called by popstate')
  assert.equal(backStackDepth(), 0, 'Stack empty after popstate')
  cleanup()
  console.log('✓ Test 8: initBackStack and popstate event integration')
}

// Test 9: Nested sublayer resolution via sequential popstate events
{
  clearBackStack()
  const cleanup = initBackStack()
  const sequence = []

  pushBackLayer({
    id: 'modal-parent',
    type: 'modal',
    onClose: () => sequence.push('modal-parent'),
  })
  pushBackLayer({
    id: 'dialog-child',
    type: 'dialog',
    onClose: () => sequence.push('dialog-child'),
  })

  assert.equal(backStackDepth(), 2)

  const popstateCbs = listeners.get('popstate') || []

  // 1st back event: child dialog closes
  popstateCbs[0](new Event('popstate'))
  assert.deepEqual(sequence, ['dialog-child'], 'Child closed on first popstate')
  assert.equal(backStackDepth(), 1, 'Parent remains')

  // 2nd back event: parent modal closes
  popstateCbs[0](new Event('popstate'))
  assert.deepEqual(sequence, ['dialog-child', 'modal-parent'], 'Parent closed on second popstate')
  assert.equal(backStackDepth(), 0, 'Stack empty')

  cleanup()
  console.log('✓ Test 9: Nested sublayer resolution via sequential popstate events')
}

// Test 10: Programmatic close via removeBackLayer synchronizes history without double onClose
{
  clearBackStack()
  const cleanup = initBackStack()
  let closeCallCount = 0

  pushBackLayer({
    id: 'user-closed-modal',
    type: 'modal',
    onClose: () => { closeCallCount++ },
  })

  // User clicks "X" button -> removeBackLayer called
  removeBackLayer('user-closed-modal')

  assert.equal(closeCallCount, 0, 'removeBackLayer does not invoke onClose')
  assert.equal(backStackDepth(), 0, 'Stack is empty')

  cleanup()
  console.log('✓ Test 10: Programmatic close does not double-fire onClose')
}

// Test 11: Cleanup listener removes all event listeners and resets state
{
  clearBackStack()
  const cleanup = initBackStack()
  assert(listeners.get('popstate')?.length > 0, 'popstate registered before cleanup')

  cleanup()
  assert.equal(listeners.get('popstate')?.length, 0, 'popstate listener removed on cleanup')
  assert.equal(backStackDepth(), 0, 'Stack cleared on cleanup')
  console.log('✓ Test 11: Cleanup listener removes listeners and resets state')
}

console.log('\nAll 11 navigation back stack tests PASSED!')
