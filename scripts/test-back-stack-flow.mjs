import assert from 'node:assert/strict'
import {
  pushBackLayer,
  popBackLayer,
  clearBackStack,
  backStackDepth,
  handleBackAction,
  resetBackPressTimer,
  DOUBLE_BACK_WINDOW_MS,
} from '../lib/back-stack.ts'

console.log('--- RUNNING TEST SUITE: Android Back Stack & Tab Fallback Navigation ---')

// Test 1: When a layer is open, back closes the layer and returns 'layer-closed'
{
  clearBackStack()
  let closed = false
  let tabNavigated = ''
  let exitPrompt = false
  let appExited = false

  pushBackLayer({
    id: 'test-modal-1',
    type: 'modal',
    onClose: () => { closed = true },
  })

  assert.equal(backStackDepth(), 1, 'Stack depth should be 1')

  const result = handleBackAction({
    activeTab: 'beranda',
    onNavigateTab: (tab) => { tabNavigated = tab },
    onShowExitPrompt: () => { exitPrompt = true },
    onExitApp: () => { appExited = true },
  })

  assert.equal(result, 'layer-closed', 'Should return layer-closed')
  assert.equal(closed, true, 'Modal onClose should be invoked')
  assert.equal(backStackDepth(), 0, 'Stack should now be empty')
  assert.equal(tabNavigated, '', 'Tab should not change')
  assert.equal(exitPrompt, false, 'Should not show exit prompt')
  assert.equal(appExited, false, 'Should not exit app')
  console.log('✓ Test 1: Back closes topmost layer when modal is open')
}

// Test 2: Multiple layers open are closed in LIFO order
{
  clearBackStack()
  const closedOrder = []

  pushBackLayer({ id: 'modal-base', type: 'modal', onClose: () => closedOrder.push('modal-base') })
  pushBackLayer({ id: 'dialog-sub', type: 'dialog', onClose: () => closedOrder.push('dialog-sub') })

  assert.equal(backStackDepth(), 2, 'Stack depth should be 2')

  const res1 = handleBackAction({ activeTab: 'rekapan' })
  assert.equal(res1, 'layer-closed')
  assert.deepEqual(closedOrder, ['dialog-sub'], 'Sub dialog should close first')

  const res2 = handleBackAction({ activeTab: 'rekapan' })
  assert.equal(res2, 'layer-closed')
  assert.deepEqual(closedOrder, ['dialog-sub', 'modal-base'], 'Base modal should close second')

  assert.equal(backStackDepth(), 0)
  console.log('✓ Test 2: Multiple layers close in LIFO order')
}

// Test 3: No layer open and tab !== 'beranda' -> navigates to 'beranda'
{
  clearBackStack()
  for (const tab of ['rekapan', 'saku', 'profil']) {
    let navigatedTo = ''
    let exitPrompt = false
    let appExited = false

    const result = handleBackAction({
      activeTab: tab,
      onNavigateTab: (t) => { navigatedTo = t },
      onShowExitPrompt: () => { exitPrompt = true },
      onExitApp: () => { appExited = true },
    })

    assert.equal(result, 'tab-navigated', `Tab ${tab} should navigate`)
    assert.equal(navigatedTo, 'beranda', `Should navigate to beranda from ${tab}`)
    assert.equal(exitPrompt, false, 'Should not prompt exit when changing tab')
    assert.equal(appExited, false, 'Should not exit app when changing tab')
  }
  console.log('✓ Test 3: Back button returns to Beranda from Saku, Rekapan, and Profil')
}

// Test 4: On Beranda, first back shows exit prompt, does NOT exit
{
  clearBackStack()
  resetBackPressTimer()

  let navigatedTo = ''
  let exitPrompt = false
  let appExited = false

  let fakeTime = 10000

  const result1 = handleBackAction({
    activeTab: 'beranda',
    now: () => fakeTime,
    onNavigateTab: (t) => { navigatedTo = t },
    onShowExitPrompt: () => { exitPrompt = true },
    onExitApp: () => { appExited = true },
  })

  assert.equal(result1, 'exit-prompt', 'First back should trigger exit prompt')
  assert.equal(exitPrompt, true, 'Exit prompt callback invoked')
  assert.equal(appExited, false, 'App should NOT exit on first back')
  assert.equal(navigatedTo, '', 'No tab navigation on beranda')
  console.log('✓ Test 4: First back on Beranda prompts exit without exiting')
}

// Test 5: On Beranda, second back within 2000ms triggers app exit
{
  clearBackStack()
  resetBackPressTimer()

  let fakeTime = 20000
  let exitPromptCount = 0
  let appExited = false

  const ctx = {
    activeTab: 'beranda',
    now: () => fakeTime,
    onShowExitPrompt: () => { exitPromptCount++ },
    onExitApp: () => { appExited = true },
  }

  // First back at 20000ms
  const r1 = handleBackAction(ctx)
  assert.equal(r1, 'exit-prompt')
  assert.equal(appExited, false)

  // Second back at 21500ms (1500ms later <= 2000ms)
  fakeTime += 1500
  const r2 = handleBackAction(ctx)
  assert.equal(r2, 'app-exited', 'Second back within 2s should exit app')
  assert.equal(appExited, true, 'onExitApp should be called')
  console.log('✓ Test 5: Second back on Beranda within 2000ms exits app')
}

// Test 6: On Beranda, second back after 2001ms resets and prompts again
{
  clearBackStack()
  resetBackPressTimer()

  let fakeTime = 50000
  let exitPromptCount = 0
  let appExited = false

  const ctx = {
    activeTab: 'beranda',
    now: () => fakeTime,
    onShowExitPrompt: () => { exitPromptCount++ },
    onExitApp: () => { appExited = true },
  }

  // First back at 50000ms
  const r1 = handleBackAction(ctx)
  assert.equal(r1, 'exit-prompt')
  assert.equal(exitPromptCount, 1)

  // Second back at 52500ms (2500ms later > 2000ms)
  fakeTime += 2500
  const r2 = handleBackAction(ctx)
  assert.equal(r2, 'exit-prompt', 'Back after 2.5s should prompt again, not exit')
  assert.equal(exitPromptCount, 2)
  assert.equal(appExited, false, 'App should NOT exit')
  console.log('✓ Test 6: Second back after >2000ms prompts again without exiting')
}

console.log('--- ALL BACK STACK & TAB NAVIGATION TESTS PASSED ---')
