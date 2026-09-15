/**
 * SakuKilat — Property-Based Test: LIFO Back-Stack Sublayer Navigation Hierarchy
 *
 * Feature: sakukilat-submenus-and-bugfixes
 * Property 1: Stacking Layer Navigation for Tab Saku
 * Validates: Requirements 2.1, 2.7, 3.1
 *
 * Generates random sequences of open, close, and back-press operations across
 * Saku sublayers and dialogs/modals:
 * 1. Asserts pressing back closes the uppermost active sublayer first (LIFO order).
 * 2. Asserts underlying layers remain open until subsequent back actions occur.
 * 3. Asserts app never exits prematurely while layers or non-beranda tabs are active.
 */

import assert from 'node:assert/strict'
import { fc, testProperty } from './pbt-harness.mjs'
import {
  pushBackLayer,
  popBackLayer,
  removeBackLayer,
  clearBackStack,
  backStackDepth,
  peekBackLayer,
  handleBackAction,
} from '../lib/back-stack.ts'

console.log('========================================================================')
console.log(' SAKUKILAT — PBT: LIFO BACK-STACK SUBLAYER NAVIGATION HIERARCHY         ')
console.log(' Feature: sakukilat-submenus-and-bugfixes | Property 1                  ')
console.log(' Validates: Requirements 2.1, 2.7, 3.1                                  ')
console.log('========================================================================\n')

const SAKU_LAYERS = ['wallets', 'money-move', 'categories', 'inbox', 'budget']
const SAKU_MODALS = [
  'modal-add-wallet',
  'modal-edit-wallet',
  'modal-add-category',
  'modal-add-subcategory',
  'reconciliation-modal',
  'monthly-close-modal',
  'net-worth-modal',
]

// Arbitrary action command generator
const arbNavigationCommand = fc.oneof(
  // Action 1: Open Saku Sublayer Sheet
  fc.constantFrom(...SAKU_LAYERS).map(layer => ({
    type: 'open_saku_layer',
    id: `saku-layer-${layer}`,
    layerType: 'sheet',
  })),

  // Action 2: Open Nested Submodal / Dialog
  fc.constantFrom(...SAKU_MODALS).map(modal => ({
    type: 'open_submodal',
    id: modal,
    layerType: 'modal',
  })),

  // Action 3: Programmatic Close (Click "X" or backdrop)
  fc.constantFrom(...SAKU_LAYERS.map(l => `saku-layer-${l}`), ...SAKU_MODALS).map(id => ({
    type: 'close_programmatic',
    id,
  })),

  // Action 4: Native / Hardware Back Press
  fc.constant({ type: 'back_press' })
)

testProperty(
  'Property 1: Stacking Layer Navigation for Tab Saku - LIFO Back-Stack Navigation Hierarchy',
  fc.property(
    fc.array(arbNavigationCommand, { minLength: 5, maxLength: 60 }),
    fc.constantFrom('saku', 'rekapan', 'rencana', 'profil'),
    (commands, initialTab) => {
      clearBackStack()

      // Shadow model maintaining expected layers
      // [{ id, type, closedByBack: boolean }]
      const shadowStack = []
      let currentTab = initialTab
      let appExited = false
      let exitPromptShown = false

      for (const cmd of commands) {
        if (cmd.type === 'open_saku_layer' || cmd.type === 'open_submodal') {
          // If layer not already open, push it
          const alreadyOpen = shadowStack.some(item => item.id === cmd.id)
          if (!alreadyOpen) {
            const shadowEntry = {
              id: cmd.id,
              type: cmd.layerType,
              closedByBack: false,
            }
            shadowStack.push(shadowEntry)

            pushBackLayer({
              id: cmd.id,
              type: cmd.layerType,
              onClose: () => {
                shadowEntry.closedByBack = true
              },
            })
          }

          // Invariant: backStackDepth matches shadow stack depth
          assert.equal(
            backStackDepth(),
            shadowStack.length,
            `Stack depth must match shadow stack depth after opening ${cmd.id}`
          )

          // Invariant: Top layer must be the one most recently pushed
          const top = peekBackLayer()
          assert.ok(top, 'peekBackLayer must return a layer')
          assert.equal(top.id, shadowStack[shadowStack.length - 1].id)
        } else if (cmd.type === 'close_programmatic') {
          const shadowIdx = shadowStack.findIndex(item => item.id === cmd.id)
          if (shadowIdx >= 0) {
            const entry = shadowStack[shadowIdx]
            shadowStack.splice(shadowIdx, 1)
            removeBackLayer(cmd.id)

            // Invariant: programmatic removeBackLayer MUST NOT invoke onClose callback
            assert.equal(
              entry.closedByBack,
              false,
              `removeBackLayer("${cmd.id}") must not trigger onClose callback`
            )
            assert.equal(backStackDepth(), shadowStack.length)
          }
        } else if (cmd.type === 'back_press') {
          const depthBefore = backStackDepth()
          let actionExitedThisPress = false

          const result = handleBackAction({
            activeTab: currentTab,
            onNavigateTab: (newTab) => {
              currentTab = newTab
            },
            onExitApp: () => {
              appExited = true
              actionExitedThisPress = true
            },
            onShowExitPrompt: () => {
              exitPromptShown = true
            },
          })

          if (depthBefore > 0) {
            // Invariant 1: Topmost active layer must be closed first (LIFO order)
            assert.equal(
              result,
              'layer-closed',
              'Back press with open layers must return "layer-closed"'
            )
            assert.equal(
              actionExitedThisPress,
              false,
              'App must NEVER exit when back is pressed with open layers'
            )

            const poppedShadow = shadowStack.pop()
            assert.equal(
              poppedShadow.closedByBack,
              true,
              `Topmost layer "${poppedShadow.id}" onClose must be called`
            )
            assert.equal(
              backStackDepth(),
              shadowStack.length,
              'Stack depth must decrease by exactly 1'
            )

            // Invariant 2: Underlying layers must NOT be closed
            for (const remaining of shadowStack) {
              assert.equal(
                remaining.closedByBack,
                false,
                `Underlying layer "${remaining.id}" must remain open and not have onClose called`
              )
            }
          } else {
            // Depth was 0: No open layers
            if (currentTab !== 'beranda') {
              // Invariant 3: From any sub-tab, back navigates to beranda without exiting app
              assert.equal(
                result,
                'tab-navigated',
                'Back press with empty stack on non-beranda tab must navigate tab'
              )
              assert.equal(currentTab, 'beranda', 'Must navigate back to "beranda"')
              assert.equal(actionExitedThisPress, false, 'App must not exit when navigating tab')
            }
          }
        }
      }

      clearBackStack()
      return true
    }
  ),
  { numRuns: 150 }
)

console.log('✅ Property 1 (LIFO Back-Stack Navigation Hierarchy) verified!\n')
