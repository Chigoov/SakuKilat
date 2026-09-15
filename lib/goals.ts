/**
 * SakuKilat — Goal Planner Subsystem (Phase P7, Task 14.1)
 * --------------------------------------------------------
 * Extends the existing GoalTracker data model with deadline-based contribution math,
 * remaining months calculations, and deterministic health status classification
 * ('Aman', 'Perlu dipercepat', 'Terlambat').
 *
 * Requirements:
 * - 7.1: Extend Goal model with targetDate, targetAmount, currentAmount, notes
 * - 7.2: Calculate suggested monthly contribution required to reach target
 * - 7.3: Classify goal health into 'Aman', 'Perlu dipercepat', or 'Terlambat'
 *
 * Properties:
 * - Property 20: Goal Planner Suggested Contribution Calculation
 *   For any goal with target T, current C (where T > C), and target date D having
 *   M remaining whole months (M >= 1), suggested monthly contribution SHALL equal
 *   Math.ceil((T - C) / M).
 * - Property 21: Goal Health Classification
 *   Evaluated health status SHALL be strictly one of 'Aman', 'Perlu dipercepat',
 *   or 'Terlambat'.
 */

import {
  formatIDR,
  formatIDRCompact,
  toCalendarDateString,
  toTransactionDateParts,
} from './parser.ts'

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type GoalHealthStatus = 'Aman' | 'Perlu dipercepat' | 'Terlambat'

/**
 * Compatible extension of the existing GoalTracker model.
 * Provides aliases (name/label, targetAmount/target, currentAmount/saved, targetDate/deadline)
 * for backward and forward compatibility.
 */
export interface Goal {
  id: string
  label: string
  name?: string
  target: number
  targetAmount?: number
  saved: number
  currentAmount?: number
  deadline?: string // ISO date or "YYYY-MM-DD"
  targetDate?: string // ISO date or "YYYY-MM-DD"
  note?: string
  monthlyContributionRequired?: number
  healthStatus?: GoalHealthStatus
  createdAt: string
  updatedAt?: string
}

/**
 * Formal GoalEnhanced model specified in Phase P7 Architecture & Design.
 */
export interface GoalEnhanced {
  id: string
  name: string
  label: string
  targetAmount: number
  target: number
  currentAmount: number
  saved: number
  targetDate: string // "YYYY-MM-DD"
  deadline?: string
  note?: string
  monthlyContributionRequired: number
  healthStatus: GoalHealthStatus
  createdAt: string
  updatedAt: string
}

export interface GoalHealthOptions {
  createdAt?: Date | string | number
  currentPace?: number
  expectedMonthlyContribution?: number
}

export interface CreateGoalInput {
  name?: string
  label?: string
  targetAmount?: number
  target?: number
  targetDate?: string | Date
  deadline?: string | Date
  saved?: number
  currentAmount?: number
  note?: string
  createdAt?: string | Date
}

export interface GoalHealthFormat {
  status: GoalHealthStatus
  label: string
  badgeText: string
  color: string
  bgClass: string
  textClass: string
  borderClass: string
}

export const GOAL_STORAGE_KEY = 'sakukilat:v2:goals'
export const CELEBRATED_GOALS_KEY = 'sakukilat:v2:celebrated-goals'

// ── Date & Calendar Helpers ──────────────────────────────────────────────────

/**
 * Normalizes input date into a local calendar midnight Date object.
 */
export function toMidnightDate(dateInput?: Date | string | number): Date {
  const parts = toTransactionDateParts(dateInput)
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
}

/**
 * Checks if the given date is the last day of its calendar month.
 */
export function isLastDayOfMonth(d: Date): boolean {
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return d.getDate() >= daysInMonth
}

/**
 * Generates a unique Goal identifier compatible with existing g_ prefix.
 */
export function generateGoalId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `g_${random}`
}

/**
 * Calculates calendar days between reference date and target date (target - reference).
 * Returns null if target date is missing or invalid.
 * Positive if target is in the future.
 */
