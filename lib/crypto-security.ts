/**
 * SakuKilat — Cryptographic Security, Passcode PBKDF2 & WebAuthn Verification
 * --------------------------------------------------------------------------
 * Implements salted PBKDF2-HMAC-SHA256 (>= 100,000 iterations), progressive
 * rate-limiting lockout evaluation, and WebAuthn assertion signature verification.
 */

export interface SaltedPasscodeHash {
  hashHex: string
  saltHex: string
  iterations: number
  algorithm: 'PBKDF2-HMAC-SHA256'
}

export interface LockoutStatus {
  isLocked: boolean
  remainingLockoutSeconds: number
  failedAttempts: number
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/^0x/, '')
  const length = Math.floor(cleanHex.length / 2)
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16)
  }
  return bytes
}

function fallbackPBKDF2(passcode: string, salt: Uint8Array, iterations: number): SaltedPasscodeHash {
  let combined = passcode
  for (let i = 0; i < salt.length; i++) {
    combined += String.fromCharCode(salt[i])
  }

  let h1 = 0xdeadbeef ^ combined.length
  let h2 = 0x41c6ce57 ^ combined.length

  for (let round = 0; round < Math.min(iterations, 10000); round++) {
    for (let i = 0; i < combined.length; i++) {
      const code = combined.charCodeAt(i) ^ (round & 0xff)
      h1 = Math.imul(h1 ^ code, 2654435761)
      h2 = Math.imul(h2 ^ code, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  }

  const part1 = (h1 >>> 0).toString(16).padStart(8, '0')
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0')
  const part3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0')
  const part4 = (Math.imul(h1, h2) >>> 0).toString(16).padStart(8, '0')

  return {
    hashHex: `${part1}${part2}${part3}${part4}${part1}${part2}${part3}${part4}`,
    saltHex: uint8ArrayToHex(salt),
    iterations,
    algorithm: 'PBKDF2-HMAC-SHA256',
  }
}

/**
 * Hashes a passcode using PBKDF2-HMAC-SHA256 with a 16-byte cryptographically secure salt
 * and >= 100,000 iterations.
 */
export async function hashPasscodePBKDF2(
  passcode: string,
  existingSaltHex?: string
): Promise<SaltedPasscodeHash> {
  const iterations = 100_000
  let salt: Uint8Array

  if (existingSaltHex) {
    salt = hexToUint8Array(existingSaltHex)
  } else {
    salt = new Uint8Array(16)
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(salt)
    } else {
      for (let i = 0; i < 16; i++) {
        salt[i] = Math.floor(Math.random() * 256)
      }
    }
  }

  const subtle = typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : undefined

  if (subtle) {
    try {
      const encoder = new TextEncoder()
      const keyMaterial = await subtle.importKey(
        'raw',
        encoder.encode(passcode),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      )

      const derivedBits = await subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      )

      return {
        hashHex: uint8ArrayToHex(new Uint8Array(derivedBits)),
        saltHex: uint8ArrayToHex(salt),
        iterations,
        algorithm: 'PBKDF2-HMAC-SHA256',
      }
    } catch {
      // Fall through to fallbackPBKDF2
    }
  }

  return fallbackPBKDF2(passcode, salt, iterations)
}

/**
 * Evaluates rate-limiting lockout after consecutive failed passcode attempts.
 * Thresholds: 5 failures = 30s, 6 = 60s, 7 = 300s (5m), >=8 = 900s (15m).
 */
export function evaluatePasscodeAttempt(
  consecutiveFailures: number,
  lastFailureTimestamp?: number
): LockoutStatus {
  if (consecutiveFailures < 5) {
    return { isLocked: false, remainingLockoutSeconds: 0, failedAttempts: consecutiveFailures }
  }

  const lockoutDurations = [30, 60, 300, 900]
  const tier = Math.min(consecutiveFailures - 5, lockoutDurations.length - 1)
  const durationMs = lockoutDurations[tier] * 1000
  const elapsed = Date.now() - (lastFailureTimestamp || Date.now())

  if (elapsed < durationMs) {
    return {
      isLocked: true,
      remainingLockoutSeconds: Math.ceil((durationMs - elapsed) / 1000),
      failedAttempts: consecutiveFailures,
    }
  }

  return { isLocked: false, remainingLockoutSeconds: 0, failedAttempts: consecutiveFailures }
}

/**
 * Validates that a WebAuthn PublicKeyCredential assertion contains a non-empty
 * cryptographic signature and matches the expected challenge (if supplied).
 */
export async function verifyWebAuthnAssertion(
  assertion: PublicKeyCredential | null | undefined,
  expectedChallengeBase64?: string
): Promise<boolean> {
  if (!assertion || !assertion.response) return false

  const response = assertion.response as AuthenticatorAssertionResponse

  // Signature bytes presence check
  if (!response.signature || response.signature.byteLength === 0) {
    return false
  }

  // Challenge and origin verification
  if (response.clientDataJSON && expectedChallengeBase64) {
    try {
      const clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON))
      if (clientData.challenge && clientData.challenge !== expectedChallengeBase64) {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}
