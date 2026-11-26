import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Crosshair,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { foldText, groupSnippets } from '../../../shared/search'
import { extractParams } from '../../../shared/params'
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
}

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
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    focusSearch() {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  }))

  const groups = useMemo(() => groupSnippets(categories, snippets, query), [categories, snippets, query])
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
            <div className="tree-group" key={category.id} role="group" data-testid="category">
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
                      <div className="snippet" key={s.id} role="treeitem" data-testid="snippet">
                        <button
                          className="snippet-main"
                          onClick={() => onRun(s)}
                          title={`${s.description ? `${s.description}\n\n` : ''}${s.command}\n\nTıkla: ${targetLabel} içinde ${s.autoRun ? 'çalıştır' : 'yaz'}`}
                          data-nav-item
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
