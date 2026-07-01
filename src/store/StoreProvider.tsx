'use client';

// SakuKilat - Store Provider (Context-based state management)
// Reconstructed from APK reverse engineering

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type {
  Transaction, Wallet, CustomCategory, CustomPayment, ParserExtras,
  AppUser, ToastState, ThemeMode, BadgeContext,
} from '@/types';
import { createSeedWallets, generateId, BUILTIN_WALLET_DEFAULT_BALANCES } from '@/lib/seed';
import { parseEntry } from '@/lib/parser';
import { getBuiltinCategoryType } from '@/lib/categories';
import { registerCustomCategories, registerCustomPayments } from '@/lib/categories';
import { CURRENT_SCHEMA_VERSION, migrateState, deserializeTransactions } from '@/lib/migration';
import { buildBadgeContext, setFlag, bumpCount, markZenUsed, BACKUP_COUNT_KEY, IMPORT_COUNT_KEY, UNDO_COUNT_KEY, EDIT_COUNT_KEY } from '@/lib/badges';

const STORAGE_KEY = 'sakukilat:v2:local-state';
const PROTECTED_KEYS = new Set([
  STORAGE_KEY, 'sakukilat:v2:goals', 'sakukilat:v2:celebrated-goals',
  'sakukilat:v2:recurring', 'sakukilat:v2:celebrated-streak',
]);
const PREFIX_KEYS = [
  'sakukilat:v2:backup-count', 'sakukilat:v2:import-count', 'sakukilat:v2:zen-used',
  'sakukilat:v2:voice-count', 'sakukilat:v2:edit-count', 'sakukilat:v2:undo-count',
  'sakukilat:v2:guide-opened', 'sakukilat:v2:photo-changed', 'sakukilat:v2:tabs-seen',
  'sakukilat:v2:rekap-days', 'sakukilat:v2:badge-unlocks', 'sakukilat:v2:badge-unlock-queue',
  'sakukilat:v2:budget-set', 'sakukilat:v2:goal-deadline', 'sakukilat:v2:tren-seen',
  'sakukilat:v2:notif-prefs', 'sakukilat:v2:onboarding-completed-v',
];

const DEFAULT_USER: AppUser = {
  name: 'Perangkat Ini',
  givenName: 'Kamu',
  email: 'local-device@sakukilat.local',
  avatarUrl: '/avatar.png',
};

const DEFAULT_CUSTOM_PAYMENTS: CustomPayment[] = [
  { id: 'seabank', label: 'SeaBank', keywords: ['seabank', 'sea'] },
];

const DEFAULT_CUSTOM_CATEGORIES: CustomCategory[] = [
  { id: 'expense-peliharaan', label: 'Peliharaan', keywords: ['kucing', 'anjing', 'catfood', 'vet', 'grooming'], type: 'expense' },
];

// --- Helpers ---
function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `c-${Date.now()}`;
}

function inferType(cat: CustomCategory): 'income' | 'expense' {
  if (cat.type === 'income' || cat.type === 'expense') return cat.type;
  return getBuiltinCategoryType(cat.id);
}

function makeDualTypeId(label: string, type: string): string {
  const slug = slugify(label);
  return getBuiltinCategoryType(slug) === type ? slug : `${type}-${slug}`;
}

function mergeKeywords(id: string, keywords: string[]): string[] {
  return Array.from(new Set([id, ...keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)]));
}

function applyWalletDeltas(wallets: Wallet[], deltas: Record<string, number>): Wallet[] {
  return Object.keys(deltas).reduce((ws: Wallet[], id) =>
    ws.some((w) => w.id === id) ? ws : [...ws, { id, label: id.charAt(0).toUpperCase() + id.slice(1), type: 'other' as const, balance: 0, keywords: [id] }], wallets
  ).map((w) => ({ ...w, balance: w.balance + (deltas[w.id] ?? 0) }));
}

function txDeltas(tx: Transaction, sign: number): Record<string, number> {
  const kind = tx.kind ?? 'transaction';
  if ((kind === 'transfer' || kind === 'saving') && tx.fromWalletId && tx.toWalletId) {
    return { [tx.fromWalletId]: -tx.amount * sign, [tx.toWalletId]: tx.amount * sign };
  }
  if (tx.type === 'expense') return { [tx.paymentMethod]: -tx.amount * sign };
  return { [tx.paymentMethod]: tx.amount * sign };
}

