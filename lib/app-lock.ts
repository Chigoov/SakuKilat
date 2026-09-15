'use client'

import {
  hashPasscodePBKDF2,
  evaluatePasscodeAttempt,
  verifyWebAuthnAssertion,
  type SaltedPasscodeHash,
  type LockoutStatus,
} from './crypto-security.ts'

export { hashPasscodePBKDF2, evaluatePasscodeAttempt, verifyWebAuthnAssertion }
export type { SaltedPasscodeHash, LockoutStatus }

export interface AppLockConfig {
  enabled: boolean
  passcodeHash: string
  passcodeSalt?: string
  consecutiveFailures?: number
  lastFailureTimestamp?: number
  lockoutUntil?: number
  biometricEnabled: boolean
  credentialId?: string
  updatedAt: string
}

const APP_LOCK_KEY = 'sakukilat:v2:app-lock'

function emitChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('sakukilat:app-lock-changed'))
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function readLockConfig(): AppLockConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(APP_LOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppLockConfig
    if (!parsed?.enabled || !parsed.passcodeHash) return null
    return parsed
  } catch {
    return null
  }
}

function writeLockConfig(config: AppLockConfig | null) {
  if (typeof window === 'undefined') return
  if (!config) {
    window.localStorage.removeItem(APP_LOCK_KEY)
    emitChange()
    return
  }
  window.localStorage.setItem(APP_LOCK_KEY, JSON.stringify(config))
  emitChange()
}

async function sha256(value: string): Promise<string> {
  const subtle = typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : undefined
  if (subtle) {
    const encoded = new TextEncoder().encode(value)
    const hash = await subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  let h1 = 0xdeadbeef ^ value.length
  let h2 = 0x41c6ce57 ^ value.length
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

export async function savePasscode(passcode: string, previous?: AppLockConfig | null): Promise<AppLockConfig> {
  const salted = await hashPasscodePBKDF2(passcode)
  const next: AppLockConfig = {
    enabled: true,
    passcodeHash: salted.hashHex,
    passcodeSalt: salted.saltHex,
    consecutiveFailures: 0,
    lastFailureTimestamp: undefined,
    lockoutUntil: undefined,
    biometricEnabled: previous?.biometricEnabled ?? false,
    credentialId: previous?.credentialId,
    updatedAt: new Date().toISOString(),
  }
  writeLockConfig(next)
  return next
}

export async function verifyPasscode(passcode: string, config = readLockConfig()): Promise<boolean> {
  if (!config?.passcodeHash) return false

  // Evaluate progressive rate-limiting lockout
  const lockout = evaluatePasscodeAttempt(config.consecutiveFailures || 0, config.lastFailureTimestamp)
  if (lockout.isLocked) {
    return false
  }

  let matches = false
  if (config.passcodeSalt) {
    const derived = await hashPasscodePBKDF2(passcode, config.passcodeSalt)
    matches = derived.hashHex === config.passcodeHash
  } else {
    // Legacy fallback for unsalted passcodes
    matches = (await sha256(passcode)) === config.passcodeHash
    if (matches) {
      // Opportunistically upgrade to salted PBKDF2
      const salted = await hashPasscodePBKDF2(passcode)
      config.passcodeHash = salted.hashHex
      config.passcodeSalt = salted.saltHex
    }
  }

  if (matches) {
    writeLockConfig({
      ...config,
      consecutiveFailures: 0,
      lastFailureTimestamp: undefined,
      lockoutUntil: undefined,
    })
    return true
  }

  const failures = (config.consecutiveFailures || 0) + 1
  const updatedLockout = evaluatePasscodeAttempt(failures, Date.now())
  writeLockConfig({
    ...config,
    consecutiveFailures: failures,
    lastFailureTimestamp: Date.now(),
    lockoutUntil: updatedLockout.isLocked ? Date.now() + updatedLockout.remainingLockoutSeconds * 1000 : undefined,
  })
  return false
}

export function clearPasscode() {
  writeLockConfig(null)
}

export function isBiometricSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials
}

export async function enrollBiometric(config = readLockConfig()): Promise<AppLockConfig> {
  if (!config) throw new Error('Sandi belum aktif.')
  if (!isBiometricSupported()) throw new Error('Sidik jari tidak didukung di perangkat ini.')

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'SakuKilat', id: window.location.hostname },
      user: {
        id: randomBytes(16),
        name: 'local@sakukilat.app',
        displayName: 'SakuKilat',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    },
  }) as PublicKeyCredential | null

  if (!credential) throw new Error('Sidik jari gagal diaktifkan.')

  const next: AppLockConfig = {
    ...config,
    biometricEnabled: true,
    credentialId: bytesToBase64(new Uint8Array(credential.rawId)),
    updatedAt: new Date().toISOString(),
  }
  writeLockConfig(next)
  return next
}

export function disableBiometric(config = readLockConfig()) {
  if (!config) return
  writeLockConfig({
    ...config,
    biometricEnabled: false,
    updatedAt: new Date().toISOString(),
  })
}

export async function authenticateBiometric(config = readLockConfig()): Promise<boolean> {
  if (!config?.biometricEnabled || !config.credentialId || !isBiometricSupported()) return false
  try {
    const challengeBytes = randomBytes(32)
    const challengeBase64 = bytesToBase64(challengeBytes)
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes,
        allowCredentials: [{ id: base64ToBytes(config.credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!credential) return false
    return await verifyWebAuthnAssertion(credential, challengeBase64)
  } catch {
    return false
  }
}
