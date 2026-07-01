// SakuKilat - Schema Migration

import type { AppState, Transaction, CustomCategory } from '@/types';
import { BUILTIN_WALLET_DEFAULT_BALANCES } from './seed';
import { getBuiltinCategoryType } from './categories';

export const CURRENT_SCHEMA_VERSION = 6;

export function deserializeTransactions(raw: unknown): Transaction[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((t: any) => ({ ...t, date: new Date(t.date) }))
    .filter((t: Transaction) => Number.isFinite(t.date.getTime()));
}

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `c-${Date.now()}`;
}

function inferCategoryType(cat: CustomCategory): 'income' | 'expense' {
  if (cat.type === 'income' || cat.type === 'expense') return cat.type;
  return getBuiltinCategoryType(cat.id);
}

function makeDualTypeId(label: string, type: string): string {
  const slug = slugify(label);
  return getBuiltinCategoryType(slug) === type ? slug : `${type}-${slug}`;
}

export function migrateState(state: any): AppState {
  let version = state.schemaVersion ?? 1;
  let result = { ...state };

  // v4: Remove seed/demo transactions, reset default wallet balances
  if (version < 4) {
    if (Array.isArray(result.transactions)) {
      result.transactions = result.transactions.filter((t: Transaction) => {
        const id = t.id;
        return !(typeof id === 'string' && (/^txn-0\d{2}$/.test(id) || id.startsWith('seed-')));
      });
    }
    if (Array.isArray(result.wallets) && result.wallets.length > 0 &&
        result.wallets.every((w: any) => {
          const def = BUILTIN_WALLET_DEFAULT_BALANCES[w.id];
          return def !== undefined && w.balance === def;
        })) {
      result.wallets = result.wallets.map((w: any) => ({ ...w, balance: 0 }));
    }
    if (result.monthlyBudget === 1500000) result.monthlyBudget = 0;
  }

  // v5: Ensure custom categories have type
  if (version < 5 && Array.isArray(result.customCategories)) {
    result.customCategories = result.customCategories.map((c: CustomCategory) => ({ ...c, type: inferCategoryType(c) }));
  }

  // v6: Split dual-type categories into separate income/expense
  if (version < 6) {
    if (Array.isArray(result.customCategories) && Array.isArray(result.transactions)) {
      const cats = result.customCategories.map((c: CustomCategory) => ({ ...c, type: inferCategoryType(c) }));
      const catMap = new Map(cats.map((c: CustomCategory) => [c.id, c]));
      const usage = new Map<string, { income: number; expense: number }>();

      for (const tx of result.transactions) {
        if ((tx.kind && tx.kind !== 'transaction') || !catMap.has(tx.category)) continue;
        const u = usage.get(tx.category) ?? { income: 0, expense: 0 };
        (u as any)[tx.type]++;
        usage.set(tx.category, u);
      }

      const newCats = [...cats];
      const catIds = new Set(newCats.map((c) => c.id));
      const newTxns = result.transactions.map((t: any) => ({ ...t }));

      for (const cat of cats) {
        const u = usage.get(cat.id);
        if (!u) continue;
        if (u.income > 0 && u.expense === 0) { cat.type = 'income'; continue; }
        if (u.expense > 0 && u.income === 0) { cat.type = 'expense'; continue; }
        if (u.income === 0 || u.expense === 0) continue;

        // Split: create income copy, keep original as expense
        const incomeId = makeDualTypeId(cat.label, 'income');
        if (!catIds.has(incomeId)) {
          newCats.push({ ...cat, id: incomeId, type: 'income' });
          catIds.add(incomeId);
        }
        cat.type = 'expense';
        for (const tx of newTxns) {
          if (tx.category === cat.id && tx.type === 'income') tx.category = incomeId;
        }
      }

      result.customCategories = newCats;
      result.transactions = newTxns;
    }
  }

  return { ...result, schemaVersion: CURRENT_SCHEMA_VERSION };
}
