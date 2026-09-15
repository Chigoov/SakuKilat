/**
 * SakuKilat — Unit & Invariant Tests for Task 10.1:
 * BillManager Core Logic, Recurrence Calculation, and Storage State Slice
 *
 * Requirements:
 * - 5.1: Store bill name, nominal amount, category, recurrence frequency, due date, payment method, active status
 * - 5.2: Compute next due date based on recurrence frequency and calendar date
 * - 5.3: Display upcoming bills grouped by urgency: due today, due within five days, and due later in current month
 * - Property 13: Next due date calculation is strictly greater than reference date
 * - Property 14: Upcoming bills urgency partitioning is disjoint
 */

import assert from 'node:assert/strict'
import {
  createBill,
  generateBillId,
  computeNextDueDate,
  advanceBillDueDate,
  getBillUrgency,
  groupBillsByUrgency,
  getNearestBill,
  formatBillDueDate,
  calendarDaysBetween,
  getDaysInMonth,
} from '../lib/bills.ts'
import {
  validatePersistedStateStructure,
  CURRENT_SCHEMA_VERSION,
} from '../lib/storage.ts'

console.log('====================================================')
console.log('  SAKUKILAT — UNIT TESTS: BILL MANAGER (TASK 10.1)  ')
console.log('====================================================\n')

// ── Group 1: Bill Schema Definition and createBill (Req 5.1) ─────────────────
console.log('▶ Test Group 1: Bill Schema Definition & Factory (Req 5.1)...')
{
  const bill = createBill({
    name: 'WiFi Indihome',
    amount: 385000,
    categoryId: 'tagihan',
    paymentMethodId: 'bca',
    recurrence: 'monthly',
    dueDay: 15,
    note: 'Langganan internet rumah',
  })

  assert(bill.id.startsWith('bill-'), 'Bill id must start with bill-')
  assert.equal(bill.name, 'WiFi Indihome', 'Bill name should match')
  assert.equal(bill.amount, 385000, 'Bill amount should match')
  assert.equal(bill.categoryId, 'tagihan', 'Category should match')
  assert.equal(bill.paymentMethodId, 'bca', 'Payment method should match')
  assert.equal(bill.recurrence, 'monthly', 'Recurrence should match')
  assert.equal(bill.dueDay, 15, 'dueDay should match')
  assert.equal(bill.isActive, true, 'Default isActive should be true')
  assert.equal(bill.note, 'Langganan internet rumah', 'Note should match')
  assert(typeof bill.nextDueDate === 'string', 'nextDueDate must be a string')
  assert(/^\d{4}-\d{2}-\d{2}$/.test(bill.nextDueDate), 'nextDueDate must format as YYYY-MM-DD')

  // Negative amount sanitized to 0
  const zeroBill = createBill({
    name: 'Gratis',
    amount: -5000,
    categoryId: 'lainnya',
    paymentMethodId: 'tunai',
    recurrence: 'weekly',
    dueDay: 1,
  })
  assert.equal(zeroBill.amount, 0, 'Negative amounts must clamp to 0')
  console.log('  ✓ Group 1: Bill schema fields & createBill factory verified')
}

