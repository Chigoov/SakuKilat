// SakuKilat - Demo Mode Module

import type { Transaction, Wallet } from '@/types';
import { createSeedWallets, createDemoTransactions } from './seed';
import { CURRENT_SCHEMA_VERSION } from './migration';

const DEMO_ACTIVE_KEY = 'sakukilat:v2:demo-active';
const DEMO_BACKUP_KEY = 'sakukilat:v2:demo-backup';
const DEMO_LINK_KEY = 'sakukilat:v2:demo-link-applied';
const STORAGE_KEY = 'sakukilat:v2:local-state';

export function isDemoActive(): boolean {
  try { return '1' === localStorage.getItem(DEMO_ACTIVE_KEY); } catch { return false; }
}

export function isDemoLinkApplied(): boolean {
  try { return '1' === sessionStorage.getItem(DEMO_LINK_KEY); } catch { return false; }
}

export function activateDemo(): void {
  // Backup current data
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(DEMO_BACKUP_KEY, current);
  } catch {}

  const wallets: Wallet[] = createSeedWallets();
  const transactions: Transaction[] = createDemoTransactions();

  const demoState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: transactions.map((t) => ({ ...t, date: t.date.toISOString() })),
    wallets,
    monthlyBudget: 3000000,
    customPayments: [{ id: 'seabank', label: 'SeaBank', keywords: ['seabank', 'sea'] }],
    customCategories: [{ id: 'expense-peliharaan', label: 'Peliharaan', keywords: ['kucing', 'anjing', 'catfood', 'vet', 'grooming'], type: 'expense' as const }],
    hiddenPaymentIds: [],
    zenMode: false,
    themeMode: 'dark' as const,
    profileName: 'Pengguna Demo',
    profileAvatarUrl: null,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoState));
    localStorage.setItem(DEMO_ACTIVE_KEY, '1');
    sessionStorage.setItem(DEMO_LINK_KEY, '1');
  } catch {}
}

export function deactivateDemo(): void {
  try {
    const backup = localStorage.getItem(DEMO_BACKUP_KEY);
    if (backup) {
      localStorage.setItem(STORAGE_KEY, backup);
      localStorage.removeItem(DEMO_BACKUP_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    localStorage.removeItem(DEMO_ACTIVE_KEY);
    sessionStorage.removeItem(DEMO_LINK_KEY);
  } catch {}
}

export function checkDemoUrlParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    if (!isDemoLinkApplied() || !isDemoActive()) {
      activateDemo();
      return true;
    }
  } else {
    try { sessionStorage.removeItem(DEMO_LINK_KEY); } catch {}
  }
  return false;
}
