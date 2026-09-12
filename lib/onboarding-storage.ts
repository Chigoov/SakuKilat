/**
 * SakuKilat — Durable Onboarding Storage & State Management
 */

import { mirrorToNative } from './native-store.ts'

export const ONBOARDING_VERSION = 9
export const ONBOARDING_KEY_PREFIX = `sakukilat:v2:onboarding-completed-v${ONBOARDING_VERSION}`
export const ONBOARDING_CANONICAL_KEY = 'sakukilat:v2:onboarding-completed'

export function storageKey(userId?: string | null): string {
  return `${ONBOARDING_KEY_PREFIX}:${encodeURIComponent(userId || 'local')}`
}

export function readCompleted(userId?: string | null): boolean {
  if (typeof window === 'undefined') return true
  try {
    const targetKey = storageKey(userId)
    if (window.localStorage.getItem(targetKey) === '1') return true
    if (window.localStorage.getItem(`${ONBOARDING_KEY_PREFIX}:local`) === '1') return true
    if (window.localStorage.getItem(ONBOARDING_KEY_PREFIX) === '1') return true
    if (window.localStorage.getItem(ONBOARDING_CANONICAL_KEY) === '1') return true

    // Check if any version of onboarding was previously marked completed on this device
    const len = window.localStorage.length
    for (let i = 0; i < len; i++) {
      const k = window.localStorage.key(i)
      if (k && (k.startsWith('sakukilat:v2:onboarding-completed') || k.startsWith('sakukilat:onboarding:'))) {
        if (window.localStorage.getItem(k) === '1') return true
      }
    }
    return false
  } catch {
    return true
  }
}

export function writeCompleted(userId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const targetKey = storageKey(userId)
    const localKey = `${ONBOARDING_KEY_PREFIX}:local`
    const canonicalKey = ONBOARDING_CANONICAL_KEY

    window.localStorage.setItem(targetKey, '1')
    window.localStorage.setItem(localKey, '1')
    window.localStorage.setItem(canonicalKey, '1')

    // Mirror to native durable preferences (survives WebView cache wipe & APK restart)
    mirrorToNative(targetKey, '1')
    mirrorToNative(localKey, '1')
    mirrorToNative(canonicalKey, '1')
  } catch {
    /* localStorage can be blocked in private mode */
  }
}