export function daysUntil(
  targetDateInput?: Date | string | number | null,
  referenceDateInput: Date | string | number = new Date()
): number | null {
  if (!targetDateInput) return null
  const target = toMidnightDate(targetDateInput)
  if (Number.isNaN(target.getTime())) return null
  const ref = toMidnightDate(referenceDateInput)
  if (Number.isNaN(ref.getTime())) return null
  return Math.round((target.getTime() - ref.getTime()) / 86_400_000)
}

/**
 * Calculates whole months between startDate and endDate.
 * Returns 0 if endDate is at or before startDate.
 */
export function calculateMonthsBetween(
  startDateInput: Date | string | number,
  endDateInput: Date | string | number
): number {
  const start = toMidnightDate(startDateInput)
  const end = toMidnightDate(endDateInput)
  if (end.getTime() <= start.getTime()) return 0

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  // If end date's day of month is strictly less than start date's day of month,
  // the current month is only partially elapsed (unless end is on the last day of month)
  if (end.getDate() < start.getDate() && !isLastDayOfMonth(end)) {
    months -= 1
  }
  return Math.max(0, months)
}

/**
 * Calculates remaining whole calendar months until target date.
 * Returns 0 if targetDate is missing, invalid, or at/before reference date.
 */
export function calculateRemainingMonths(
  targetDateInput?: Date | string | number | null,
  referenceDateInput: Date | string | number = new Date()
): number {
  if (!targetDateInput) return 0
  return calculateMonthsBetween(referenceDateInput, targetDateInput)
}

// ── Requirement 7.2 & Property 20: Monthly Contribution Math ─────────────────

/**
 * Calculates the suggested monthly contribution required to reach the target amount
 * by the target completion date.
 *
 * Formal Guarantee (Property 20):
 * For any financial goal with target amount T, current amount C (where T > C),
 * and target completion date D having M remaining whole months (M >= 1),
 * the suggested monthly contribution SHALL equal Math.ceil((T - C) / M).
 *
 * Edge cases:
 * - If currentAmount >= targetAmount: returns 0 (goal already completed).
 * - If targetAmount <= 0: returns 0.
 * - If targetDate is missing: returns 0 (no finite deadline).
 * - If M === 0 (due within current calendar month or overdue): returns remaining amount (T - C).
 */
export function calculateMonthlyContribution(
  targetAmount: number,
  currentAmount: number,
  targetDateInput?: Date | string | number | null,
  referenceDateInput: Date | string | number = new Date()
): number {
  const target = Math.max(0, Math.round(Number(targetAmount) || 0))
  const current = Math.max(0, Math.round(Number(currentAmount) || 0))

  if (target <= 0 || current >= target) {
    return 0
  }

  const remainingAmount = target - current

  if (!targetDateInput) {
    return 0
  }

  const remainingMonths = calculateRemainingMonths(targetDateInput, referenceDateInput)

  if (remainingMonths >= 1) {
    return Math.ceil(remainingAmount / remainingMonths)
  }

  // If 0 remaining whole months (deadline is within current month or overdue)
  return remainingAmount
}

// ── Requirement 7.3 & Property 21: Goal Health Evaluation ────────────────────

/**
 * Evaluates financial goal health status deterministically into strictly one of
 * 'Aman', 'Perlu dipercepat', or 'Terlambat'.
 *
 * Formal Guarantee (Property 21):
 * - 'Terlambat': current date is strictly past targetDate and currentAmount < targetAmount.
 * - 'Aman':
 *    - Goal already reached (currentAmount >= targetAmount).
 *    - No targetDate set (open-ended goal).
 *    - Current pace of savings meets or exceeds required monthly contribution.
 *    - New goal created in the current month with future remaining months.
 * - 'Perlu dipercepat':
 *    - Goal is not past deadline, but current pace of savings falls behind
 *      required monthly contribution, requiring an accelerated savings rate.
 *    - Goal has 0 savings and is due within the current month.
 */
