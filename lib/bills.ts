/**
 * SakuKilat — Bill & Subscription Center (Phase P5)
 * Core business logic, recurrence calculations, and urgency grouping.
 */

import { toCalendarDateString, toTransactionDateParts } from './parser.ts'

export type RecurrencePeriod = 'weekly' | 'monthly' | 'annually'

export interface Bill {
  id: string
  name: string
  amount: number
  categoryId: string
  paymentMethodId: string
  recurrence: RecurrencePeriod
  dueDay: number // 1 - 31 for monthly, 1 - 7 for weekly (1=Monday..7=Sunday), etc.
  nextDueDate: string // ISO calendar date "YYYY-MM-DD"
  isActive: boolean
  note?: string
  lastPaidTransactionId?: string
  lastPaidAt?: string
  dueMonth?: number // 1 - 12 for annual recurrence
}

export type BillUrgency = 'overdue' | 'dueToday' | 'dueSoon' | 'dueLater' | 'future'

export interface GroupedBills {
  overdue: Bill[]
  dueToday: Bill[]
  dueSoon: Bill[]
  dueLater: Bill[]
  future: Bill[]
  inactive: Bill[]
}

export interface CreateBillInput {
  name: string
  amount: number
  categoryId: string
  paymentMethodId: string
  recurrence: RecurrencePeriod
  dueDay: number
  nextDueDate?: string
  isActive?: boolean
  note?: string
  dueMonth?: number
}

/**
 * Returns number of days in a given calendar month.
 * month is 1-12.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Generates a unique Bill identifier.
 */
export function generateBillId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `bill-${Date.now()}-${random}`
}

/**
 * Normalizes input date into calendar Date object at local midnight (00:00:00).
 */
export function toMidnightDate(dateInput?: Date | string | number): Date {
  const parts = toTransactionDateParts(dateInput)
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
}

/**
 * Computes calendar days between d1 and d2 (d2 - d1).
 * Positive if d2 is in the future relative to d1.
 */
export function calendarDaysBetween(
  d1Input: Date | string | number,
  d2Input: Date | string | number
): number {
  const d1 = toMidnightDate(d1Input)
  const d2 = toMidnightDate(d2Input)
  const diffMs = d2.getTime() - d1.getTime()
  return Math.round(diffMs / (24 * 60 * 60 * 1000))
}

/**
 * Computes the next calendar due date based on recurrence period and reference date.
 * Guarantees that the returned date string ("YYYY-MM-DD") is strictly greater than referenceDate.
 * 
 * - 'weekly': dueDay is 1-7 (1=Mon..7=Sun, 0=Sun). Finds next occurrence > referenceDate.
 * - 'monthly': dueDay is 1-31. If dueDay > daysInMonth, clamped to last day of month.
 * - 'annually': dueDay is 1-31, dueMonth is 1-12 (defaults to referenceDate month).
 */
export function computeNextDueDate(
  recurrence: RecurrencePeriod,
  dueDay: number,
  referenceDate?: Date | string | number,
  options?: number | { dueMonth?: number; baseDate?: Date | string }
): string {
  const refParts = toTransactionDateParts(referenceDate)
  const refDateObj = new Date(refParts.year, refParts.month - 1, refParts.day, 0, 0, 0, 0)

  if (recurrence === 'weekly') {
    const refDayOfWeek = refDateObj.getDay() // 0 = Sunday, 1 = Monday...
    const refIsoDay = refDayOfWeek === 0 ? 7 : refDayOfWeek
    let targetIsoDay = Math.round(dueDay)
    if (targetIsoDay === 0) targetIsoDay = 7
    targetIsoDay = Math.max(1, Math.min(7, targetIsoDay))

    let daysAhead = targetIsoDay - refIsoDay
    if (daysAhead <= 0) {
      daysAhead += 7
    }

    const nextDate = new Date(refParts.year, refParts.month - 1, refParts.day + daysAhead)
    return toCalendarDateString(nextDate)
  }

  if (recurrence === 'monthly') {
    const rawDay = Math.max(1, Math.min(31, Math.round(dueDay)))

    // Check if this month's date is strictly greater than reference date
    const daysThisMonth = getDaysInMonth(refParts.year, refParts.month)
    const clampedDayThisMonth = Math.min(rawDay, daysThisMonth)

    if (clampedDayThisMonth > refParts.day) {
      const nextDate = new Date(refParts.year, refParts.month - 1, clampedDayThisMonth)
      return toCalendarDateString(nextDate)
    }

    // Otherwise, advance to next month
    let nextYear = refParts.year
    let nextMonth = refParts.month + 1
    if (nextMonth > 12) {
      nextMonth = 1
      nextYear += 1
    }

    const daysNextMonth = getDaysInMonth(nextYear, nextMonth)
    const clampedDayNextMonth = Math.min(rawDay, daysNextMonth)
    const nextDate = new Date(nextYear, nextMonth - 1, clampedDayNextMonth)
    return toCalendarDateString(nextDate)
  }

  if (recurrence === 'annually') {
    const rawDay = Math.max(1, Math.min(31, Math.round(dueDay)))
    let targetMonth: number
    if (typeof options === 'number') {
      targetMonth = options
    } else if (options?.dueMonth !== undefined) {
      targetMonth = options.dueMonth
    } else if (options?.baseDate) {
      targetMonth = toTransactionDateParts(options.baseDate).month
    } else {
      targetMonth = refParts.month
    }
    targetMonth = Math.max(1, Math.min(12, Math.round(targetMonth)))

    // Try targetMonth in refYear
    const daysInTargetThisYear = getDaysInMonth(refParts.year, targetMonth)
    const clampedDayThisYear = Math.min(rawDay, daysInTargetThisYear)
    const candidateThisYear = new Date(refParts.year, targetMonth - 1, clampedDayThisYear, 0, 0, 0, 0)

    if (candidateThisYear.getTime() > refDateObj.getTime()) {
      return toCalendarDateString(candidateThisYear)
    }

    // Advance to next year
    const nextYear = refParts.year + 1
    const daysInTargetNextYear = getDaysInMonth(nextYear, targetMonth)
    const clampedDayNextYear = Math.min(rawDay, daysInTargetNextYear)
    const nextDate = new Date(nextYear, targetMonth - 1, clampedDayNextYear)
    return toCalendarDateString(nextDate)
  }

  // Fallback (safe 1-day advance)
  return toCalendarDateString(new Date(refParts.year, refParts.month - 1, refParts.day + 1))
}