// ── Group 2: computeNextDueDate Recurrence Calculations (Req 5.2 & Prop 13) ───
console.log('\n▶ Test Group 2: computeNextDueDate Recurrence Calculations (Req 5.2 / Prop 13)...')
{
  // 2a. Monthly recurrence when dueDay has not passed yet this month
  // Today is May 10, 2026. dueDay is 20 -> next due date should be 2026-05-20
  const refMay10 = '2026-05-10'
  const nextMay20 = computeNextDueDate('monthly', 20, refMay10)
  assert.equal(nextMay20, '2026-05-20', 'Monthly due date before current day must stay in current month')
  assert(nextMay20 > refMay10, 'nextDueDate must be strictly greater than reference date')

  // 2b. Monthly recurrence when dueDay is today
  // Today is May 20, 2026. dueDay is 20 -> next occurrence must advance to June 20, 2026
  const refMay20 = '2026-05-20'
  const nextJun20 = computeNextDueDate('monthly', 20, refMay20)
  assert.equal(nextJun20, '2026-06-20', 'Monthly due date on same day must advance to next month')
  assert(nextJun20 > refMay20, 'nextDueDate must be strictly greater than reference date')

  // 2c. Monthly recurrence when dueDay has already passed this month
  // Today is May 25, 2026. dueDay is 15 -> next occurrence must be June 15, 2026
  const refMay25 = '2026-05-25'
  const nextJun15 = computeNextDueDate('monthly', 15, refMay25)
  assert.equal(nextJun15, '2026-06-15', 'Monthly due date after current day must advance to next month')
  assert(nextJun15 > refMay25, 'nextDueDate must be strictly greater than reference date')

  // 2d. Monthly recurrence over year boundary
  // Today is Dec 28, 2026. dueDay is 5 -> next occurrence must be Jan 5, 2027
  const refDec28 = '2026-12-28'
  const nextJan5 = computeNextDueDate('monthly', 5, refDec28)
  assert.equal(nextJan5, '2027-01-05', 'Monthly due date across year end must advance to next year')
  assert(nextJan5 > refDec28, 'nextDueDate must be strictly greater than reference date')

  // 2e. Monthly recurrence with end-of-month clamping (31st in 30-day month)
  // Today is May 31, 2026. dueDay is 31. Next month is June (30 days) -> 2026-06-30
  const refMay31 = '2026-05-31'
  const nextJun30 = computeNextDueDate('monthly', 31, refMay31)
  assert.equal(nextJun30, '2026-06-30', 'dueDay 31 in 30-day month must clamp to 30th')
  assert(nextJun30 > refMay31, 'nextDueDate must be strictly greater than reference date')

  // 2f. Monthly recurrence with February non-leap year clamping (2026)
  // Today is Jan 31, 2026. dueDay is 31. Next month is Feb (28 days) -> 2026-02-28
  const refJan31 = '2026-01-31'
  const nextFeb28 = computeNextDueDate('monthly', 31, refJan31)
  assert.equal(nextFeb28, '2026-02-28', 'dueDay 31 in Feb 2026 must clamp to 28th')
  assert(nextFeb28 > refJan31, 'nextDueDate must be strictly greater than reference date')

  // 2g. Monthly recurrence with February leap year clamping (2028)
  // Today is Jan 31, 2028. dueDay is 31. Next month is Feb leap (29 days) -> 2028-02-29
  const refJan31Leap = '2028-01-31'
  const nextFeb29 = computeNextDueDate('monthly', 31, refJan31Leap)
  assert.equal(nextFeb29, '2028-02-29', 'dueDay 31 in Feb 2028 leap must clamp to 29th')
  assert(nextFeb29 > refJan31Leap, 'nextDueDate must be strictly greater than reference date')

  // 2h. Weekly recurrence
  // Let ref be Wednesday, May 13, 2026 (ISO day = 3)
  const refWed = new Date(2026, 4, 13) // 13 May 2026
  assert.equal(refWed.getDay(), 3, '13 May 2026 is Wednesday')

  // Target Friday (ISO day = 5) -> should be 15 May 2026
  const nextFri = computeNextDueDate('weekly', 5, refWed)
  assert.equal(nextFri, '2026-05-15', 'Weekly target Friday from Wednesday should be May 15')
  assert(nextFri > '2026-05-13', 'Weekly next date must be > ref')

  // Target Wednesday (same day, ISO day = 3) -> should advance by 7 days to 20 May 2026
  const nextWed = computeNextDueDate('weekly', 3, refWed)
  assert.equal(nextWed, '2026-05-20', 'Weekly target same day must advance 7 days')
  assert(nextWed > '2026-05-13', 'Weekly next date must be > ref')

  // Target Monday (earlier in week, ISO day = 1) -> should be next Monday, 18 May 2026
  const nextMon = computeNextDueDate('weekly', 1, refWed)
  assert.equal(nextMon, '2026-05-18', 'Weekly target Monday from Wednesday should be next Monday')
  assert(nextMon > '2026-05-13', 'Weekly next date must be > ref')

  // Target Sunday with dueDay = 0 (Sunday in JS) -> maps to Sunday, 17 May 2026
  const nextSun = computeNextDueDate('weekly', 0, refWed)
  assert.equal(nextSun, '2026-05-17', 'Weekly target Sunday (0) should be 17 May 2026')
  assert(nextSun > '2026-05-13', 'Weekly next date must be > ref')

  // 2i. Annually recurrence
  // Today is May 10, 2026. Annual bill due Aug 15 -> should be 2026-08-15
  const nextAnnualFuture = computeNextDueDate('annually', 15, '2026-05-10', { dueMonth: 8 })
  assert.equal(nextAnnualFuture, '2026-08-15', 'Annual bill in future this year stays in current year')

  // Today is Sep 10, 2026. Annual bill due Aug 15 -> should advance to 2027-08-15
  const nextAnnualPast = computeNextDueDate('annually', 15, '2026-09-10', { dueMonth: 8 })
  assert.equal(nextAnnualPast, '2027-08-15', 'Annual bill whose date passed advances to next year')

  // Today is Aug 15, 2026. Annual bill due Aug 15 -> should advance to 2027-08-15
  const nextAnnualToday = computeNextDueDate('annually', 15, '2026-08-15', { dueMonth: 8 })
  assert.equal(nextAnnualToday, '2027-08-15', 'Annual bill due today advances to next year')

  console.log('  ✓ Group 2: All computeNextDueDate recurrence calculations verified (Prop 13)')
}

