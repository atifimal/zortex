import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import {
  ArrowDownUp,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Crosshair,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { foldText, groupSnippets } from '../../../shared/search'
import { extractParams } from '../../../shared/params'
import { DEFAULT_SNIPPET_SORT, SNIPPET_SORTS, isSnippetSort, moveInOrder, type SnippetSort } from '../../../shared/sort'
import type { Category, Snippet } from '../../../shared/types'
import { loadPref, savePref } from '../lib/storage'
import { shortcutLabel } from '../lib/platform'

export interface SidebarHandle {
  focusSearch(): void
}

interface Props {
  categories: Category[]
  snippets: Snippet[]
  targetLabel: string
  onRun(snippet: Snippet): void
  onNewSnippet(categoryId?: string): void
  onEditSnippet(snippet: Snippet): void
  onDuplicateSnippet(snippet: Snippet): void
  onDeleteSnippet(snippet: Snippet): void
  onNewCategory(): void
  onRenameCategory(category: Category): void
  onDeleteCategory(category: Category): void
  onReorder(order: string[], moved?: { id: string; categoryId: string }): void
  onInfo(message: string): void
}

/** Sürüklenen snippet'in bırakılacağı yer: bir snippet'in üstü/altı ya da kategorinin sonu. */
type DropTarget = { categoryId: string; snippetId?: string; edge?: 'top' | 'bottom' }

const DRAG_TYPE = 'application/x-zortex-snippet'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Aranan kelimeleri metin içinde vurgular (Türkçe karakter ve büyük/küçük harf farkını yok sayarak). */
function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text
  const folded = foldText(text)
  if (folded.length !== text.length) return text // nadir: sadeleştirme uzunluğu değiştirdiyse vurgulama yapma
  const marks = new Array<boolean>(text.length).fill(false)
  for (const term of terms) {
    let from = 0
    for (;;) {
      const at = folded.indexOf(term, from)
      if (at === -1) break
      marks.fill(true, at, at + term.length)
      from = at + term.length
    }
  }
  const parts: ReactNode[] = []
  let i = 0
  while (i < text.length) {
    const marked = marks[i]
    let j = i
    while (j < text.length && marks[j] === marked) j++
    const chunk = text.slice(i, j)
    parts.push(marked ? <mark key={i}>{chunk}</mark> : chunk)
    i = j
  }
  return parts
}

