import type { Transaction } from './mock-data'

interface MonthlyBreakdownRow {
  monthIndex: number
  label: string
  income: number
  expense: number
  balance: number
}

export type { TrendPoint } from './stats'
export type { MonthlyBreakdownRow }

function isMoneyMove(transaction: Transaction): boolean {
  return transaction.kind === 'transfer' || transaction.kind === 'saving'
}

export function monthlyBreakdownForYear(
  transactions: Transaction[],
  year: number,
): MonthlyBreakdownRow[] {
  const formatter = new Intl.DateTimeFormat('id-ID', { month: 'short' })
  const rows: MonthlyBreakdownRow[] = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    label: formatter.format(new Date(year, monthIndex, 1)),
    income: 0,
    expense: 0,
    balance: 0,
  }))

  for (const transaction of transactions) {
    if (isMoneyMove(transaction) || transaction.date.getFullYear() !== year) continue
    const row = rows[transaction.date.getMonth()]
    if (transaction.type === 'income') row.income += transaction.amount
    else row.expense += transaction.amount
  }

  for (const row of rows) row.balance = row.income - row.expense
  return rows
}