export function evaluateGoalHealth(
  targetAmountOrGoal: number | Goal | GoalEnhanced,
  currentAmountInput?: number,
  targetDateInput?: Date | string | number | null,
  referenceDateInput: Date | string | number = new Date(),
  options?: Date | string | number | GoalHealthOptions
): GoalHealthStatus {
  let targetAmount: number
  let currentAmount: number
  let targetDate: Date | string | number | null | undefined
  let createdAt: Date | string | number | undefined
  let customPace: number | undefined

  if (typeof targetAmountOrGoal === 'object' && targetAmountOrGoal !== null) {
    const g = targetAmountOrGoal
    targetAmount = Number(g.targetAmount ?? g.target) || 0
    currentAmount = Number(g.currentAmount ?? g.saved) || 0
    targetDate = g.targetDate || g.deadline
    createdAt = g.createdAt
  } else {
    targetAmount = Number(targetAmountOrGoal) || 0
    currentAmount = Number(currentAmountInput) || 0
    targetDate = targetDateInput
    if (typeof options === 'string' || typeof options === 'number' || options instanceof Date) {
      createdAt = options
    } else if (typeof options === 'object' && options !== null) {
      createdAt = options.createdAt
      customPace = options.currentPace
    }
  }

  const target = Math.max(0, Math.round(targetAmount))
  const saved = Math.max(0, Math.round(currentAmount))

  // 1. Goal already reached or invalid target -> 'Aman'
  if (target <= 0 || saved >= target) {
    return 'Aman'
  }

  // 2. Open-ended goal without deadline -> 'Aman'
  if (!targetDate) {
    return 'Aman'
  }

  const ref = toMidnightDate(referenceDateInput)
  const targetMidnight = toMidnightDate(targetDate)

  // 3. Past deadline: current date is strictly past targetDate -> 'Terlambat'
  if (targetMidnight.getTime() < ref.getTime()) {
    return 'Terlambat'
  }

  // 4. Target date is today or in the future
  const remainingMonths = calculateRemainingMonths(targetMidnight, ref)
  const requiredMonthlyContribution = calculateMonthlyContribution(target, saved, targetMidnight, ref)

  // Determine current pace (average monthly savings achieved)
  let pace: number

  if (customPace !== undefined && Number.isFinite(customPace)) {
    pace = customPace
  } else if (createdAt) {
    const elapsedMonths = calculateMonthsBetween(createdAt, ref)
    if (elapsedMonths <= 0) {
      // Goal was created in the current month or today
      if (remainingMonths > 0) return 'Aman'
      return saved >= target ? 'Aman' : 'Perlu dipercepat'
    }
    pace = saved / elapsedMonths
  } else {
    // If no createdAt or customPace is supplied:
    if (saved === 0) {
      return remainingMonths > 0 ? 'Aman' : 'Perlu dipercepat'
    }
    // Baseline: assume 1 month of saving history if no start date is provided
    pace = saved
  }

  // Compare pace against required contribution
  return pace >= requiredMonthlyContribution ? 'Aman' : 'Perlu dipercepat'
}

// ── Goal Enhancement & Helpers ────────────────────────────────────────────────

/**
 * Enhances a raw Goal into a complete GoalEnhanced record with computed
 * monthlyContributionRequired and healthStatus.
 */
