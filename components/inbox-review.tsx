'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Filter,
  Inbox,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  useRuleInboxStore,
  useCustomizationStore,
  useTransactionData,
  useTransactionActions,
  useFeedbackStore,
  type LocalCategoryRule,
  type InboxTransactionItem,
  type CategoryMatchEvaluation,
} from '@/lib/store'
import {
  CATEGORY_CONFIG,
  getCategoryConfig,
  getDefaultSubcategories,
  dedupeSubcategories,
  normalizeCategoryKey,
} from '@/components/category-badge'
import {
  normalizeKeyword,
  evaluateTransactionForRules,
  prepareRuleFromInboxItem,
  isDuplicateRule,
} from '@/lib/rules-inbox'
import { formatIDR, formatTransactionDateTime } from '@/lib/parser'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'

// ── 1. Category Suggestion Chip for Transaction Forms ─────────────────────────

export interface CategorySuggestionChipProps {
  description: string
  currentCategoryId: string
  currentSubcategoryId?: string
  onApply: (categoryId: string, subcategoryId?: string) => void
  className?: string
  type?: 'expense' | 'income' | 'transfer'
}

/**
 * CategorySuggestionChip (Phase P8, Requirements 8.2, 8.4)
 * --------------------------------------------------------
 * Evaluates transaction description on-device against active local rules.
 * If a keyword match occurs, presents a suggestion chip with category/subcategory.
 * Invariant: NEVER mutates the form's category automatically; requires explicit
 * user click on "Terapkan" to apply.
 */
