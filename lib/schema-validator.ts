/**
 * SakuKilat — Deep Schema Validation for Persisted States and Preloaded Bundles
 * ----------------------------------------------------------------------------
 * Validates and prunes malformed or corrupted nodes before store hydration.
 */

export interface PersistedNotificationPreferences {
  enabled: boolean
  dailyReminderTime?: string
  budgetAlertThresholdPercent: number
  soundEnabled: boolean
}

export interface SchemaValidationResult {
  isValid: boolean
  sanitizedState?: any
  errors: string[]
}

export function validatePersistedStateSchema(raw: unknown): SchemaValidationResult {
  const errors: string[] = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      isValid: false,
      errors: ['Payload state bukan objek yang valid.'],
    }
  }

  const data = raw as Record<string, any>

  // 1. Wallets validation & pruning
  const sanitizedWallets = Array.isArray(data.wallets)
    ? data.wallets
        .filter((w: any) => {
          if (!w || typeof w !== 'object') return false
          if (typeof w.id !== 'string' || !w.id.trim()) return false
          if (typeof w.label !== 'string' || !w.label.trim()) return false
          return true
        })
        .map((w: any) => {
          const rawOpening = w.openingBalance !== undefined ? Number(w.openingBalance) : Number(w.balance)
          const opening = Number.isFinite(rawOpening) ? Math.round(rawOpening) : 0
          const rawCurrent = w.currentBalance !== undefined ? Number(w.currentBalance) : Number(w.balance)
          const current = Number.isFinite(rawCurrent) ? Math.round(rawCurrent) : opening

          return {
            ...w,
            id: w.id.trim(),
            label: w.label.trim(),
            type: w.type || 'other',
            balance: current,
            openingBalance: opening,
            currentBalance: current,
            keywords: Array.isArray(w.keywords) ? w.keywords.filter((k: any) => typeof k === 'string') : [],
            isArchived: Boolean(w.isArchived),
            isDeleted: Boolean(w.isDeleted),
          }
        })
    : []

  // 2. Transactions validation & pruning
  const sanitizedTransactions = Array.isArray(data.transactions)
    ? data.transactions
        .filter((t: any) => {
          if (!t || typeof t !== 'object') return false
          if (typeof t.id !== 'string' || !t.id.trim()) return false
          const num = Number(t.amount)
          if (!Number.isFinite(num) || Number.isNaN(num)) return false
          return true
        })
        .map((t: any) => ({
          ...t,
          id: t.id.trim(),
          amount: Math.round(Math.abs(Number(t.amount))),
          type: t.type === 'income' ? 'income' : 'expense',
          category: typeof t.category === 'string' ? t.category.trim() : 'lainnya',
          paymentMethod: typeof t.paymentMethod === 'string' ? t.paymentMethod.trim() : 'tunai',
        }))
    : []

  // 3. Custom Categories validation & pruning
  const sanitizedCategories = Array.isArray(data.customCategories)
    ? data.customCategories.filter((c: any) => {
        if (!c || typeof c !== 'object') return false
        if (typeof c.id !== 'string' || !c.id.trim()) return false
        const label = c.label || c.name
        if (typeof label !== 'string' || !label.trim()) return false
        return true
      })
    : Array.isArray(data.categories)
    ? data.categories.filter((c: any) => {
        if (!c || typeof c !== 'object') return false
        if (typeof c.id !== 'string' || !c.id.trim()) return false
        const label = c.label || c.name
        if (typeof label !== 'string' || !label.trim()) return false
        return true
      })
    : []

  // 4. Custom Payments validation & pruning
  const sanitizedPayments = Array.isArray(data.customPayments)
    ? data.customPayments.filter((p: any) => {
        if (!p || typeof p !== 'object') return false
        if (typeof p.id !== 'string' || !p.id.trim()) return false
        if (typeof p.label !== 'string' || !p.label.trim()) return false
        return true
      })
    : []

  // 5. Notification Preferences
  const rawNotif = data.notificationPreferences || {}
  const notificationPreferences: PersistedNotificationPreferences = {
    enabled: Boolean(rawNotif.enabled ?? true),
    dailyReminderTime: typeof rawNotif.dailyReminderTime === 'string' ? rawNotif.dailyReminderTime : '20:00',
    budgetAlertThresholdPercent: Number.isFinite(Number(rawNotif.budgetAlertThresholdPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(rawNotif.budgetAlertThresholdPercent))))
      : 80,
    soundEnabled: Boolean(rawNotif.soundEnabled ?? true),
  }

  // 6. Monthly budget
  const rawBudget = Number(data.monthlyBudget)
  const monthlyBudget = Number.isFinite(rawBudget) && rawBudget >= 0 ? Math.round(rawBudget) : 0

  return {
    isValid: true,
    sanitizedState: {
      ...data,
      wallets: sanitizedWallets,
      transactions: sanitizedTransactions,
      customCategories: sanitizedCategories,
      customPayments: sanitizedPayments,
      notificationPreferences,
      monthlyBudget,
    },
    errors,
  }
}