export function enhanceGoal(
  goal: Goal | GoalEnhanced,
  referenceDate: Date | string | number = new Date()
): GoalEnhanced {
  const targetAmount = Math.max(0, Math.round(Number(goal.targetAmount ?? goal.target) || 0))
  const currentAmount = Math.max(0, Math.round(Number(goal.currentAmount ?? goal.saved) || 0))
  const rawDate = goal.targetDate || goal.deadline
  const targetDate = rawDate ? toCalendarDateString(rawDate) : ''
  const name = (goal.name || goal.label || 'Target').trim()
  const createdAt = goal.createdAt || new Date().toISOString()
  const updatedAt = goal.updatedAt || createdAt
  const note = goal.note

  const monthlyContributionRequired = calculateMonthlyContribution(
    targetAmount,
    currentAmount,
    targetDate || undefined,
    referenceDate
  )

  const healthStatus = evaluateGoalHealth(
    targetAmount,
    currentAmount,
    targetDate || undefined,
    referenceDate,
    { createdAt }
  )

  return {
    id: goal.id,
    name,
    label: name,
    targetAmount,
    target: targetAmount,
    currentAmount,
    saved: currentAmount,
    targetDate,
    deadline: targetDate,
    note,
    monthlyContributionRequired,
    healthStatus,
    createdAt,
    updatedAt,
  }
}

/**
 * Factory function to create a new GoalEnhanced object.
 */
export function createGoal(
  input: CreateGoalInput,
  referenceDate: Date | string | number = new Date()
): GoalEnhanced {
  const targetAmount = Math.max(0, Math.round(Number(input.targetAmount ?? input.target) || 0))
  const currentAmount = Math.max(0, Math.round(Number(input.currentAmount ?? input.saved) || 0))
  const rawDate = input.targetDate || input.deadline
  const targetDate = rawDate ? toCalendarDateString(rawDate) : ''
  const name = (input.name || input.label || 'Target').trim()
  const createdAt = input.createdAt
    ? typeof input.createdAt === 'string'
      ? input.createdAt
      : input.createdAt.toISOString()
    : new Date().toISOString()

  const monthlyContributionRequired = calculateMonthlyContribution(
    targetAmount,
    currentAmount,
    targetDate || undefined,
    referenceDate
  )

  const healthStatus = evaluateGoalHealth(
    targetAmount,
    currentAmount,
    targetDate || undefined,
    referenceDate,
    { createdAt }
  )

  return {
    id: generateGoalId(),
    name,
    label: name,
    targetAmount,
    target: targetAmount,
    currentAmount,
    saved: currentAmount,
    targetDate,
    deadline: targetDate,
    note: input.note?.trim() || undefined,
    monthlyContributionRequired,
    healthStatus,
    createdAt,
    updatedAt: createdAt,
  }
}

/**
 * Formats goal health status with color tokens, Indonesian text, and badges.
 */
export function formatGoalHealth(status: GoalHealthStatus): GoalHealthFormat {
  switch (status) {
    case 'Aman':
      return {
        status: 'Aman',
        label: 'Aman (Tepat Waktu)',
        badgeText: 'Aman',
        color: 'var(--sk-green)',
        bgClass: 'bg-[var(--sk-green-dim)]',
        textClass: 'text-[var(--sk-green)]',
        borderClass: 'border-[var(--sk-green)]',
      }
    case 'Perlu dipercepat':
      return {
        status: 'Perlu dipercepat',
        label: 'Perlu Dipercepat',
        badgeText: 'Perlu Dipercepat',
        color: 'var(--sk-amber)',
        bgClass: 'bg-[var(--sk-amber-dim)]',
        textClass: 'text-[var(--sk-amber)]',
        borderClass: 'border-[var(--sk-amber)]',
      }
    case 'Terlambat':
      return {
        status: 'Terlambat',
        label: 'Terlambat',
        badgeText: 'Terlambat',
        color: 'var(--sk-red)',
        bgClass: 'bg-[var(--sk-red-dim)]',
        textClass: 'text-[var(--sk-red)]',
        borderClass: 'border-[var(--sk-red)]',
      }
  }
}

/**
 * Selects the primary goal from an array of goals (e.g. for widgets or summary display).
 */
