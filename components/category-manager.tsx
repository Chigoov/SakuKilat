import { useMemo, useState } from 'react'
import { ChevronDown, FolderEdit, Pencil, Plus, RotateCcw, Tag, Trash2, X } from 'lucide-react'
import { useCustomizationStore } from '@/lib/store'
import { CATEGORY_CONFIG } from '@/components/category-badge'
import { getBuiltinCategoryType, type TransactionType } from '@/lib/parser'
import { cn } from '@/lib/utils'
import { BottomSheet } from '@/components/bottom-sheet'

const NEW_CATEGORY_ID = '__new-category__'

interface CategoryTile {
  id: string
  label: string
  keywords: string[]
  subcategories: string[]
  type: TransactionType
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  isBuiltin: boolean
  isOverridden: boolean
}

interface EditorState {
  id: string
  label: string
  keywords: string
  subcategory: string
  type: TransactionType
  isBuiltin: boolean
}

const CATEGORY_TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Keluar',
  income: 'Masuk',
}
const INITIAL_VISIBLE = 4

function parseKeywords(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,\n]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)))
}

export function CategoryManager() {
  const {
    customCategories,
    addCustomCategory,
    updateCustomCategory,
    removeCustomCategory,
  } = useCustomizationStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorSubcategories, setEditorSubcategories] = useState<string[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Record<TransactionType, boolean>>({
    expense: false,
    income: false,
  })

  const customById = useMemo(
    () => new Map(customCategories.map((item) => [item.id, item])),
    [customCategories]
  )

  const categories = useMemo<CategoryTile[]>(() => {
    const builtins = Object.entries(CATEGORY_CONFIG).map(([id, config]) => {
      const override = customById.get(id)
      return {
        id,
        label: override?.label ?? config.label,
        keywords: override?.keywords ?? [],
        subcategories: override?.subcategories ?? [],
        type: getBuiltinCategoryType(id),
        icon: config.icon,
        color: config.color,
        bg: config.bg,
        isBuiltin: true,
        isOverridden: Boolean(override),
      }
    })

    const customs = customCategories
      .filter((item) => !CATEGORY_CONFIG[item.id as keyof typeof CATEGORY_CONFIG])
      .map((item) => ({
        id: item.id,
        label: item.label,
        keywords: item.keywords,
        subcategories: item.subcategories ?? [],
        type: item.type ?? 'expense',
        icon: Tag,
        color: 'text-[var(--sk-cyan)]',
        bg: 'bg-[var(--sk-cyan-dim)]',
        isBuiltin: false,
        isOverridden: true,
      }))

    return [...builtins, ...customs]
  }, [customById, customCategories])

  const selected = useMemo(
    () => categories.find((item) => item.id === selectedId) ?? null,
    [categories, selectedId]
  )

  const grouped = useMemo(() => ({
    expense: categories.filter((item) => item.type === 'expense'),
    income: categories.filter((item) => item.type === 'income'),
  }), [categories])

  const openDetails = (item: CategoryTile) => {
    setSelectedId(item.id)
    setEditing(false)
    setEditor(null)
    setEditorSubcategories([])
  }

  const openEditor = (item?: CategoryTile) => {
    const next = item ?? {
      id: NEW_CATEGORY_ID,
      label: '',
      keywords: [],
      subcategories: [],
      type: 'expense' as TransactionType,
      isBuiltin: false,
    }

    setSelectedId(next.id)
    setEditing(true)
    setEditor({
      id: next.id,
      label: next.label,
      keywords: next.keywords.join(', '),
      subcategory: '',
      type: next.type,
      isBuiltin: next.isBuiltin,
    })
    setEditorSubcategories(next.subcategories)
  }

  const closeSheet = () => {
    setSelectedId(null)
    setEditing(false)
    setEditor(null)
    setEditorSubcategories([])
  }

  const addSubcategory = () => {
    const trimmed = editor?.subcategory.trim()
    if (!trimmed) return
    setEditorSubcategories((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed])
    setEditor((prev) => prev ? { ...prev, subcategory: '' } : prev)
  }

  const saveCategory = () => {
    if (!editor) return
    const label = editor.label.trim()
    if (!label) return

    const keywords = parseKeywords(editor.keywords)
    const subcategories = Array.from(new Set(editorSubcategories.map((item) => item.trim()).filter(Boolean)))

    if (editor.id === NEW_CATEGORY_ID) {
      addCustomCategory(label, keywords, subcategories, editor.type)
      closeSheet()
      return
    }

    updateCustomCategory(editor.id, {
      label,
      keywords,
      subcategories,
      type: editor.isBuiltin ? getBuiltinCategoryType(editor.id) : editor.type,
    })
    closeSheet()
  }

  const removeSelected = () => {
    if (!selected) return
    removeCustomCategory(selected.id)
    closeSheet()
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sk-amber-dim)]">
          <FolderEdit className="h-4 w-4 text-[var(--sk-amber)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--sk-text)]">Kategori</h3>
        <span className="ml-auto text-[10px] text-[var(--sk-text-dim)]">{customCategories.length} custom</span>
      </div>

      <button
        type="button"
        onClick={() => openEditor()}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface)] px-3 py-3 text-sm font-semibold text-[var(--sk-text-muted)]"
      >
        <Plus className="h-4 w-4" />
        Tambah kategori
      </button>

      {(['expense', 'income'] as const).map((type) => (
        <div key={type} className="mb-5 last:mb-0">
          {(() => {
            const items = expandedGroups[type] ? grouped[type] : grouped[type].slice(0, INITIAL_VISIBLE)
            const canToggle = grouped[type].length > INITIAL_VISIBLE
            return (
              <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">{CATEGORY_TYPE_LABEL[type]}</p>
            <span className="text-[10px] text-[var(--sk-text-dim)]">{grouped[type].length}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openDetails(item)}
                  className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-left"
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', item.bg)}>
                    <Icon className={cn('h-4 w-4', item.color)} />
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-[var(--sk-text)]">{item.label}</p>
                  <span
                    className={cn(
                      'mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold',
                      item.type === 'income'
                        ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                        : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                    )}
                  >
                    {CATEGORY_TYPE_LABEL[item.type]}
                  </span>
                  <p className="mt-1 text-[11px] text-[var(--sk-text-dim)]">
                    {item.subcategories.length > 0 ? `${item.subcategories.length} sub` : `${item.keywords.length} keyword`}
                  </p>
                </button>
              )
            })}
          </div>
          {canToggle ? (
            <button
              type="button"
              onClick={() => setExpandedGroups((prev) => ({ ...prev, [type]: !prev[type] }))}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--sk-text-muted)]"
            >
              {expandedGroups[type] ? 'Ringkas' : `Lihat semua ${grouped[type].length}`}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expandedGroups[type] && 'rotate-180')} />
            </button>
          ) : null}
              </>
            )
          })()}
        </div>
      ))}

      <BottomSheet
        open={Boolean(selectedId)}
        onClose={closeSheet}
        title={editing ? (selectedId === NEW_CATEGORY_ID ? 'Kategori baru' : 'Edit kategori') : selected?.label ?? ''}
        subtitle={editing ? 'Atur nama, keyword, dan sub kategori.' : selected ? CATEGORY_TYPE_LABEL[selected.type] : undefined}
      >
        {editing && editor ? (
          <div className="space-y-3">
            {!editor.isBuiltin && (
              <div className="grid grid-cols-2 gap-2">
                {(['expense', 'income'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditor((prev) => prev ? { ...prev, type } : prev)}
                    className={cn(
                      'rounded-xl border py-2 text-xs font-semibold transition-colors',
                      editor.type === type
                        ? 'border-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
                        : 'border-[var(--sk-border)] bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
                    )}
                  >
                    {CATEGORY_TYPE_LABEL[type]}
                  </button>
                ))}
              </div>
            )}
            <input
              value={editor.label}
              onChange={(event) => setEditor((prev) => prev ? { ...prev, label: event.target.value } : prev)}
              placeholder="Nama kategori"
              className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-sm text-[var(--sk-text)] outline-none"
            />
            <input
              value={editor.keywords}
              onChange={(event) => setEditor((prev) => prev ? { ...prev, keywords: event.target.value } : prev)}
              placeholder="Keyword, pisahkan koma"
              className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-sm text-[var(--sk-text)] outline-none"
            />
            <div className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={editor.subcategory}
                  onChange={(event) => setEditor((prev) => prev ? { ...prev, subcategory: event.target.value } : prev)}
                  onKeyDown={(event) => event.key === 'Enter' && addSubcategory()}
                  placeholder="Tambah sub kategori"
                  className="flex-1 bg-transparent text-sm text-[var(--sk-text)] outline-none"
                />
                <button
                  type="button"
                  onClick={addSubcategory}
                  className="rounded-xl bg-[var(--sk-cyan)] px-3 py-2 text-xs font-semibold text-[#090D16]"
                >
                  Tambah
                </button>
              </div>
              {editorSubcategories.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {editorSubcategories.map((subcategory) => (
                    <button
                      key={subcategory}
                      type="button"
                      onClick={() => setEditorSubcategories((prev) => prev.filter((item) => item !== subcategory))}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgba(56,189,248,0.24)] bg-[var(--sk-cyan-dim)] px-2.5 py-1 text-[10px] font-semibold text-[var(--sk-cyan)]"
                    >
                      {subcategory}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={saveCategory}
                className="rounded-xl bg-[var(--sk-cyan)] px-3 py-2 text-sm font-semibold text-[#090D16]"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-xl bg-[var(--sk-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--sk-text-dim)]"
              >
                Batal
              </button>
            </div>
          </div>
        ) : selected ? (
          <div className="space-y-4">
            {(() => {
              const SelectedIcon = selected.icon
              return (
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', selected.bg)}>
                    <SelectedIcon className={cn('h-5 w-5', selected.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-[var(--sk-text)]">{selected.label}</p>
                    <p className="mt-1 text-xs text-[var(--sk-text-dim)]">
                      {CATEGORY_TYPE_LABEL[selected.type]} • {selected.subcategories.length > 0 ? `${selected.subcategories.length} sub kategori` : 'Belum ada sub kategori'}
                    </p>
                  </div>
                </div>
              )
            })()}

            {selected.subcategories.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Sub kategori</p>
                <div className="flex flex-wrap gap-2">
                  {selected.subcategories.map((subcategory) => (
                    <span
                      key={subcategory}
                      className="rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-2.5 py-1 text-[11px] text-[var(--sk-text)]"
                    >
                      {subcategory}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {selected.keywords.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Keyword</p>
                <div className="flex flex-wrap gap-2">
                  {selected.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-2.5 py-1 text-[11px] text-[var(--sk-text-dim)]"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openEditor(selected)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--sk-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--sk-text)]"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={removeSelected}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold',
                  selected.isBuiltin
                    ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]'
                    : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                )}
              >
                {selected.isBuiltin ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                {selected.isBuiltin ? 'Reset' : 'Hapus'}
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </section>
  )
}
