/**
 * SakuKilat — Bi-directional Wallet & Custom Payment Synchronization
 * ------------------------------------------------------------------
 * Enforces mutual consistency and an idempotency guard (isSyncingWalletPayment)
 * to terminate mutual creation loops between wallets and custom payment methods.
 */

export let isSyncingWalletPayment = false

export function setSyncingWalletPayment(value: boolean): void {
  isSyncingWalletPayment = value
}

export function syncWalletAndCustomPayment(
  action: 'ADD' | 'UPDATE' | 'DELETE',
  entity: { id: string; label: string; icon?: string; keywords?: string[] },
  source: 'WALLET' | 'CUSTOM_PAYMENT',
  getStore: () => any
): void {
  if (isSyncingWalletPayment) return
  isSyncingWalletPayment = true
  try {
    const store = getStore()
    if (!store) return

    if (source === 'WALLET') {
      if (action === 'ADD') {
        if (typeof store.addCustomPaymentDirect === 'function') {
          store.addCustomPaymentDirect({ id: entity.id, label: entity.label, keywords: entity.keywords || [] })
        }
      } else if (action === 'UPDATE') {
        if (typeof store.updateCustomPaymentDirect === 'function') {
          store.updateCustomPaymentDirect(entity.id, { label: entity.label, keywords: entity.keywords || [] })
        }
      } else if (action === 'DELETE') {
        if (typeof store.archiveCustomPaymentDirect === 'function') {
          store.archiveCustomPaymentDirect(entity.id)
        }
      }
    } else {
      if (action === 'ADD') {
        if (typeof store.addWalletDirect === 'function') {
          store.addWalletDirect({ id: entity.id, label: entity.label, openingBalance: 0, currentBalance: 0, keywords: entity.keywords || [] })
        }
      } else if (action === 'UPDATE') {
        if (typeof store.updateWalletDirect === 'function') {
          store.updateWalletDirect(entity.id, { label: entity.label, keywords: entity.keywords || [] })
        }
      } else if (action === 'DELETE') {
        if (typeof store.archiveWalletDirect === 'function') {
          store.archiveWalletDirect(entity.id)
        }
      }
    }
  } finally {
    isSyncingWalletPayment = false
  }
}