export function getPrimaryGoal(
  goals: Array<Goal | GoalEnhanced>,
  referenceDate: Date | string | number = new Date()
): GoalEnhanced | null {
  if (!Array.isArray(goals) || goals.length === 0) return null

  // 1. Find active uncompleted goal with target > 0
  const activeUncompleted = goals
    .map((g) => enhanceGoal(g, referenceDate))
    .filter((g) => g.targetAmount > 0 && g.currentAmount < g.targetAmount)

  if (activeUncompleted.length > 0) {
    return activeUncompleted[0]
  }

  // 2. Fallback to first goal
  return enhanceGoal(goals[0], referenceDate)
}

// ── Persistence Helpers ───────────────────────────────────────────────────────

function isGoalRecord(value: unknown): value is Goal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Goal).id === 'string' &&
    (typeof (value as Goal).label === 'string' || typeof (value as Goal).name === 'string') &&
    (typeof (value as Goal).target === 'number' || typeof (value as Goal).targetAmount === 'number') &&
    (typeof (value as Goal).saved === 'number' || typeof (value as Goal).currentAmount === 'number')
  )
}

/**
 * Loads goals from local storage and returns enhanced goal records.
 */
export function loadGoalsFromStorage(referenceDate?: Date | string | number): GoalEnhanced[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isGoalRecord).map((g) => enhanceGoal(g, referenceDate))
  } catch {
    return []
  }
}

/**
 * Saves goals to local storage.
 */
export function saveGoalsToStorage(goals: Array<Goal | GoalEnhanced>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goals))
    window.dispatchEvent(new CustomEvent('sakukilat:goals-changed'))
  } catch {
    /* quota exceeded or storage locked */
  }
}
// ── Requirement 7.4 & Property 22: Goal Allocation & Ledger Invariance ────────

export interface GoalAllocationOptions {
  fromWalletId?: string
  toWalletId?: string
  date?: Date | string | number
  referenceDate?: Date | string | number
  note?: string
}

export interface GoalAllocationResult {
  updatedGoal: GoalEnhanced
  savingTransaction?: {
    id: string
    kind: 'saving'
    description: string
    amount: number
    type: 'expense'
    category: string
    paymentMethod: string
    fromWalletId: string
    toWalletId: string
    date: Date
  }
}

/**
 * Requirement 7.4 & Property 22:
 * Allocates funds toward a financial goal.
 * - The target goal's accumulated amount increases by the allocated amount.
 * - If `fromWalletId` is specified, an internal savings transfer transaction
 *   (kind: 'saving') is generated to record the wallet balance movement.
 * - If `fromWalletId` is omitted or empty ("Catat saja"), only the goal's
 *   accumulated amount is updated, with no transaction generated.
 *
 * In BOTH cases, general income and expense ledger totals remain strictly invariant,
 * preventing duplicate income/expense counting in general reports and budgets.
 */
export function allocateGoalDeposit(
  goal: Goal | GoalEnhanced,
  amount: number,
  options?: GoalAllocationOptions
): GoalAllocationResult | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }
  const validAmount = Math.round(amount)
  const currentSaved = Number(goal.currentAmount ?? goal.saved) || 0
  const newSaved = currentSaved + validAmount
  const refDate = options?.referenceDate ?? new Date()

  const updatedGoal = enhanceGoal(
    {
      ...goal,
      saved: newSaved,
      currentAmount: newSaved,
      updatedAt: new Date().toISOString(),
    },
    refDate
  )

  if (!options?.fromWalletId) {
    return { updatedGoal }
  }

  const txDate = options.date ? toMidnightDate(options.date) : new Date()
  const toWallet = options.toWalletId || 'tabungan'
  const goalName = (goal.name || goal.label || 'Goal').trim()
  const note = options.note || `Tabungan: ${goalName}`

  const savingTransaction = {
    id: `tx_save_${generateGoalId()}`,
    kind: 'saving' as const,
    description: note,
    amount: validAmount,
    type: 'expense' as const,
    category: 'transfer',
    paymentMethod: options.fromWalletId,
    fromWalletId: options.fromWalletId,
    toWalletId: toWallet,
    date: txDate,
  }

  return {
    updatedGoal,
    savingTransaction,
  }
}
