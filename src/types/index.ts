// SakuKilat - Type Definitions

export type TransactionKind = 'transaction' | 'transfer' | 'saving';
export type TransactionType = 'expense' | 'income';
export type WalletType = 'cash' | 'bank' | 'ewallet' | 'savings' | 'other';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface Transaction {
  id: string;
  kind: TransactionKind;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  subcategory?: string;
  paymentMethod: string;
  date: Date;
  fromWalletId?: string;
  toWalletId?: string;
  rawInput?: string;
  isPending?: boolean;
}

export interface Wallet {
  id: string;
  label: string;
  type: WalletType;
  balance: number;
  keywords: string[];
  isBuiltIn?: boolean;
}

export interface Goal {
  id: string;
  label: string;
  target: number;
  saved: number;
  deadline?: string;
  createdAt: string;
}

export interface CustomCategory {
  id: string;
  label: string;
  keywords: string[];
  subcategories?: string[];
  type: TransactionType;
}

export interface CustomPayment {
  id: string;
  label: string;
  keywords: string[];
}

export interface ParserExtras {
  payments: { id: string; label: string; keywords: string[] }[];
  categories: { id: string; label: string; keywords: string[]; subcategories?: string[]; type: TransactionType }[];
  lastActiveWalletId: string;
}

export interface ParsedEntry {
  kind: TransactionKind;
  description: string;
  amount: number;
  type?: TransactionType;
  category?: string;
  subcategory?: string;
  paymentMethod?: string;
  date?: Date;
  fromWalletId?: string;
  toWalletId?: string;
  rawInput?: string;
  confidence: number;
  warning?: string;
}

export interface AppUser {
  name: string;
  givenName: string;
  email: string;
  avatarUrl: string | null;
}

export interface ToastState {
  text: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

export interface AppState {
  schemaVersion: number;
  transactions: Transaction[];
  wallets: Wallet[];
  monthlyBudget: number;
  customPayments: CustomPayment[];
  customCategories: CustomCategory[];
  hiddenPaymentIds: string[];
  zenMode: boolean;
  themeMode: ThemeMode;
  profileName: string | null;
  profileAvatarUrl: string | null;
}

export interface Badge {
  id: string;
  group: string;
  title: string;
  howTo: string;
  copy: string;
  tier: 'bronze' | 'silver' | 'gold' | 'special';
  trigger: 'ON_TX_SUBMIT' | 'ON_ROUTE_CHANGE' | 'ON_APP_MOUNT' | 'ON_CRON_MIDNIGHT';
  evaluate: (ctx: BadgeContext) => { progress: number; current?: number; target?: number };
  unlocked?: boolean;
  unlockedAt?: string;
}

export interface BadgeContext {
  transactions: Transaction[];
  wallets: Wallet[];
  walletsCount: number;
  goalsTotal: number;
  goalsCompleted: number;
  backupCount: number;
  importCount: number;
  zenUsed: boolean;
  voiceCount: number;
  editCount: number;
  undoCount: number;
  guideOpened: boolean;
  photoChanged: boolean;
  tabsSeen: number;
  rekapDaysSeen: number;
  customCategoriesCount: number;
  [key: string]: unknown;
}