// ── Group 3: Urgency Grouping & Partitioning (Req 5.3 & Prop 14) ─────────────
console.log('\n▶ Test Group 3: Urgency Grouping & Partitioning (Req 5.3 / Prop 14)...')
{
  const refDate = '2026-05-10'

  const sampleBills = [
    // Overdue (diffDays = -2)
    createBill({ name: 'Overdue Bill', amount: 50000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 8, nextDueDate: '2026-05-08' }),
    // Due Today (diffDays = 0)
    createBill({ name: 'Due Today Bill', amount: 100000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 10, nextDueDate: '2026-05-10' }),
    // Due Soon (diffDays = 1, tomorrow)
    createBill({ name: 'Due Tomorrow', amount: 75000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 11, nextDueDate: '2026-05-11' }),
    // Due Soon (diffDays = 5)
    createBill({ name: 'Due in 5 Days', amount: 120000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 15, nextDueDate: '2026-05-15' }),
    // Due Later in month (diffDays = 12, in May)
    createBill({ name: 'Due in 12 Days', amount: 200000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 22, nextDueDate: '2026-05-22' }),
    // Future (next month: June 5, 2026)
    createBill({ name: 'Future Month Bill', amount: 300000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 5, nextDueDate: '2026-06-05' }),
    // Inactive Bill
    createBill({ name: 'Inactive Bill', amount: 45000, categoryId: 'tagihan', paymentMethodId: 'bca', recurrence: 'monthly', dueDay: 10, nextDueDate: '2026-05-10', isActive: false }),
  ]

  const grouped = groupBillsByUrgency(sampleBills, refDate)

  assert.equal(grouped.overdue.length, 1, 'Exactly 1 overdue bill')
  assert.equal(grouped.overdue[0].name, 'Overdue Bill')

  assert.equal(grouped.dueToday.length, 1, 'Exactly 1 bill due today')
  assert.equal(grouped.dueToday[0].name, 'Due Today Bill')

  assert.equal(grouped.dueSoon.length, 2, 'Exactly 2 bills due soon (1 to 5 days)')
  assert.deepEqual(grouped.dueSoon.map(b => b.name), ['Due Tomorrow', 'Due in 5 Days'])

  assert.equal(grouped.dueLater.length, 1, 'Exactly 1 bill due later in current month (> 5 days in May)')
  assert.equal(grouped.dueLater[0].name, 'Due in 12 Days')

  assert.equal(grouped.future.length, 1, 'Exactly 1 bill due in subsequent month')
  assert.equal(grouped.future[0].name, 'Future Month Bill')

  assert.equal(grouped.inactive.length, 1, 'Exactly 1 inactive bill')
  assert.equal(grouped.inactive[0].name, 'Inactive Bill')

  // Verify DISJOINTNESS of upcoming groups (dueToday, dueSoon, dueLater)
  const todayIds = new Set(grouped.dueToday.map(b => b.id))
  const soonIds = new Set(grouped.dueSoon.map(b => b.id))
  const laterIds = new Set(grouped.dueLater.map(b => b.id))

  for (const id of todayIds) {
    assert(!soonIds.has(id), 'dueToday and dueSoon must be disjoint')
    assert(!laterIds.has(id), 'dueToday and dueLater must be disjoint')
  }
  for (const id of soonIds) {
    assert(!laterIds.has(id), 'dueSoon and dueLater must be disjoint')
  }

  console.log('  ✓ Group 3: Urgency grouping partitions disjointly and handles edge cases (Prop 14)')
}

