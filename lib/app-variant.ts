export type AppVariant = 'user' | 'owner'

const USER_APP_NAME = 'Saku Kilat V2'
const OWNER_APP_NAME = 'SakuKilat'
const OWNER_FLAG = 'owner'
const OWNER_QUERY = 'profile'

function readBuildVariant(): AppVariant | null {
  const raw = process.env.NEXT_PUBLIC_APP_VARIANT
  return raw === 'owner' || raw === 'user' ? raw : null
}

function readVariant(): AppVariant {
  const buildVariant = readBuildVariant()
  if (buildVariant) return buildVariant
  if (typeof window === 'undefined') return 'user'
  const params = new URLSearchParams(window.location.search)
  return params.get(OWNER_QUERY) === OWNER_FLAG ? 'owner' : 'user'
}

export const APP_VARIANT = readVariant()
export const APP_NAME = APP_VARIANT === 'owner' ? OWNER_APP_NAME : USER_APP_NAME
export const APP_STORAGE_PREFIX = APP_VARIANT === 'owner' ? 'sakukilat-owner:v1' : 'sakukilat-user:v2'
export const PRELOADED_STATE_URL = '/preloaded-state.json'

export function appScopedKey(name: string): string {
  return `${APP_STORAGE_PREFIX}:${name}`
}