function wouldGoNegative(wallets: Wallet[], tx: Transaction): boolean {
  return Object.entries(txDeltas(tx, 1)).some(([id, delta]) => {
    if (delta >= 0) return false;
    const wallet = wallets.find((w) => w.id === id);
    return (wallet?.balance ?? 0) + delta < 0;
  });
}

function vibrate(ms = 35) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
}

// --- Context types ---
interface AuthStore { user: AppUser | null; authReady: boolean; updateProfile: (name: string) => void; updateProfileAvatar: (url: string | null) => void; }
interface TransactionData { transactions: Transaction[]; }
interface TransactionActions { addTransaction: (input: string) => Promise<boolean>; addManualTransaction: (data: Partial<Transaction>) => Promise<boolean>; updateTransaction: (id: string, data: Partial<Transaction>) => void; deleteTransaction: (id: string) => void; }
interface TransactionStatus { newTransactionId: string | null; isSubmitting: boolean; }
interface WalletStore { wallets: Wallet[]; totalStored: number; addWallet: (label: string, type: Wallet['type'], balance: number, keywords: string[]) => void; updateWallet: (id: string, data: Partial<Wallet>) => void; removeWallet: (id: string) => void; transferMoney: (from: string, to: string, amount: number, desc?: string, kind?: string, date?: Date) => boolean; saveMoney: (from: string, amount: number, to?: string) => boolean; }
interface BudgetStore { monthlyBudget: number; setMonthlyBudget: (amount: number) => void; }
interface CustomizationStore { customPayments: CustomPayment[]; customCategories: CustomCategory[]; hiddenPaymentIds: string[]; addCustomPayment: (label: string, keywords: string[]) => void; updateCustomPayment: (id: string, data: Partial<CustomPayment>) => void; removeCustomPayment: (id: string) => void; restoreHiddenPayment: (id: string) => void; addCustomCategory: (label: string, keywords: string[], subcategories: string[], type: 'expense' | 'income') => void; updateCustomCategory: (id: string, data: Partial<CustomCategory>) => void; removeCustomCategory: (id: string) => void; parserExtras: ParserExtras; }
interface PreferenceStore { zenMode: boolean; themeMode: ThemeMode; toggleZen: () => void; setThemeMode: (mode: ThemeMode) => void; }
interface FeedbackStore { toast: ToastState | null; showToast: (text: string, type: ToastState['type'], action?: ToastState['action'], duration?: number) => void; dismissToast: () => void; }
interface CombinedStore extends AuthStore, TransactionData, TransactionActions, TransactionStatus, WalletStore, BudgetStore, CustomizationStore, PreferenceStore, FeedbackStore {}

// --- Contexts ---
const AuthContext = createContext<AuthStore | null>(null);
const TransactionDataContext = createContext<TransactionData | null>(null);
const TransactionActionsContext = createContext<TransactionActions | null>(null);
const TransactionStatusContext = createContext<TransactionStatus | null>(null);
const WalletContext = createContext<WalletStore | null>(null);
const BudgetContext = createContext<BudgetStore | null>(null);
const CustomizationContext = createContext<CustomizationStore | null>(null);
const PreferenceContext = createContext<PreferenceStore | null>(null);
const FeedbackContext = createContext<FeedbackStore | null>(null);
const StoreContext = createContext<CombinedStore | null>(null);

function useCtx<T>(ctx: React.Context<T | null>, name: string): T {
  const value = useContext(ctx);
  if (!value) throw new Error(`${name} must be used within StoreProvider`);
  return value;
}

