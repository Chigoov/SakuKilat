/**
 * SakuKilat — Onboarding Tour Persistence & Storage Cleanup Regression Tests
 *
 * Menguji bahwa:
 * 1. readCompleted bernilai false saat storage kosong.
 * 2. writeCompleted menulis multi-key flags dan terbaca true oleh readCompleted.
 * 3. cleanupStaleStorageKeys TIDAK menghapus kunci onboarding baru/legacy.
 * 4. isTrackedKey mengenali kunci onboarding untuk sinkronisasi @capacitor/preferences.
 * 5. Simulasi restart aplikasi + cleanup tetap membuat onboarding tidak muncul kembali.
 */

import assert from 'node:assert/strict'
import {
  ONBOARDING_VERSION,
  ONBOARDING_KEY_PREFIX,
  ONBOARDING_CANONICAL_KEY,
  storageKey,
  readCompleted,
  writeCompleted,
} from '../lib/onboarding-storage.ts'
import { cleanupStaleStorageKeys } from '../lib/storage.ts'
import { isTrackedKey } from '../lib/native-store.ts'

console.log('--- RUNNING TEST SUITE: Onboarding Persistence & Native Storage ---')

function createMockLocalStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    keys: () => Array.from(store.keys()),
    get length() {
      return store.size
    },
    _dump: () => Object.fromEntries(store.entries()),
  }
}

// Test 1: Initially when localStorage is empty, readCompleted returns false
{
  globalThis.window = { localStorage: createMockLocalStorage() }
  assert.equal(readCompleted('local-device@sakukilat.local'), false, 'Should be false on empty storage')
  assert.equal(readCompleted('local'), false, 'Should be false for local user')
  assert.equal(readCompleted(null), false, 'Should be false for null user')
  console.log('✓ Test 1: readCompleted correctly returns false when onboarding is not yet completed')
}

// Test 2: writeCompleted sets the flags, and readCompleted returns true
{
  globalThis.window = { localStorage: createMockLocalStorage() }
  writeCompleted('local-device@sakukilat.local')

  assert.equal(readCompleted('local-device@sakukilat.local'), true, 'Should be true for specific email')
  assert.equal(readCompleted('local'), true, 'Should be true for local user via fallback')
  assert.equal(readCompleted(null), true, 'Should be true for null user via fallback')

  // Verify expected keys exist in storage
  const rawStore = globalThis.window.localStorage._dump()
  assert.equal(rawStore[storageKey('local-device@sakukilat.local')], '1')
  assert.equal(rawStore[`${ONBOARDING_KEY_PREFIX}:local`], '1')
  assert.equal(rawStore[ONBOARDING_CANONICAL_KEY], '1')
  console.log('✓ Test 2: writeCompleted writes durable multi-key flags and readCompleted returns true')
}

// Test 3: cleanupStaleStorageKeys does NOT delete onboarding keys, but still cleans unknown garbage
{
  const mockStorage = createMockLocalStorage()
  mockStorage.setItem('sakukilat:v2:local-state', '{"wallets":[]}')
  mockStorage.setItem(storageKey('local-device@sakukilat.local'), '1')
  mockStorage.setItem(`${ONBOARDING_KEY_PREFIX}:local`, '1')
  mockStorage.setItem(ONBOARDING_CANONICAL_KEY, '1')
  mockStorage.setItem('sakukilat:v2:onboarding-completed-v8:local', '1') // legacy version
  mockStorage.setItem('sakukilat:onboarding:legacy-key', '1')
  mockStorage.setItem('sakukilat:unknown-garbage-key', 'junk') // real garbage

  cleanupStaleStorageKeys(mockStorage)

  // Verify onboarding keys survived cleanup
  assert.equal(mockStorage.getItem(storageKey('local-device@sakukilat.local')), '1', 'Specific key must survive')
  assert.equal(mockStorage.getItem(`${ONBOARDING_KEY_PREFIX}:local`), '1', 'Local key must survive')
  assert.equal(mockStorage.getItem(ONBOARDING_CANONICAL_KEY), '1', 'Canonical key must survive')
  assert.equal(mockStorage.getItem('sakukilat:v2:onboarding-completed-v8:local'), '1', 'Legacy v8 key must survive')
  assert.equal(mockStorage.getItem('sakukilat:onboarding:legacy-key'), '1', 'Legacy onboarding key must survive')

  // Verify garbage was deleted
  assert.equal(mockStorage.getItem('sakukilat:unknown-garbage-key'), null, 'Unknown garbage key must be cleaned up')
  console.log('✓ Test 3: cleanupStaleStorageKeys preserves all onboarding key variants while removing garbage')
}

// Test 4: Native storage bridge recognizes onboarding keys as tracked
{
  assert.equal(isTrackedKey('sakukilat:v2:onboarding-completed'), true)
  assert.equal(isTrackedKey(`${ONBOARDING_KEY_PREFIX}:local`), true)
  assert.equal(isTrackedKey(storageKey('local-device@sakukilat.local')), true)
  assert.equal(isTrackedKey('sakukilat:onboarding:legacy'), true)
  assert.equal(isTrackedKey('sakukilat:some-random-unknown-key'), false)
  console.log('✓ Test 4: isTrackedKey in native-store recognizes onboarding keys for Capacitor Preferences')
}

// Test 5: Simulation of full app restart / boot sequence
{
  // Step 1: User finishes onboarding
  const mockStorage = createMockLocalStorage()
  globalThis.window = { localStorage: mockStorage }
  writeCompleted('local-device@sakukilat.local')
  assert.equal(readCompleted('local-device@sakukilat.local'), true)

  // Step 2: App restarts, StoreProvider mounts and runs cleanupStaleStorageKeys
  cleanupStaleStorageKeys(mockStorage)

  // Step 3: OnboardingTour mounts and checks completion
  const isCompletedAfterRestart = readCompleted('local-device@sakukilat.local')
  assert.equal(isCompletedAfterRestart, true, 'Onboarding must remain completed after app restart + cleanup')
  console.log('✓ Test 5: Simulated app restart + cleanup preserves onboarding completed state')
}

console.log('--- ALL ONBOARDING PERSISTENCE TESTS PASSED ---')