export const Sidebar = forwardRef<SidebarHandle, Props>(function Sidebar(props, ref) {
  const { categories, snippets, targetLabel, onRun } = props
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(loadPref('collapsedCategories', [], isStringArray)))
  const [sort, setSort] = useState<SnippetSort>(() => loadPref('snippetSort', DEFAULT_SNIPPET_SORT, isSnippetSort))
  const [sortOpen, setSortOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    focusSearch() {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  }))

  const groups = useMemo(() => groupSnippets(categories, snippets, query, sort), [categories, snippets, query, sort])
  const terms = useMemo(() => foldText(query).split(/\s+/).filter(Boolean), [query])
  const searching = terms.length > 0
  const resultCount = groups.reduce((n, g) => n + g.snippets.length, 0)

  const setCollapsedPersist = (next: Set<string>): void => {
    setCollapsed(next)
    savePref('collapsedCategories', [...next])
  }
  const toggle = (id: string): void => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsedPersist(next)
  }
  const allCollapsed = categories.length > 0 && categories.every((c) => collapsed.has(c.id))
  const toggleAll = (): void => setCollapsedPersist(allCollapsed ? new Set() : new Set(categories.map((c) => c.id)))

  const canReorder = !searching

  const changeSort = (next: SnippetSort): void => {
    setSort(next)
    savePref('snippetSort', next)
  }

  useEffect(() => {
    if (!sortOpen) return
    const close = (e: MouseEvent): void => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [sortOpen])

  /**
   * Snippet'i hedef kategoride `beforeId`'nin önüne (yoksa sona) taşır.
   * Alfabetik vb. bir sıralama seçiliyse ekrandaki sıra özel sıra olarak benimsenir.
   */
  const moveSnippet = (id: string, categoryId: string, beforeId: string | null): void => {
    const visible = groups.flatMap((g) => g.snippets.map((s) => s.id))
    const categoryOf = (x: string): string | undefined =>
      x === id ? categoryId : snippets.find((s) => s.id === x)?.categoryId
    props.onReorder(moveInOrder(visible, id, categoryId, beforeId, categoryOf), { id, categoryId })
    if (sort !== 'manual') {
      changeSort('manual')
      props.onInfo('Sıralama “Özel sıra” olarak değiştirildi')
    }
    if (collapsed.has(categoryId)) toggle(categoryId)
  }

  const endDrag = (): void => {
    setDragId(null)
    setDrop(null)
  }

  const onSnippetDragOver = (e: DragEvent<HTMLDivElement>, categoryId: string, snippetId: string): void => {
    if (!dragId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const edge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
    if (drop?.snippetId !== snippetId || drop.edge !== edge) setDrop({ categoryId, snippetId, edge })
  }

  const onCategoryDragOver = (e: DragEvent<HTMLDivElement>, categoryId: string): void => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (drop?.categoryId !== categoryId || drop.snippetId) setDrop({ categoryId })
  }

  const onDropAt = (e: DragEvent<HTMLDivElement>, items: Snippet[]): void => {
    e.preventDefault()
    e.stopPropagation()
    const id = dragId
    const target = drop
    endDrag()
    if (!id || !target) return
    let beforeId: string | null = null
    if (target.snippetId) {
      const at = items.findIndex((s) => s.id === target.snippetId)
      beforeId = target.edge === 'top' ? target.snippetId : (items[at + 1]?.id ?? null)
    }
    moveSnippet(id, target.categoryId, beforeId)
  }

  const focusableItems = (): HTMLElement[] => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ?? [])]

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusableItems()[0]?.focus()
    } else if (e.key === 'Enter') {
      const first = groups.find((g) => g.snippets.length > 0)?.snippets[0]
      if (first) {
        e.preventDefault()
        onRun(first)
      }
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      e.stopPropagation()
      setQuery('')
    }
  }

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const snippetId = (document.activeElement as HTMLElement | null)?.dataset.snippetId
    if (e.altKey && snippetId) {
      // Alt + ↑/↓: odaktaki snippet'i kategorisi içinde bir sıra kaydırır.
      e.preventDefault()
      const group = canReorder ? groups.find((g) => g.snippets.some((s) => s.id === snippetId)) : undefined
      if (!group) return
      const list = group.snippets
      const at = list.findIndex((s) => s.id === snippetId)
      if (e.key === 'ArrowUp' && at > 0) moveSnippet(snippetId, group.category.id, list[at - 1].id)
      else if (e.key === 'ArrowDown' && at < list.length - 1) moveSnippet(snippetId, group.category.id, list[at + 2]?.id ?? null)
      else return
      requestAnimationFrame(() =>
        listRef.current?.querySelector<HTMLElement>(`[data-snippet-id="${CSS.escape(snippetId)}"]`)?.focus()
      )
      return
    }
    const items = focusableItems()
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index === -1) return
    e.preventDefault()
    if (e.key === 'ArrowDown') items[Math.min(items.length - 1, index + 1)]?.focus()
    else if (index === 0) searchRef.current?.focus()
    else items[index - 1]?.focus()
  }

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-top">
        <div className="search">
          <Search size={16} className="search-icon" />
          <input
            ref={searchRef}
            className="search-input"
            placeholder={`Snippet ara  (${shortcutLabel('F')})`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            spellCheck={false}
            data-testid="search"
          />
          {query && (
            <button className="icon-btn search-clear" onClick={() => setQuery('')} aria-label="Aramayı temizle">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="sidebar-actions">
          <button
            className="btn btn-primary btn-small grow"
            onClick={() => props.onNewSnippet()}
            title={`Yeni snippet (${shortcutLabel('N')})`}
            data-testid="new-snippet"
          >
            <Plus size={16} /> Snippet
          </button>
          <button className="btn btn-small" onClick={props.onNewCategory} title="Yeni kategori" data-testid="new-category">
            <FolderPlus size={16} /> Kategori
          </button>
          <div className="sort-menu-wrap" ref={sortRef}>
            <button
              className={`icon-btn${sort !== DEFAULT_SNIPPET_SORT ? ' is-active' : ''}`}
              onClick={() => setSortOpen(!sortOpen)}
              title={`Sırala: ${SNIPPET_SORTS.find((o) => o.value === sort)?.label ?? ''}`}
              aria-label="Sıralama"
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              data-testid="sort-button"
            >
              <ArrowDownUp size={17} />
            </button>
            {sortOpen && (
              <div
                className="sort-menu"
                role="menu"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setSortOpen(false)
                  }
                }}
              >
                <div className="sort-menu-title">Snippet sıralaması</div>
                {SNIPPET_SORTS.map((o) => (
                  <button
                    key={o.value}
                    role="menuitemradio"
                    aria-checked={sort === o.value}
                    className={`sort-menu-item${sort === o.value ? ' is-selected' : ''}`}
                    onClick={() => {
                      changeSort(o.value)
                      setSortOpen(false)
                    }}
                    data-testid={`sort-${o.value}`}
                  >
                    <Check size={14} className="sort-check" />
                    {o.label}
                  </button>
                ))}
                <div className="sort-menu-hint">Snippet'leri sürükleyerek ya da Alt + ↑/↓ ile de sıralayabilirsiniz.</div>
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={toggleAll}
            disabled={searching || categories.length === 0}
            title={allCollapsed ? 'Tümünü genişlet' : 'Tümünü daralt'}
            aria-label={allCollapsed ? 'Tümünü genişlet' : 'Tümünü daralt'}
          >
            {allCollapsed ? <ChevronsUpDown size={17} /> : <ChevronsDownUp size={17} />}
          </button>
        </div>
      </div>

      <div className="tree" ref={listRef} onKeyDown={onListKeyDown} role="tree" aria-label="Snippet'ler">
        {categories.length === 0 && (
          <div className="empty">
            <p>Henüz kategori yok.</p>
            <button className="btn btn-small" onClick={props.onNewCategory}>
              <FolderPlus size={16} /> İlk kategoriyi oluştur
            </button>
          </div>
        )}
        {searching && resultCount === 0 && (
          <div className="empty">
            <p>
              “{query}” için sonuç bulunamadı.
            </p>
          </div>
        )}
        {groups.map(({ category, snippets: items }) => {
          const open = searching || !collapsed.has(category.id)
          return (
            <div
              className={`tree-group${drop && !drop.snippetId && drop.categoryId === category.id ? ' is-drop-target' : ''}`}
              key={category.id}
              role="group"
              data-testid="category"
              onDragOver={(e) => onCategoryDragOver(e, category.id)}
              onDrop={(e) => onDropAt(e, items)}
            >
              <div className="tree-category">
                <button
                  className="tree-category-toggle"
                  onClick={() => toggle(category.id)}
                  disabled={searching}
                  aria-expanded={open}
                  data-nav-item
                  data-testid="category-toggle"
                >
                  <ChevronRight size={16} className={`chevron${open ? ' is-open' : ''}`} />
                  {open ? <FolderOpen size={16} className="folder-icon" /> : <Folder size={16} className="folder-icon" />}
                  <span className="tree-category-name">{highlight(category.name, terms)}</span>
                  <span className="count">{items.length}</span>
                </button>
                <div className="row-actions">
                  <button className="icon-btn" title="Bu kategoriye snippet ekle" onClick={() => props.onNewSnippet(category.id)}>
                    <Plus size={15} />
                  </button>
                  <button className="icon-btn" title="Yeniden adlandır" onClick={() => props.onRenameCategory(category)}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn danger" title="Kategoriyi sil" onClick={() => props.onDeleteCategory(category)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {open && (
                <div className="tree-items">
                  {items.length === 0 && !searching && (
                    <button className="tree-empty" onClick={() => props.onNewSnippet(category.id)}>
                      <Plus size={14} /> Snippet ekle
                    </button>
                  )}
                  {items.map((s) => {
                    const paramCount = extractParams(s.command).length
                    return (
                      <div
                        className={[
                          'snippet',
                          dragId === s.id ? 'is-dragging' : '',
                          drop?.snippetId === s.id ? `drop-${drop.edge}` : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        key={s.id}
                        role="treeitem"
                        data-testid="snippet"
                        draggable={canReorder}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData(DRAG_TYPE, s.id)
                          setDragId(s.id)
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => onSnippetDragOver(e, category.id, s.id)}
                        onDrop={(e) => onDropAt(e, items)}
                      >
                        {canReorder && <GripVertical size={14} className="snippet-grip" aria-hidden />}
                        <button
                          className="snippet-main"
                          onClick={() => onRun(s)}
                          title={`${s.description ? `${s.description}\n\n` : ''}${s.command}\n\nTıkla: ${targetLabel} içinde ${s.autoRun ? 'çalıştır' : 'yaz'}`}
                          data-nav-item
                          data-snippet-id={s.id}
                          data-testid="snippet-run"
                        >
                          <Play size={13} className="snippet-play" />
                          <span className="snippet-text">
                            <span className="snippet-name">
                              {highlight(s.name, terms)}
                              {paramCount > 0 && (
                                <span className="param-badge" title={`${paramCount} parametre sorulacak`}>{`{${paramCount}}`}</span>
                              )}
                              {!s.autoRun && <span className="manual-badge" title="Enter'a siz basarsınız">yaz</span>}
                            </span>
                            <span className="snippet-command">{highlight(s.command.split('\n')[0], terms)}</span>
                          </span>
                        </button>
                        <div className="row-actions">
                          <button className="icon-btn" title="Düzenle" onClick={() => props.onEditSnippet(s)} data-testid="snippet-edit">
                            <Pencil size={15} />
                          </button>
                          <button className="icon-btn" title="Kopyasını oluştur" onClick={() => props.onDuplicateSnippet(s)}>
                            <Copy size={15} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title="Sil"
                            onClick={() => props.onDeleteSnippet(s)}
                            data-testid="snippet-delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <footer className="sidebar-footer" data-testid="target-indicator">
        <Crosshair size={15} className="accent" />
        <span>
          Hedef: <strong>{targetLabel}</strong>
        </span>
        <span className="muted grow-right">{snippets.length} snippet</span>
      </footer>
    </aside>
  )
})