// --- StoreProvider ---
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initRef = useRef<Partial<{ transactions: unknown[]; wallets: Wallet[]; monthlyBudget: number; customPayments: CustomPayment[]; customCategories: CustomCategory[]; hiddenPaymentIds: string[]; zenMode: boolean; themeMode: ThemeMode; profileName: string | null; profileAvatarUrl: string | null }> | null>(null);

  if (initRef.current === null) {
    initRef.current = (() => {
      if (typeof window === 'undefined') return {};
      try {
        // Clean up old keys
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const key = window.localStorage.key(i);
          if (key?.startsWith('sakukilat:') && !PROTECTED_KEYS.has(key) && !key.startsWith('sakukilat:v2:onboarding-completed-v')) {
            if (!PREFIX_KEYS.some((p) => key.startsWith(p))) window.localStorage.removeItem(key);
          }
        }
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return migrateState(parsed);
      } catch (e) {
        console.warn('Gagal membaca auto-save SakuKilat:', e);
        return {};
      }
    })();
  }

  const initial = initRef.current;
  const isEmpty = !Array.isArray(initial.transactions) && !Array.isArray(initial.wallets) && typeof initial.monthlyBudget !== 'number';

  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [hydrated, setHydrated] = useState(() => !isEmpty);
  const [transactions, setTransactions] = useState<Transaction[]>(() => deserializeTransactions(initial.transactions as unknown[]) ?? []);
  const [wallets, setWallets] = useState<Wallet[]>(() => Array.isArray(initial.wallets) && initial.wallets.length > 0 ? initial.wallets : createSeedWallets().map((w) => ({ ...w, balance: 0 })));
  const [lastActiveWalletId, setLastActiveWalletId] = useState('tunai');
  const [newTransactionId, setNewTransactionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [monthlyBudget, setBudget] = useState<number>(() => typeof initial.monthlyBudget === 'number' ? initial.monthlyBudget : 0);
  const [customPayments, setCustomPayments] = useState<CustomPayment[]>(() => Array.isArray(initial.customPayments) ? initial.customPayments : DEFAULT_CUSTOM_PAYMENTS);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() => Array.isArray(initial.customCategories) ? initial.customCategories : DEFAULT_CUSTOM_CATEGORIES);
  const [hiddenPaymentIds, setHiddenPaymentIds] = useState<string[]>(() => Array.isArray(initial.hiddenPaymentIds) ? initial.hiddenPaymentIds : []);
  const [zenMode, setZenMode] = useState<boolean>(() => !!initial.zenMode);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => initial.themeMode ?? 'dark');
  const [profileName, setProfileName] = useState<string | null>(() => initial.profileName ?? null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => initial.profileAvatarUrl ?? null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileNameRef = useRef(profileName);
  const profileAvatarRef = useRef(profileAvatarUrl);

  useEffect(() => { profileNameRef.current = profileName; }, [profileName]);
  useEffect(() => { profileAvatarRef.current = profileAvatarUrl; }, [profileAvatarUrl]);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) { clearTimeout(toastTimer.current); toastTimer.current = null; }
    setToast(null);
  }, []);

  const showToast = useCallback((text: string, type: ToastState['type'], action?: ToastState['action'], duration?: number) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, type, action });
    toastTimer.current = setTimeout(() => { setToast(null); toastTimer.current = null; }, duration ?? (action ? 5500 : 3000));
  }, []);

  // Hydrate from preloaded-state.json
  useEffect(() => {
    if (!isEmpty) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/preloaded-state.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const migrated = migrateState(data);
        const txns = deserializeTransactions(migrated.transactions as unknown[]);
        if (txns) setTransactions(txns);
        if (Array.isArray(migrated.wallets) && migrated.wallets.length > 0) setWallets(migrated.wallets);
        if (typeof migrated.monthlyBudget === 'number') setBudget(migrated.monthlyBudget);
        if (Array.isArray(migrated.customPayments)) setCustomPayments(migrated.customPayments);
        if (Array.isArray(migrated.customCategories)) setCustomCategories(migrated.customCategories);
      } catch {} finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Theme effect
  useEffect(() => {
    const el = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = themeMode === 'system' ? (mq.matches ? 'dark' : 'light') : themeMode;
      el.dataset.theme = resolved;
      el.classList.toggle('dark', resolved === 'dark');
      el.classList.toggle('light', resolved === 'light');
      el.style.colorScheme = resolved;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode]);

  // Auto-save
  const serializedState = useMemo(() => ({
    transactions: transactions.map((t) => ({ ...t, date: t.date.toISOString() })),
    wallets, monthlyBudget, customPayments, customCategories, hiddenPaymentIds,
    zenMode, themeMode, profileName, profileAvatarUrl,
  }), [transactions, wallets, monthlyBudget, customPayments, customCategories, hiddenPaymentIds, zenMode, themeMode, profileName, profileAvatarUrl]);

  useEffect(() => {
    if (hydrated) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, ...serializedState }));
      } catch (e) {
        console.warn('Gagal menyimpan auto-save SakuKilat:', e);
        // Notify user if storage is full (QuotaExceededError)
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          showToast('Penyimpanan penuh! Backup data Anda lalu hapus transaksi lama.', 'error');
        }
      }
    }
  }, [hydrated, serializedState, showToast]);

  // Register custom categories/payments for parser
  useEffect(() => {
    registerCustomCategories(customCategories);
    registerCustomPayments([...wallets.filter((w) => !hiddenPaymentIds.includes(w.id)).map((w) => ({ id: w.id, label: w.label })), ...customPayments]);
  }, [customCategories, customPayments, hiddenPaymentIds, wallets]);

  // Set auth ready
  useEffect(() => {
    if (hydrated) {
      setUser({ ...DEFAULT_USER, name: profileName ?? DEFAULT_USER.name, givenName: profileName ? profileName.trim().split(/\s+/)[0] || 'Teman' : DEFAULT_USER.givenName, avatarUrl: profileAvatarUrl ?? DEFAULT_USER.avatarUrl });
      setAuthReady(true);
    }
  }, [hydrated, profileName, profileAvatarUrl]);

  // Parser extras
  const parserExtras = useMemo<ParserExtras>(() => ({
    payments: [...wallets.filter((w) => !hiddenPaymentIds.includes(w.id)).map((w) => ({ id: w.id, label: w.label, keywords: w.keywords })), ...customPayments.map((p) => ({ id: p.id, label: p.label, keywords: p.keywords }))],
    categories: customCategories.map((c) => ({ id: c.id, label: c.label, keywords: c.keywords, subcategories: c.subcategories, type: c.type })),
    lastActiveWalletId,
  }), [wallets, customPayments, customCategories, hiddenPaymentIds, lastActiveWalletId]);

  // --- Actions ---
  const updateProfile = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { showToast('Nama profil tidak boleh kosong.', 'error'); return; }
    setProfileName(trimmed);
    showToast('Profil diperbarui.', 'success');
  }, [showToast]);

  const updateProfileAvatar = useCallback((url: string | null) => {
    setProfileAvatarUrl(url);
    showToast(url ? 'Foto profil diperbarui.' : 'Foto profil dikembalikan ke bawaan.', 'success');
  }, [showToast]);

  const totalStored = useMemo(() => wallets.reduce((sum, w) => sum + w.balance, 0), [wallets]);

  const setMonthlyBudget = useCallback((amount: number) => {
    const had = monthlyBudget > 0;
    setBudget(Math.max(0, Math.round(amount)));
    setFlag('sakukilat:v2:budget-set');
    if (had) setFlag('sakukilat:v2:ach-budget-up');
    showToast('Budget bulanan diperbarui.', 'success');
  }, [showToast, monthlyBudget]);

  const addWallet = useCallback((label: string, type: Wallet['type'], balance: number, keywords: string[]) => {
    const id = slugify(label);
    const wallet: Wallet = { id, label: label.trim(), type, balance: Math.max(0, Math.round(balance)), keywords: mergeKeywords(id, keywords) };
    setWallets((ws) => ws.some((w) => w.id === wallet.id) ? ws : [...ws, wallet]);
    setCustomPayments((ps) => ps.some((p) => p.id === wallet.id) ? ps : [...ps, { id: wallet.id, label: wallet.label, keywords: wallet.keywords }]);
    showToast(`Saku "${wallet.label}" ditambahkan.`, 'success');
  }, [showToast]);

  const updateWallet = useCallback((id: string, data: Partial<Wallet>) => {
    const label = data.label?.trim();
    if (!label) { showToast('Nama saku tidak boleh kosong.', 'error'); return; }
    const keywords = mergeKeywords(id, data.keywords ?? []);
    setWallets((ws) => ws.map((w) => w.id === id ? { ...w, label, type: data.type ?? w.type, balance: Math.round(data.balance ?? w.balance), keywords } : w));
    setCustomPayments((ps) => {
      const entry = { id, label, keywords };
      return ps.some((p) => p.id === id) ? ps.map((p) => p.id === id ? entry : p) : [...ps, entry];
    });
    showToast(`Saku "${label}" diperbarui.`, 'success');
  }, [showToast]);

  const removeWallet = useCallback((id: string) => {
    const wallet = wallets.find((w) => w.id === id);
    if (!wallet) return;
    if (wallet.isBuiltIn || wallet.balance !== 0) { showToast('Saku bawaan atau bersaldo tidak bisa dihapus.', 'error'); return; }
    setWallets((ws) => ws.filter((w) => w.id !== id));
    showToast(`Saku "${wallet.label}" dihapus.`, 'success');
  }, [wallets, showToast]);

  const transferMoney = useCallback((from: string, to: string, amount: number, desc = 'Pindah uang', kind = 'transfer', date = new Date()): boolean => {
    const rounded = Math.round(amount);
    if (!from || !to || from === to || rounded <= 0) return false;
    const id = generateId();
    const tx: Transaction = { id, kind: kind as Transaction['kind'], description: desc, amount: rounded, type: 'expense', category: 'transfer', paymentMethod: from, fromWalletId: from, toWalletId: to, date };
    if (wouldGoNegative(wallets, tx)) return false;
    setWallets((ws) => applyWalletDeltas(ws, txDeltas(tx, 1)));
    setTransactions((txs) => [tx, ...txs]);
    setLastActiveWalletId(from);
    setNewTransactionId(id);
    vibrate();
    setTimeout(() => setNewTransactionId(null), 700);
    return true;
  }, [wallets]);

  const saveMoney = useCallback((from: string, amount: number, to = 'tabungan'): boolean => {
    return transferMoney(from, to, amount, 'Simpan uang', 'saving');
  }, [transferMoney]);

  const addTransaction = useCallback(async (input: string): Promise<boolean> => {
    const parsed = parseEntry(input, parserExtras);
    if (!parsed || parsed.amount === 0) {
      showToast('Belum paham. Coba: "makan 25k gopay" atau "pindah 100k ovo ke gopay"', 'error');
      return false;
    }
    if (parsed.warning) showToast(parsed.warning, 'error');

    if (parsed.kind === 'transfer' || parsed.kind === 'saving') {
      const ok = transferMoney(parsed.fromWalletId!, parsed.toWalletId!, parsed.amount, parsed.description, parsed.kind);
      if (ok) showToast(parsed.kind === 'saving' ? 'Uang disimpan. Pelan-pelan jadi tebal.' : 'Uang dipindahkan.', 'success');
      return ok;
    }

    setIsSubmitting(true);
    const id = generateId();
    const tx: Transaction = {
      id, kind: 'transaction', description: parsed.description, amount: parsed.amount,
      type: parsed.type!, category: parsed.category!, subcategory: parsed.subcategory,
      paymentMethod: parsed.paymentMethod!, date: parsed.date ?? new Date(),
    };

    if (tx.type === 'expense' && wouldGoNegative(wallets, tx)) {
      showToast('Saldo saku ini jadi minus. Transaksi tetap tercatat — edit jika perlu.', 'error');
    }
    setTransactions((txs) => [tx, ...txs]);
    setWallets((ws) => applyWalletDeltas(ws, txDeltas(tx, 1)));
    setLastActiveWalletId(tx.paymentMethod);
    setNewTransactionId(id);
    vibrate();
    setTimeout(() => setNewTransactionId(null), 700);
    setIsSubmitting(false);

    showToast(`${parsed.description} ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(parsed.amount)}`, 'success', {
      label: 'Urungkan',
      onClick: () => {
        setTransactions((txs) => txs.filter((t) => t.id !== id));
        setWallets((ws) => applyWalletDeltas(ws, txDeltas(tx, -1)));
        bumpCount(UNDO_COUNT_KEY);
        showToast('Transaksi diurungkan.', 'success');
      },
    }, 5500);
    return true;
  }, [parserExtras, showToast, transferMoney, wallets]);

  const addManualTransaction = useCallback(async (data: Partial<Transaction>): Promise<boolean> => {
    if (!Number.isFinite(data.amount) || (data.amount ?? 0) <= 0) { showToast('Lengkapi nominal dulu.', 'error'); return false; }
    setIsSubmitting(true);
    const id = generateId();
    const tx: Transaction = {
      id, kind: 'transaction',
      description: data.description?.trim() || (data.type === 'income' ? 'Pemasukan manual' : 'Pengeluaran manual'),
      amount: Math.round(data.amount!), type: data.type!, category: data.category!,
      subcategory: data.subcategory, paymentMethod: data.paymentMethod!, date: data.date ?? new Date(),
    };
    if (tx.type === 'expense' && wouldGoNegative(wallets, tx)) {
      showToast('Saldo saku ini jadi minus. Transaksi tetap tercatat — edit jika perlu.', 'error');
    }
    setTransactions((txs) => [tx, ...txs]);
    setWallets((ws) => applyWalletDeltas(ws, txDeltas(tx, 1)));
    setLastActiveWalletId(tx.paymentMethod);
    setNewTransactionId(id);
    vibrate();
    setTimeout(() => setNewTransactionId(null), 700);
    setIsSubmitting(false);
    return true;
  }, [wallets, showToast]);

  const deleteTransaction = useCallback((id: string) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    setWallets((ws) => applyWalletDeltas(ws, txDeltas(tx, -1)));
    setTransactions((txs) => txs.filter((t) => t.id !== id));
    vibrate(25);
    showToast('Transaksi dihapus.', 'success', {
      label: 'Urungkan',
      onClick: () => {
        setTransactions((txs) => txs.some((t) => t.id === tx.id) ? txs : [tx, ...txs]);
        setWallets((ws) => applyWalletDeltas(ws, txDeltas(tx, 1)));
        bumpCount(UNDO_COUNT_KEY);
        showToast('Transaksi dikembalikan.', 'success');
      },
    }, 5500);
  }, [transactions, showToast]);

  const updateTransaction = useCallback((id: string, data: Partial<Transaction>) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    const desc = data.description?.trim();
    const amount = Math.round(data.amount ?? 0);
    if (!desc || !Number.isFinite(amount) || amount <= 0) { showToast('Deskripsi dan nominal harus valid.', 'error'); return; }
    // Update all provided fields, not just description and amount
    const updated: Transaction = {
      ...tx,
      description: desc,
      amount,
      type: data.type ?? tx.type,
      category: data.category ?? tx.category,
      subcategory: data.subcategory ?? tx.subcategory,
      paymentMethod: data.paymentMethod ?? tx.paymentMethod,
      date: data.date ?? tx.date,
      isPending: false,
    };
    if (wouldGoNegative(applyWalletDeltas(wallets, txDeltas(tx, -1)), updated)) {
      showToast('Perubahan ini membuat saldo saku minus.', 'error');
      return;
    }
    setTransactions((txs) => txs.map((t) => t.id === id ? updated : t));
    setWallets((ws) => applyWalletDeltas(applyWalletDeltas(ws, txDeltas(tx, -1)), txDeltas(updated, 1)));
    vibrate(25);
    bumpCount(EDIT_COUNT_KEY);
    showToast('Transaksi diperbarui.', 'success');
  }, [transactions, wallets, showToast]);

  // Customization actions
  const addCustomPayment = useCallback((label: string, keywords: string[]) => {
    const id = slugify(label);
    const kws = Array.from(new Set([id, ...keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)]));
    setHiddenPaymentIds((ids) => ids.filter((i) => i !== id));
    setCustomPayments((ps) => ps.some((p) => p.id === id) ? ps : [...ps, { id, label: label.trim(), keywords: kws }]);
    setWallets((ws) => ws.some((w) => w.id === id) ? ws : [...ws, { id, label: label.trim(), type: 'other', balance: 0, keywords: kws }]);
    showToast(`Metode "${label.trim()}" ditambahkan.`, 'success');
  }, [showToast]);

  const updateCustomPayment = useCallback((id: string, data: Partial<CustomPayment>) => {
    const label = data.label?.trim();
    if (!label) { showToast('Nama metode bayar tidak boleh kosong.', 'error'); return; }
    const kws = mergeKeywords(id, data.keywords ?? []);
    setHiddenPaymentIds((ids) => ids.filter((i) => i !== id));
    setCustomPayments((ps) => ps.some((p) => p.id === id) ? ps.map((p) => p.id === id ? { id, label, keywords: kws } : p) : [...ps, { id, label, keywords: kws }]);
    setWallets((ws) => ws.map((w) => w.id === id ? { ...w, label, keywords: kws } : w));
    showToast(`Metode "${label}" diperbarui.`, 'success');
  }, [showToast]);

  const removeCustomPayment = useCallback((id: string) => {
    const isBuiltin = BUILTIN_WALLET_DEFAULT_BALANCES ? id in BUILTIN_WALLET_DEFAULT_BALANCES : false;
    // Check if it's a built-in wallet by seeing if it exists in seed wallets
    const builtinIds = ['tunai', 'bca', 'seabank', 'gopay', 'ovo', 'dana', 'shopeepay', 'tabungan'];
    const isBuiltinWallet = builtinIds.includes(id);
    setCustomPayments((ps) => ps.filter((p) => p.id !== id));
    if (isBuiltinWallet) {
      setHiddenPaymentIds((ids) => ids.includes(id) ? ids : [...ids, id]);
      showToast('Metode bawaan disembunyikan.', 'success');
    } else {
      showToast('Metode dihapus.', 'success');
    }
  }, [showToast]);

  const restoreHiddenPayment = useCallback((id: string) => {
    setHiddenPaymentIds((ids) => ids.filter((i) => i !== id));
    showToast('Metode bawaan dimunculkan lagi.', 'success');
  }, [showToast]);

  const addCustomCategory = useCallback((label: string, keywords: string[], subcategories: string[], type: 'expense' | 'income') => {
    const id = makeDualTypeId(label, type);
    const kws = Array.from(new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)));
    const subs = Array.from(new Set(subcategories.map((s) => s.trim()).filter(Boolean)));
    setCustomCategories((cs) => cs.some((c) => c.id === id) ? cs : [...cs, { id, label: label.trim(), keywords: kws, subcategories: subs, type }]);
    showToast(`Kategori "${label.trim()}" ditambahkan.`, 'success');
  }, [showToast]);

  const updateCustomCategory = useCallback((id: string, data: Partial<CustomCategory>) => {
    const label = data.label?.trim();
    if (!label) return;
    const kws = Array.from(new Set((data.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean)));
    const subs = data.subcategories?.map((s) => s.trim()).filter(Boolean);
    setCustomCategories((cs) => cs.some((c) => c.id === id) ? cs.map((c) => c.id === id ? { ...c, label, keywords: kws, subcategories: subs ?? c.subcategories ?? [], type: data.type ?? c.type ?? inferType(c) } : c) : [...cs, { id, label, keywords: kws, subcategories: subs ?? [], type: data.type ?? getBuiltinCategoryType(id) }]);
    showToast(`Kategori "${label}" diperbarui.`, 'success');
  }, [showToast]);

  const removeCustomCategory = useCallback((id: string) => {
    setCustomCategories((cs) => cs.filter((c) => c.id !== id));
  }, []);

  const toggleZen = useCallback(() => {
    setZenMode((prev) => {
      const next = !prev;
      if (next) markZenUsed();
      return next;
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    showToast(`Tema ${mode === 'system' ? 'mengikuti perangkat' : mode === 'dark' ? 'gelap' : 'terang'} diaktifkan.`, 'success');
  }, [showToast]);

  // --- Memoized context values ---
  const authValue = useMemo<AuthStore>(() => ({ user, authReady, updateProfile, updateProfileAvatar }), [user, authReady, updateProfile, updateProfileAvatar]);
  const txDataValue = useMemo<TransactionData>(() => ({ transactions }), [transactions]);
  const txActionsValue = useMemo<TransactionActions>(() => ({ addTransaction, addManualTransaction, updateTransaction, deleteTransaction }), [addTransaction, addManualTransaction, updateTransaction, deleteTransaction]);
  const txStatusValue = useMemo<TransactionStatus>(() => ({ newTransactionId, isSubmitting }), [newTransactionId, isSubmitting]);
  const walletValue = useMemo<WalletStore>(() => ({ wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney }), [wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney]);
  const budgetValue = useMemo<BudgetStore>(() => ({ monthlyBudget, setMonthlyBudget }), [monthlyBudget, setMonthlyBudget]);
  const customizationValue = useMemo<CustomizationStore>(() => ({ customPayments, customCategories, hiddenPaymentIds, addCustomPayment, updateCustomPayment, removeCustomPayment, restoreHiddenPayment, addCustomCategory, updateCustomCategory, removeCustomCategory, parserExtras }), [customPayments, customCategories, hiddenPaymentIds, addCustomPayment, updateCustomPayment, removeCustomPayment, restoreHiddenPayment, addCustomCategory, updateCustomCategory, removeCustomCategory, parserExtras]);
  const preferenceValue = useMemo<PreferenceStore>(() => ({ zenMode, themeMode, toggleZen, setThemeMode }), [zenMode, themeMode, toggleZen, setThemeMode]);
  const feedbackValue = useMemo<FeedbackStore>(() => ({ toast, showToast, dismissToast }), [toast, showToast, dismissToast]);

  const combinedValue = useMemo<CombinedStore>(() => ({
    user, authReady, updateProfile, updateProfileAvatar,
    transactions, addTransaction, addManualTransaction, updateTransaction, deleteTransaction,
    newTransactionId, isSubmitting,
    wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney,
    monthlyBudget, setMonthlyBudget,
    customPayments, customCategories, hiddenPaymentIds,
    addCustomPayment, updateCustomPayment, removeCustomPayment, restoreHiddenPayment,
    addCustomCategory, updateCustomCategory, removeCustomCategory, parserExtras,
    zenMode, themeMode, toggleZen, setThemeMode,
    toast, showToast, dismissToast,
  }), [user, authReady, updateProfile, updateProfileAvatar, transactions, addTransaction, addManualTransaction, updateTransaction, deleteTransaction, newTransactionId, isSubmitting, wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney, monthlyBudget, setMonthlyBudget, customPayments, customCategories, hiddenPaymentIds, addCustomPayment, updateCustomPayment, removeCustomPayment, restoreHiddenPayment, addCustomCategory, updateCustomCategory, removeCustomCategory, parserExtras, zenMode, themeMode, toggleZen, setThemeMode, toast, showToast, dismissToast]);

  return (
    <AuthContext.Provider value={authValue}>
      <TransactionDataContext.Provider value={txDataValue}>
        <TransactionActionsContext.Provider value={txActionsValue}>
          <TransactionStatusContext.Provider value={txStatusValue}>
            <WalletContext.Provider value={walletValue}>
              <BudgetContext.Provider value={budgetValue}>
                <CustomizationContext.Provider value={customizationValue}>
                  <PreferenceContext.Provider value={preferenceValue}>
                    <FeedbackContext.Provider value={feedbackValue}>
                      <StoreContext.Provider value={combinedValue}>
                        {children}
                      </StoreContext.Provider>
                    </FeedbackContext.Provider>
                  </PreferenceContext.Provider>
                </CustomizationContext.Provider>
              </BudgetContext.Provider>
            </WalletContext.Provider>
          </TransactionStatusContext.Provider>
        </TransactionActionsContext.Provider>
      </TransactionDataContext.Provider>
    </AuthContext.Provider>
  );
}

// --- Hooks ---
export const useAuthStore = () => useCtx(AuthContext, 'useAuthStore');
export const useTransactionData = () => useCtx(TransactionDataContext, 'useTransactionData');
export const useTransactionActions = () => useCtx(TransactionActionsContext, 'useTransactionActions');
export const useTransactionStatus = () => useCtx(TransactionStatusContext, 'useTransactionStatus');
export const useWalletStore = () => useCtx(WalletContext, 'useWalletStore');
export const useBudgetStore = () => useCtx(BudgetContext, 'useBudgetStore');
export const useCustomizationStore = () => useCtx(CustomizationContext, 'useCustomizationStore');
export const usePreferenceStore = () => useCtx(PreferenceContext, 'usePreferenceStore');
export const useFeedbackStore = () => useCtx(FeedbackContext, 'useFeedbackStore');
export const useStore = () => useCtx(StoreContext, 'useStore');
