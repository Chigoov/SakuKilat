/**
 * SakuKilat — Wallet Lifecycle & Archival Integrity
 * ------------------------------------------------
 * Provides wallet validation parity, soft-delete/archival,
 * and anti-resurrection lookup logic.
 */

import type { WalletAccount } from './mock-data.ts'

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `wallet-${Date.now()}`
}

export function validateWalletPayload(payload: {
  label?: string
  openingBalance?: number
  currentBalance?: number
  balance?: number
}): void {
  if (payload.label !== undefined && payload.label.trim().length === 0) {
    throw new Error('Nama saku tidak boleh kosong.')
  }
  if (payload.openingBalance !== undefined) {
    if (!Number.isFinite(payload.openingBalance) || Number.isNaN(payload.openingBalance) || payload.openingBalance < 0) {
      throw new Error('Saldo awal harus berupa bilangan bulat valid dan tidak boleh negatif.')
    }
  }
  if (payload.currentBalance !== undefined) {
    if (!Number.isFinite(payload.currentBalance) || Number.isNaN(payload.currentBalance)) {
      throw new Error('Saldo saat ini harus berupa bilangan bulat valid.')
    }
  }
  if (payload.balance !== undefined) {
    if (!Number.isFinite(payload.balance) || Number.isNaN(payload.balance) || payload.balance < 0) {
      throw new Error('Saldo harus berupa bilangan bulat valid dan tidak boleh negatif.')
    }
  }
}

export function archiveWallet(walletId: string, wallets: WalletAccount[]): WalletAccount[] {
  return wallets.map(w => (w.id === walletId ? { ...w, isArchived: true, archivedAt: new Date().toISOString() } : w))
}

export function ensureWallet(
  first: string | WalletAccount[],
  second: string | WalletAccount[],
  options?: { allowCreate?: boolean; fallbackWalletId?: string }
): {
  wallet: WalletAccount
  wasCreated: boolean
  wasRejected: boolean
  walletResurrected: boolean
} {
  let nameOrId: string
  let wallets: WalletAccount[]

  if (typeof first === 'string') {
    nameOrId = first
    wallets = Array.isArray(second) ? second : []
  } else {
    wallets = Array.isArray(first) ? first : []
    nameOrId = typeof second === 'string' ? second : ''
  }

  const trimmed = (nameOrId || '').trim().toLowerCase()
  const existing = wallets.find(w => w.id === nameOrId || w.label.toLowerCase() === trimmed)

  if (existing) {
    if (existing.isDeleted || existing.isArchived) {
      // Guard against resurrecting deleted or archived wallets
      const fallbackWallet =
        wallets.find(w => w.id === options?.fallbackWalletId && !w.isDeleted && !w.isArchived) ||
        wallets.find(w => (w.id === 'cash' || w.id === 'tunai') && !w.isDeleted && !w.isArchived) ||
        wallets.find(w => !w.isDeleted && !w.isArchived)

      if (!fallbackWallet) {
        throw new Error('Tidak ada saku aktif yang dapat digunakan sebagai fallback.')
      }
      return { wallet: fallbackWallet, wasCreated: false, wasRejected: true, walletResurrected: false }
    }
    return { wallet: existing, wasCreated: false, wasRejected: false, walletResurrected: false }
  }

  if (!options?.allowCreate) {
    const fallbackWallet =
      wallets.find(w => w.id === options?.fallbackWalletId && !w.isDeleted && !w.isArchived) ||
      wallets.find(w => (w.id === 'cash' || w.id === 'tunai') && !w.isDeleted && !w.isArchived) ||
      wallets.find(w => !w.isDeleted && !w.isArchived)
    return { wallet: fallbackWallet!, wasCreated: false, wasRejected: true, walletResurrected: false }
  }

  const newWallet: WalletAccount = {
    id: slugify(nameOrId.trim()) || `wallet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    label: nameOrId.trim(),
    type: 'other',
    balance: 0,
    openingBalance: 0,
    currentBalance: 0,
    isArchived: false,
    isDeleted: false,
    keywords: [trimmed],
    createdAt: new Date().toISOString(),
  }
  return { wallet: newWallet, wasCreated: true, wasRejected: false, walletResurrected: false }
}