export const CategorySuggestionChip = memo(function CategorySuggestionChip({
  description,
  currentCategoryId,
  currentSubcategoryId,
  onApply,
  className,
  type,
}: CategorySuggestionChipProps) {
  const { localRules, matchDescriptionToRule } = useRuleInboxStore()
  const { customCategories } = useCustomizationStore()

  // Evaluate description against local rules
  const matchEvaluation = useMemo<CategoryMatchEvaluation>(() => {
    if (!description || !description.trim() || type === 'transfer') {
      return {
        hasMatch: false,
        confidence: 0,
        requiresInboxReview: true,
        matchType: 'none',
      }
    }
    if (typeof matchDescriptionToRule === 'function') {
      return matchDescriptionToRule(description)
    }
    return evaluateTransactionForRules(description, localRules)
  }, [description, localRules, matchDescriptionToRule, type])

  if (!matchEvaluation.hasMatch || !matchEvaluation.suggestedCategoryId) {
    return null
  }

  const suggestedCatId = matchEvaluation.suggestedCategoryId
  const suggestedSub = matchEvaluation.suggestedSubcategoryId

  // Find human-readable label
  const customMatch = customCategories.find(c => c.id === suggestedCatId)
  const builtinCfg = getCategoryConfig(suggestedCatId)
  const categoryLabel = customMatch?.label || builtinCfg.label || suggestedCatId

  // Check whether current form selection already matches suggestion
  const isApplied =
    currentCategoryId === suggestedCatId &&
    (!suggestedSub || currentSubcategoryId === suggestedSub)

  const handleApply = () => {
    if (isApplied) return
    onApply(suggestedCatId, suggestedSub)
  }

  const confidencePct = Math.round(matchEvaluation.confidence * 100)

  return (
    <div
      data-testid="category-suggestion-chip"
      className={cn(
        'flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all animate-fade-in',
        isApplied
          ? 'bg-[var(--sk-green-dim)]/40 border-[var(--sk-green)]/40 text-[var(--sk-text)]'
          : 'bg-[var(--sk-cyan-dim)]/40 border-[var(--sk-cyan)]/50 text-[var(--sk-text)]',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
            isApplied ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]' : 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sk-text-dim)]">
              Saran Kategori:
            </span>
            <span className="text-xs font-bold text-[var(--sk-text)]">
              {categoryLabel}
            </span>
            {suggestedSub && (
              <span className="text-[11px] text-[var(--sk-cyan)] font-medium">
                • {suggestedSub}
              </span>
            )}
            <span
              className={cn(
                'text-[9px] font-semibold px-1.5 py-0.2 rounded-full',
                confidencePct >= 70
                  ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                  : 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]'
              )}
            >
              {confidencePct}%
            </span>
          </div>
          {matchEvaluation.matchedKeyword && (
            <p className="text-[10px] text-[var(--sk-text-dim)] truncate mt-0.5">
              Aturan: "{matchEvaluation.matchedKeyword}"
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        data-testid="apply-category-suggestion-btn"
        onClick={handleApply}
        disabled={isApplied}
        className={cn(
          'px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all flex items-center gap-1',
          isApplied
            ? 'bg-[var(--sk-surface-2)] text-[var(--sk-green)] border border-[var(--sk-green)]/30 cursor-default'
            : 'bg-[var(--sk-cyan)] text-[#090D16] hover:opacity-90 active:scale-95 shadow-[0_0_8px_var(--sk-cyan-glow)]'
        )}
      >
        {isApplied ? (
          <>
            <Check className="w-3 h-3" />
            <span>Diterapkan</span>
          </>
        ) : (
          <span>Terapkan</span>
        )}
      </button>
    </div>
  )
})

// ── 2. Rule Creation Confirmation Prompt Modal ─────────────────────────────────

interface RulePromptModalProps {
  open: boolean
  onClose: () => void
  item: InboxTransactionItem | null
  chosenCategoryId: string
  chosenSubcategoryId?: string
  onConfirmed: (saveRule: boolean, customKeyword?: string) => void
}

function RulePromptModal({
  open,
  onClose,
  item,
  chosenCategoryId,
  chosenSubcategoryId,
  onConfirmed,
}: RulePromptModalProps) {
  const [keyword, setKeyword] = useState('')
  const { customCategories } = useCustomizationStore()
  const { localRules } = useRuleInboxStore()

  useEffect(() => {
    if (open && item) {
      setKeyword(normalizeKeyword(item.rawDescription))
    }
  }, [open, item])

  // Back stack handling
  useEffect(() => {
    if (open) {
      pushBackLayer({ id: 'inbox-rule-prompt-modal', type: 'dialog', onClose })
    } else {
      removeBackLayer('inbox-rule-prompt-modal')
    }
    return () => removeBackLayer('inbox-rule-prompt-modal')
  }, [open, onClose])

  if (!open || !item) return null

  const normKeyword = normalizeKeyword(keyword)
  const isDuplicate = isDuplicateRule(normKeyword, localRules)

  const customMatch = customCategories.find(c => c.id === chosenCategoryId)
  const builtinCfg = getCategoryConfig(chosenCategoryId)
  const categoryLabel = customMatch?.label || builtinCfg.label || chosenCategoryId

  const handleSaveWithRule = () => {
    if (!normKeyword) return
    onConfirmed(true, normKeyword)
    onClose()
  }

  const handleApproveOnly = () => {
    onConfirmed(false)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="rule-prompt-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden p-4 flex flex-col gap-3.5 animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[var(--sk-border)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 data-testid="rule-prompt-title" className="text-xs font-bold text-[var(--sk-text)] leading-tight">
                Simpan aturan untuk kata kunci ini?
              </h3>
              <p className="text-[10px] text-[var(--sk-text-dim)]">
                Otomatisasi pengelompokan transaksi lokal di perangkat ini
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="cancel-prompt-btn"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transaction Summary Card */}
        <div className="rounded-xl bg-[var(--sk-surface-2)] p-3 border border-[var(--sk-border)] flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--sk-text-dim)]">Transaksi:</span>
            <span className="font-bold text-[var(--sk-text)] tabular-nums">{formatIDR(item.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--sk-text-dim)]">Keterangan:</span>
            <span className="font-medium text-[var(--sk-text)] truncate max-w-[180px]">{item.rawDescription}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[var(--sk-border)]/50">
            <span className="text-[11px] text-[var(--sk-text-dim)]">Kategori Dipilih:</span>
            <span className="font-bold text-[var(--sk-cyan)] flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {categoryLabel} {chosenSubcategoryId ? `• ${chosenSubcategoryId}` : ''}
            </span>
          </div>
        </div>

        {/* Keyword Input for the Rule */}
        <div>
          <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--sk-text-dim)] flex items-center justify-between">
            <span>Kata Kunci Pola (Keyword)</span>
            <span className="text-[9px] text-[var(--sk-text-dim)]">Bisa diedit lebih pendek</span>
          </label>
          <input
            type="text"
            data-testid="rule-keyword-input"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="cth. kopi, bensin, token"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
          />
          {isDuplicate && (
            <p className="text-[10px] text-[var(--sk-amber)] mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Kata kunci ini sudah ada di daftar aturan.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            data-testid="save-rule-confirm-btn"
            onClick={handleSaveWithRule}
            disabled={!normKeyword}
            className="w-full py-2 px-3 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_12px_var(--sk-cyan-glow)] disabled:opacity-50 active:scale-98 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Simpan Aturan & Setujui</span>
          </button>
          <button
            type="button"
            data-testid="approve-only-btn"
            onClick={handleApproveOnly}
            className="w-full py-2 px-3 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[var(--sk-text)] text-xs font-medium hover:bg-[var(--sk-surface-3)] active:scale-98 transition-all"
          >
            Hanya Transaksi Ini (Tanpa Aturan)
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 3. Main Inbox Review Component ───────────────────────────────────────────

export interface InboxReviewProps {
  className?: string
  onClose?: () => void
  initialTab?: 'pending' | 'history' | 'rules'
}

export function InboxReview({ className, onClose, initialTab = 'pending' }: InboxReviewProps) {
  const {
    inbox,
    localRules,
    pendingInboxCount,
    updateInboxItemStatus,
    removeInboxItem,
    addLocalRule,
    removeLocalRule,
    toggleLocalRuleActive,
  } = useRuleInboxStore()
  const { customCategories } = useCustomizationStore()
  const { transactions } = useTransactionData()
  const { updateTransaction } = useTransactionActions()
  const { showToast } = useFeedbackStore()

  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'rules'>(initialTab)

  // Per-item category picker state in inbox list
  const [itemCategoryDrafts, setItemCategoryDrafts] = useState<Record<string, { categoryId: string; subcategoryId?: string }>>({})

  // Rule creation confirmation modal state
  const [promptItem, setPromptItem] = useState<InboxTransactionItem | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)

  // Add rule manually state in rules tab
  const [isAddingRule, setIsAddingRule] = useState(false)
  const [newRuleKeyword, setNewRuleKeyword] = useState('')
  const [newRuleCategory, setNewRuleCategory] = useState('makanan')
  const [newRuleSubcategory, setNewRuleSubcategory] = useState('')

  // Filter options for all categories
  const allCategoryOptions = useMemo(() => {
    const builtins = Object.entries(CATEGORY_CONFIG).map(([id, cfg]) => ({
      id,
      label: cfg.label,
      subcategories: getDefaultSubcategories(id),
    }))
    const customs = customCategories.map(c => ({
      id: c.id,
      label: c.label,
      subcategories: c.subcategories || [],
    }))
    const map = new Map<string, { id: string; label: string; subcategories: string[] }>()
    for (const cat of [...builtins, ...customs]) {
      const key = normalizeCategoryKey(cat.label) || cat.id
      if (!map.has(key)) {
        map.set(key, { ...cat, subcategories: dedupeSubcategories(cat.subcategories) })
      }
    }
    return Array.from(map.values())
  }, [customCategories])

  const pendingItems = useMemo(
    () => inbox.filter(item => item.status === 'pending'),
    [inbox]
  )
  const historyItems = useMemo(
    () => inbox.filter(item => item.status !== 'pending'),
    [inbox]
  )

  const getEffectiveCategory = (item: InboxTransactionItem) => {
    const draft = itemCategoryDrafts[item.id]
    if (draft) return draft
    return {
      categoryId: item.suggestedCategoryId || 'makanan',
      subcategoryId: item.suggestedSubcategoryId,
    }
  }

  const handlePickCategory = (itemId: string, categoryId: string, subcategoryId?: string) => {
    setItemCategoryDrafts(prev => ({
      ...prev,
      [itemId]: { categoryId, subcategoryId },
    }))
  }

  const handleOpenApprovePrompt = (item: InboxTransactionItem) => {
    setPromptItem(item)
    setPromptOpen(true)
  }

  const handleConfirmApproval = (saveRule: boolean, customKeyword?: string) => {
    if (!promptItem) return
    const currentPick = getEffectiveCategory(promptItem)
    const confirmedCat = currentPick.categoryId
    const confirmedSub = currentPick.subcategoryId

    // 1. Update inbox status
    updateInboxItemStatus(promptItem.id, 'approved', {
      categoryId: confirmedCat,
      subcategoryId: confirmedSub,
    })

    // 2. If corresponding transaction exists in store, update its category as well
    const matchedTx = transactions.find(t =>
      promptItem.id === `inbox-${t.id}` ||
      (t.description === promptItem.rawDescription && t.amount === promptItem.amount)
    )
    if (matchedTx) {
      updateTransaction(matchedTx.id, {
        description: matchedTx.description,
        amount: matchedTx.amount,
        category: confirmedCat,
        subcategory: confirmedSub,
      })
    }

    // 3. Save as LocalCategoryRule if requested (Requirement 8.5)
    if (saveRule) {
      const keywordToSave = normalizeKeyword(customKeyword || promptItem.rawDescription)
      try {
        addLocalRule({
          keyword: keywordToSave,
          categoryId: confirmedCat,
          subcategoryId: confirmedSub,
          isActive: true,
        })
        showToast(`Aturan "${keywordToSave}" disimpan & transaksi disetujui.`, 'success')
      } catch (err: any) {
        showToast(err?.message || `Transaksi disetujui.`, 'success')
      }
    } else {
      showToast('Kategori transaksi disetujui.', 'success')
    }

    setPromptItem(null)
  }

  const handleReject = (item: InboxTransactionItem) => {
    updateInboxItemStatus(item.id, 'rejected')
    showToast('Transaksi ditandai ditolak.', 'success')
  }

  const handleDelete = (item: InboxTransactionItem) => {
    removeInboxItem(item.id)
    showToast('Item inbox dihapus.', 'success')
  }

  const handleCreateManualRule = () => {
    const norm = normalizeKeyword(newRuleKeyword)
    if (!norm) {
      showToast('Kata kunci aturan tidak boleh kosong.', 'error')
      return
    }
    const created = addLocalRule({
      keyword: norm,
      categoryId: newRuleCategory,
      subcategoryId: newRuleSubcategory.trim() || undefined,
      isActive: true,
    })
    if (created) {
      setNewRuleKeyword('')
      setNewRuleSubcategory('')
      setIsAddingRule(false)
    }
  }

  return (
    <div data-testid="inbox-review" className={cn('flex flex-col gap-3', className)}>
      {/* Header bar if onClose given or standalone */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--sk-border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)]">
            <Inbox className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--sk-text)] leading-tight">
                Inbox Review Kategori
              </h2>
              {pendingInboxCount > 0 && (
                <span
                  data-testid="inbox-pending-badge"
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] border border-[var(--sk-amber)]/30"
                >
                  {pendingInboxCount} perlu cek
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--sk-text-dim)]">
              Tinjau transaksi tidak terkategori & kelola aturan otomatis lokal
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Inbox Review"
            className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Segmented Tab Navigation */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold">
        <button
          type="button"
          data-testid="tab-inbox-pending"
          onClick={() => setActiveTab('pending')}
          className={cn(
            'py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
            activeTab === 'pending'
              ? 'bg-[var(--sk-surface)] text-[var(--sk-cyan)] border border-[var(--sk-border)] shadow-sm'
              : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
          )}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Perlu Tinjau ({pendingItems.length})</span>
        </button>
        <button
          type="button"
          data-testid="tab-inbox-history"
          onClick={() => setActiveTab('history')}
          className={cn(
            'py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
            activeTab === 'history'
              ? 'bg-[var(--sk-surface)] text-[var(--sk-cyan)] border border-[var(--sk-border)] shadow-sm'
              : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Riwayat ({historyItems.length})</span>
        </button>
        <button
          type="button"
          data-testid="tab-inbox-rules"
          onClick={() => setActiveTab('rules')}
          className={cn(
            'py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
            activeTab === 'rules'
              ? 'bg-[var(--sk-surface)] text-[var(--sk-cyan)] border border-[var(--sk-border)] shadow-sm'
              : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Aturan ({localRules.length})</span>
        </button>
      </div>

      {/* ── TAB 1: PENDING INBOX ITEMS ── */}
      {activeTab === 'pending' && (
        <div className="flex flex-col gap-2.5">
          {pendingItems.length === 0 ? (
            <div
              data-testid="inbox-empty-state"
              className="rounded-2xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface-2)]/30 p-8 flex flex-col items-center justify-center text-center gap-2"
            >
              <div className="w-10 h-10 rounded-full bg-[var(--sk-green-dim)] text-[var(--sk-green)] flex items-center justify-center">
                <Check className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-[var(--sk-text)]">Inbox Review Bersih!</p>
              <p className="text-xs text-[var(--sk-text-dim)] max-w-xs leading-relaxed">
                Semua transaksi sudah memiliki kategori atau telah disetujui. Transaksi baru yang belum cocok aturan akan muncul di sini.
              </p>
            </div>
          ) : (
            pendingItems.map(item => {
              const effective = getEffectiveCategory(item)
              const customMatch = customCategories.find(c => c.id === effective.categoryId)
              const builtinCfg = getCategoryConfig(effective.categoryId)
              const categoryLabel = customMatch?.label || builtinCfg.label || effective.categoryId
              const confidencePct = Math.round((item.confidence || 0) * 100)

              return (
                <div
                  key={item.id}
                  data-testid={`inbox-item-${item.id}`}
                  className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3.5 flex flex-col gap-3 transition-all hover:border-[var(--sk-border-2)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[var(--sk-text)] truncate">
                          {item.rawDescription}
                        </p>
                        <span
                          className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                            confidencePct >= 60
                              ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)]/30'
                              : confidencePct > 0
                                ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] border-[var(--sk-amber)]/30'
                                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border-[var(--sk-border)]'
                          )}
                        >
                          {confidencePct > 0 ? `${confidencePct}% keyakinan` : 'Belum terkategori'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--sk-text-dim)] mt-1">
                        <span>{formatTransactionDateTime(item.date)}</span>
                        <span>•</span>
                        <span className="font-semibold text-[var(--sk-text-muted)] tabular-nums">
                          {formatIDR(item.amount)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`delete-inbox-btn-${item.id}`}
                      onClick={() => handleDelete(item)}
                      title="Hapus dari inbox"
                      className="p-1.5 rounded-lg text-[var(--sk-text-dim)] hover:text-[var(--sk-red)] hover:bg-[var(--sk-surface-2)] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Category Assignment Row */}
                  <div className="rounded-lg bg-[var(--sk-surface-2)] p-2 border border-[var(--sk-border)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag className="w-3.5 h-3.5 text-[var(--sk-cyan)] shrink-0" />
                      <span className="text-[11px] text-[var(--sk-text-dim)] shrink-0">Kategori:</span>
                      <select
                        value={effective.categoryId}
                        onChange={e => handlePickCategory(item.id, e.target.value)}
                        className="bg-transparent text-xs font-semibold text-[var(--sk-text)] outline-none border-b border-dashed border-[var(--sk-border-2)] cursor-pointer truncate max-w-[140px]"
                      >
                        {allCategoryOptions.map(cat => (
                          <option key={cat.id} value={cat.id} className="bg-[var(--sk-surface)] text-[var(--sk-text)]">
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {effective.subcategoryId && (
                      <span className="text-[10px] text-[var(--sk-cyan)] font-medium bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-md truncate max-w-[100px]">
                        {effective.subcategoryId}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--sk-border)]/50">
                    <button
                      type="button"
                      data-testid={`approve-inbox-btn-${item.id}`}
                      onClick={() => handleOpenApprovePrompt(item)}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_8px_var(--sk-cyan-glow)] hover:opacity-90 active:scale-95 transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Setujui & Buat Aturan</span>
                    </button>
                    <button
                      type="button"
                      data-testid={`reject-inbox-btn-${item.id}`}
                      onClick={() => handleReject(item)}
                      className="py-1.5 px-3 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-red)] text-xs font-medium border border-[var(--sk-border)] active:scale-95 transition-all"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── TAB 2: REVIEW HISTORY ── */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-2">
          {historyItems.length === 0 ? (
            <p className="text-xs text-[var(--sk-text-dim)] text-center py-8">
              Belum ada riwayat review. Transaksi yang disetujui atau ditolak akan dicatat di sini.
            </p>
          ) : (
            historyItems.map(item => (
              <div
                key={item.id}
                className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-[var(--sk-text)] truncate">
                      {item.rawDescription}
                    </p>
                    <span
                      className={cn(
                        'text-[9px] font-bold px-1.5 py-0.2 rounded-md',
                        item.status === 'approved'
                          ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                          : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                      )}
                    >
                      {item.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
                    {formatIDR(item.amount)} • {item.suggestedCategoryId || 'lainnya'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="text-[var(--sk-text-dim)] hover:text-[var(--sk-red)] p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB 3: LOCAL CATEGORY RULES ── */}
      {activeTab === 'rules' && (
        <div data-testid="rules-list" className="flex flex-col gap-3">
          {/* Add New Rule Button & Form */}
          {!isAddingRule ? (
            <button
              type="button"
              data-testid="add-new-rule-btn"
              onClick={() => setIsAddingRule(true)}
              className="w-full py-2.5 rounded-xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface)] text-xs font-semibold text-[var(--sk-cyan)] flex items-center justify-center gap-1.5 hover:bg-[var(--sk-surface-2)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ Tambah Aturan Kategori Baru</span>
            </button>
          ) : (
            <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-3 flex flex-col gap-2.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--sk-text)]">Buat Aturan Kategori Baru</span>
                <button
                  type="button"
                  onClick={() => setIsAddingRule(false)}
                  className="text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  data-testid="new-rule-keyword-input"
                  value={newRuleKeyword}
                  onChange={e => setNewRuleKeyword(e.target.value)}
                  placeholder="Kata kunci (cth. kopi, bensin, token)"
                  autoFocus
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
                />

                <select
                  data-testid="new-rule-category-select"
                  value={newRuleCategory}
                  onChange={e => setNewRuleCategory(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none"
                >
                  {allCategoryOptions.map(cat => (
                    <option key={cat.id} value={cat.id} className="bg-[var(--sk-surface)]">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                value={newRuleSubcategory}
                onChange={e => setNewRuleSubcategory(e.target.value)}
                placeholder="Subkategori opsional (cth. Minuman, BBM)"
                className="px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none"
              />

              <button
                type="button"
                data-testid="save-rule-btn"
                onClick={handleCreateManualRule}
                disabled={!newRuleKeyword.trim()}
                className="py-2 px-3 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-[0_0_8px_var(--sk-cyan-glow)]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Simpan Aturan</span>
              </button>
            </div>
          )}

          {/* List of Registered Rules */}
          {localRules.length === 0 ? (
            <p className="text-xs text-[var(--sk-text-dim)] text-center py-6">
              Belum ada aturan kategori. Buat aturan baru atau setujui transaksi dari Inbox Review.
            </p>
          ) : (
            localRules.map(rule => {
              const customMatch = customCategories.find(c => c.id === rule.categoryId)
              const builtinCfg = getCategoryConfig(rule.categoryId)
              const categoryLabel = customMatch?.label || builtinCfg.label || rule.categoryId

              return (
                <div
                  key={rule.id}
                  data-testid={`rule-item-${rule.id}`}
                  className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[var(--sk-text)] bg-[var(--sk-surface-2)] px-2 py-0.5 rounded-md border border-[var(--sk-border)]">
                        "{rule.keyword}"
                      </span>
                      <ArrowRight className="w-3 h-3 text-[var(--sk-text-dim)]" />
                      <span className="text-xs font-semibold text-[var(--sk-cyan)]">
                        {categoryLabel}
                      </span>
                      {rule.subcategoryId && (
                        <span className="text-[10px] text-[var(--sk-text-dim)]">
                          ({rule.subcategoryId})
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--sk-text-dim)] mt-1">
                      Cocok {rule.matchCount} kali • {rule.isActive ? 'Aktif' : 'Non-aktif'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid={`toggle-rule-btn-${rule.id}`}
                      onClick={() => toggleLocalRuleActive(rule.id)}
                      className={cn(
                        'px-2 py-1 rounded-md text-[10px] font-semibold transition-colors border',
                        rule.isActive
                          ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)]/30'
                          : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border-[var(--sk-border)]'
                      )}
                    >
                      {rule.isActive ? 'Aktif' : 'Mati'}
                    </button>
                    <button
                      type="button"
                      data-testid={`delete-rule-btn-${rule.id}`}
                      onClick={() => removeLocalRule(rule.id)}
                      className="p-1.5 rounded-lg text-[var(--sk-text-dim)] hover:text-[var(--sk-red)] hover:bg-[var(--sk-surface-2)] transition-colors"
                      title="Hapus aturan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Confirmation Rule Prompt Modal */}
      <RulePromptModal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        item={promptItem}
        chosenCategoryId={promptItem ? getEffectiveCategory(promptItem).categoryId : 'makanan'}
        chosenSubcategoryId={promptItem ? getEffectiveCategory(promptItem).subcategoryId : undefined}
        onConfirmed={handleConfirmApproval}
      />
    </div>
  )
}

// ── 4. Slide-Over / Modal Drawer for Inbox Review ─────────────────────────────

export interface InboxReviewDrawerProps {
  open: boolean
  onClose: () => void
  initialTab?: 'pending' | 'history' | 'rules'
}

export function InboxReviewDrawer({ open, onClose, initialTab = 'pending' }: InboxReviewDrawerProps) {
  useEffect(() => {
    if (open) {
      pushBackLayer({ id: 'inbox-review-drawer', type: 'modal', onClose })
    } else {
      removeBackLayer('inbox-review-drawer')
    }
    return () => removeBackLayer('inbox-review-drawer')
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-testid="inbox-review-drawer"
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-y-auto p-4 flex flex-col gap-3 animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        <InboxReview onClose={onClose} initialTab={initialTab} />
      </div>
    </div>,
    document.body
  )
}