// ── Group 4: Nearest Bill for Widget Snapshot (Req 5.7 & Prop 16) ─────────────
console.log('\n▶ Test Group 4: Nearest Bill Projection (Req 5.7 / Prop 16)...')
{
  const refDate = '2026-05-10'

  const bills = [
    createBill({ name: 'Old Overdue', amount: 50000, recurrence: 'monthly', dueDay: 1, nextDueDate: '2026-05-01' }),
    createBill({ name: 'Bill Due May 15', amount: 150000, recurrence: 'monthly', dueDay: 15, nextDueDate: '2026-05-15' }),
    createBill({ name: 'Bill Due May 12', amount: 200000, recurrence: 'monthly', dueDay: 12, nextDueDate: '2026-05-12' }),
    createBill({ name: 'Inactive Nearest', amount: 30000, recurrence: 'monthly', dueDay: 11, nextDueDate: '2026-05-11', isActive: false }),
  ]

  const nearest = getNearestBill(bills, refDate)
  assert(nearest !== null, 'Nearest bill must not be null')
  assert.equal(nearest.name, 'Bill Due May 12', 'Nearest bill must be minimum nextDueDate >= refDate among active bills')

  // When all bills are overdue
  const allOverdue = [
    createBill({ name: 'Old 1', amount: 10000, recurrence: 'monthly', dueDay: 1, nextDueDate: '2026-05-01' }),
  ]
  assert.equal(getNearestBill(allOverdue, refDate), null, 'Must return null when no bills >= today')

  // When all bills are inactive
  const allInactive = [
    createBill({ name: 'Inactive Future', amount: 10000, recurrence: 'monthly', dueDay: 15, nextDueDate: '2026-05-15', isActive: false }),
  ]
  assert.equal(getNearestBill(allInactive, refDate), null, 'Must return null when all upcoming bills are inactive')

  console.log('  ✓ Group 4: Nearest bill projection verified (Prop 16)')
}

// ── Group 5: formatBillDueDate and advanceBillDueDate ─────────────────────────
console.log('\n▶ Test Group 5: Friendly Formatting & Advance Due Date...')
{
  const refDate = '2026-05-10'

  assert.equal(formatBillDueDate('2026-05-10', refDate), 'Hari ini')
  assert.equal(formatBillDueDate('2026-05-11', refDate), 'Besok')
  assert.equal(formatBillDueDate('2026-05-13', refDate), '3 hari lagi')
  assert.equal(formatBillDueDate('2026-05-08', refDate), '2 hari lewat')
  assert.equal(formatBillDueDate('2026-05-25', refDate), '25 Mei')
  assert.equal(formatBillDueDate('2027-01-15', refDate), '15 Jan 2027')

  // Advance bill due date
  const bill = createBill({
    name: 'Netflix',
    amount: 186000,
    recurrence: 'monthly',
    dueDay: 15,
    nextDueDate: '2026-05-15',
  })

  const advanced = advanceBillDueDate(bill)
  assert.equal(advanced, '2026-06-15', 'Monthly bill should advance from May 15 to June 15')

  console.log('  ✓ Group 5: formatBillDueDate and advanceBillDueDate verified')
}

// ── Group 6: Storage Schema Validation & Compatibility ────────────────────────
console.log('\n▶ Test Group 6: Storage Schema Validation & Compatibility...')
{
  // Valid state with bills array
  const validStateWithBills = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
    wallets: [],
    bills: [
      { id: 'b-1', name: 'PLN', amount: 200000, recurrence: 'monthly', dueDay: 20, nextDueDate: '2026-05-20', isActive: true },
    ],
  }
  const check1 = validatePersistedStateStructure(validStateWithBills)
  assert.equal(check1.valid, true, 'Valid state with bills array must pass validation')

  // Invalid state: bills is not an array
  const corruptStateBadBills = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
    bills: 'corrupt-string-instead-of-array',
  }
  const check2 = validatePersistedStateStructure(corruptStateBadBills)
  assert.equal(check2.valid, false, 'State with non-array bills must be rejected')
  assert.equal(check2.error, 'Field "bills" must be an array')

  console.log('  ✓ Group 6: Storage validation for bills slice verified')
}

console.log('\n====================================================')
console.log('  ALL TASK 10.1 BILL MANAGER TESTS PASSED! ✅       ')
console.log('====================================================\n')
