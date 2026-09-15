/**
 * SakuKilat — Strict Numerical and Date Sanitization Helper
 * --------------------------------------------------------
 * Enforces integer rupiah, non-negative bounds, and defensive Date wrapping.
 */

/**
 * Sanitizes input into a finite integer rupiah using Math.round.
 * Rejects NaN, Infinity, -Infinity, and non-numeric inputs.
 */
export function sanitizeIntegerRupiah(amount: unknown, fieldName = 'Nominal'): number {
  if (amount === null || amount === undefined) {
    throw new Error(`${fieldName} tidak boleh kosong.`)
  }

  let num: number
  if (typeof amount === 'number') {
    num = amount
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim()
    if (!trimmed) {
      throw new Error(`${fieldName} tidak boleh kosong.`)
    }
    let s = trimmed.replace(/^[Rr][Pp]\.?\s*/, '').trim()
    if (s.includes('.') && s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else if (s.includes('.') && ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s))) {
      s = s.replace(/\./g, '')
    } else if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.')
    }
    const cleanStr = s.replace(/[^0-9.-]/g, '')
    num = parseFloat(cleanStr)
  } else {
    throw new Error(`${fieldName} harus berupa angka valid.`)
  }

  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`${fieldName} harus berupa bilangan terhingga.`)
  }

  return Math.round(num)
}

/**
 * Validates that an amount is a strictly positive integer (> 0).
 */
export function validatePositiveMonetaryAmount(amount: unknown, fieldName = 'Nominal'): number {
  const sanitized = sanitizeIntegerRupiah(amount, fieldName)
  if (sanitized <= 0) {
    throw new Error(`${fieldName} harus bernilai lebih besar dari 0.`)
  }
  return sanitized
}

/**
 * Defensive date wrapper guarding against RangeError: Invalid time value.
 * Always returns a valid ISO-8601 string.
 */
export function safeToISOString(dateInput: unknown, fallbackDate: Date = new Date()): string {
  try {
    if (dateInput instanceof Date) {
      if (!Number.isNaN(dateInput.getTime())) {
        return dateInput.toISOString()
      }
    } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
      const d = new Date(dateInput)
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString()
      }
    }
  } catch {
    // Return fallback on any parsing failure
  }

  const safeFallback = fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())
    ? fallbackDate
    : new Date()
  return safeFallback.toISOString()
}
/**
 * Validates monthly budget to ensure it is a non-negative integer.
 */
export function validateMonthlyBudget(budget: unknown): number {
  const sanitized = sanitizeIntegerRupiah(budget, 'Anggaran bulanan')
  if (sanitized < 0) {
    throw new Error('Anggaran bulanan tidak boleh bernilai negatif.')
  }
  return sanitized
}