/**
 * Advances a bill's nextDueDate to the next occurrence following a payment or schedule advance.
 */
export function advanceBillDueDate(bill: Bill, fromDate?: Date | string): string {
  const base = fromDate || bill.nextDueDate
  return computeNextDueDate(bill.recurrence, bill.dueDay, base, { dueMonth: bill.dueMonth })
}

/**
 * Determines the urgency status of a single bill relative to reference date.
 */
export function getBillUrgency(bill: Bill, referenceDate?: Date | string | number): BillUrgency {
  const refParts = toTransactionDateParts(referenceDate)
  const dueParts = toTransactionDateParts(bill.nextDueDate)
  const diffDays = calendarDaysBetween(referenceDate || new Date(), bill.nextDueDate)

  if (diffDays < 0) {
    return 'overdue'
  }
  if (diffDays === 0) {
    return 'dueToday'
  }
  if (diffDays >= 1 && diffDays <= 5) {
    return 'dueSoon'
  }

  // diffDays > 5
  if (dueParts.year === refParts.year && dueParts.month === refParts.month) {
    return 'dueLater'
  }

  return 'future'
}

/**
 * Groups active bills by urgency category according to Requirement 5.3 & Property 14:
 * - dueToday: dueDate == referenceDate
 * - dueSoon: 1 <= dueDate - referenceDate <= 5
 * - dueLater: dueDate - referenceDate > 5 within current month
 * - overdue: dueDate < referenceDate
 * - future: dueDate > 5 days and in subsequent months
 * - inactive: bills where isActive is false
 */
export function groupBillsByUrgency(
  bills: Bill[],
  referenceDate?: Date | string | number,
  options?: { filterActive?: boolean }
): GroupedBills {
  const result: GroupedBills = {
    overdue: [],
    dueToday: [],
    dueSoon: [],
    dueLater: [],
    future: [],
    inactive: [],
  }

  const shouldFilterActive = options?.filterActive !== false

  for (const bill of bills) {
    if (!bill.isActive) {
      result.inactive.push(bill)
      if (shouldFilterActive) continue
    }

    const urgency = getBillUrgency(bill, referenceDate)
    result[urgency].push(bill)
  }

  // Sort each group by nextDueDate ascending
  const sortByDate = (a: Bill, b: Bill) => a.nextDueDate.localeCompare(b.nextDueDate)
  result.overdue.sort(sortByDate)
  result.dueToday.sort(sortByDate)
  result.dueSoon.sort(sortByDate)
  result.dueLater.sort(sortByDate)
  result.future.sort(sortByDate)
  result.inactive.sort(sortByDate)

  return result
}

/**
 * Identifies the nearest active bill due on or after referenceDate.
 * Satisfies Requirement 5.7 and Property 16 for widget snapshot projection.
 */
export function getNearestBill(bills: Bill[], referenceDate?: Date | string | number): Bill | null {
  const todayStr = toCalendarDateString(referenceDate)
  const eligible = bills.filter(b => b.isActive && b.nextDueDate >= todayStr)
  if (eligible.length === 0) return null

  eligible.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
  return eligible[0]
}

/**
 * Formats a bill due date into friendly Indonesian text.
 */
export function formatBillDueDate(dateStr: string, referenceDate?: Date | string | number): string {
  const diffDays = calendarDaysBetween(referenceDate || new Date(), dateStr)
  if (diffDays === 0) return 'Hari ini'
  if (diffDays === 1) return 'Besok'
  if (diffDays > 1 && diffDays <= 5) return `${diffDays} hari lagi`
  if (diffDays < 0) return `${Math.abs(diffDays)} hari lewat`

  const parts = toTransactionDateParts(dateStr)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const refParts = toTransactionDateParts(referenceDate)

  if (parts.year === refParts.year) {
    return `${parts.day} ${MONTHS[parts.month - 1]}`
  }
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`
}

/**
 * Creates a new Bill instance with defaults and validated fields.
 */
export function createBill(input: CreateBillInput): Bill {
  const id = generateBillId()
  const recurrence = input.recurrence || 'monthly'
  let rawDueDay = input.dueDay !== undefined ? Math.round(input.dueDay) : 1
  if (recurrence === 'weekly' && rawDueDay === 0) {
    rawDueDay = 7
  }
  const dueDay = Math.max(1, rawDueDay)
  const nextDueDate = input.nextDueDate || computeNextDueDate(recurrence, dueDay, new Date(), { dueMonth: input.dueMonth })

  return {
    id,
    name: input.name.trim(),
    amount: Math.max(0, Math.round(input.amount)),
    categoryId: input.categoryId || 'tagihan',
    paymentMethodId: input.paymentMethodId || 'tunai',
    recurrence,
    dueDay,
    nextDueDate,
    isActive: input.isActive !== false,
    note: input.note?.trim() || undefined,
    dueMonth: input.dueMonth,
  }
}
