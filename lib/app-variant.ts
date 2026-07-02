'use client'

export type AppVariant = 'user' | 'owner'

const USER_APP_NAME = 'Saku Kilat V2'
const OWNER_APP_NAME = 'SakuKilat'
const OWNER_FLAG = 'owner'
const OWNER_QUERY = 'profile'
const USER_STATE_URL = '/preloaded-state.json'
const OWNER_STATE_URL = '/private-profiles/sakukilat-owner-state.json'

function readVariant(): AppVariant {
  if (typeof window === 'undefined') return 'user'
  const params = new URLSearchParams(window.location.search)
  return params.get(OWNER_QUERY) === OWNER_FLAG ? 'owner' : 'user'
}

export const APP_VARIANT = readVariant()
export const APP_NAME = APP_VARIANT === 'owner' ? OWNER_APP_NAME : USER_APP_NAME
export const APP_STORAGE_PREFIX = APP_VARIANT === 'owner' ? 'sakukilat-owner:v1' : 'sakukilat-user:v2'
export const PRELOADED_STATE_URL = APP_VARIANT === 'owner' ? OWNER_STATE_URL : USER_STATE_URL

export function appScopedKey(name: string): string {
  return `${APP_STORAGE_PREFIX}:${name}`
}
