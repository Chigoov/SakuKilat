// SakuKilat - Recurring Transactions Module

import type { Transaction } from '@/types';
import { generateId } from './seed';

const RECURRING_KEY = 'sakukilat:v2:recurring';
const LAST_ROLLOVER_KEY = 'sakukilat:v2:last-rollover';

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurringTransaction {
  id: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  paymentMethod: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  startDate: string; // ISO
  lastTriggered?: string; // ISO date
  active: boolean;
}

export function loadRecurring(): RecurringTransaction[] {
  try {
    const raw = localStorage.getItem(RECURRING_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveRecurring(items: RecurringTransaction[]): void {
  try { localStorage.setItem(RECURRING_KEY, JSON.stringify(items)); } catch {}
}

export function addRecurring(data: Omit<RecurringTransaction, 'id' | 'active'>): RecurringTransaction {
  const item: RecurringTransaction = {
    ...data,
    id: 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    active: true,
  };
  const items = loadRecurring();
  items.push(item);
  saveRecurring(items);
  return item;
}

export function removeRecurring(id: string): void {
  const items = loadRecurring().filter((i) => i.id !== id);
  saveRecurring(items);
}

export function toggleRecurring(id: string): void {
  const items = loadRecurring().map((i) => i.id === id ? { ...i, active: !i.active } : i);
  saveRecurring(items);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shouldTriggerToday(item: RecurringTransaction, today: Date): boolean {
  if (!item.active) return false;
  if (item.lastTriggered && dayKey(new Date(item.lastTriggered)) === dayKey(today)) return false;

  const start = new Date(item.startDate);
  if (today < start) return false;

  if (item.frequency === 'daily') return true;
  if (item.frequency === 'weekly') return today.getDay() === (item.dayOfWeek ?? 1);
  if (item.frequency === 'monthly') return today.getDate() === (item.dayOfMonth ?? 1);
  return false;
}

export function checkRecurringTransactions(today = new Date): Transaction[] {
  const items = loadRecurring();
  const triggered: Transaction[] = [];

  for (const item of items) {
    if (shouldTriggerToday(item, today)) {
      const tx: Transaction = {
        id: generateId(),
        kind: 'transaction',
        description: item.description,
        amount: item.amount,
        type: item.type,
        category: item.category,
        paymentMethod: item.paymentMethod,
        date: new Date(today),
      };
      triggered.push(tx);
      item.lastTriggered = today.toISOString();
    }
  }

  if (triggered.length > 0) saveRecurring(items);
  return triggered;
}

export function getPendingRecurring(today = new Date): RecurringTransaction[] {
  return loadRecurring().filter((item) => shouldTriggerToday(item, today));
}
