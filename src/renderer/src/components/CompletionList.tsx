import { useEffect, useRef } from 'react'
import {
  AtSign,
  Braces,
  ChevronsRight,
  CornerLeftUp,
  Dot,
  File,
  FileCode,
  Flag,
  Folder,
  FolderSymlink,
  House,
  SquareFunction,
  SquareTerminal,
  Tag,
  TerminalSquare,
  type LucideIcon
} from 'lucide-react'
import type { CompletionItem, CompletionState } from '../lib/completer'
import { formatDate, formatMode, formatSize } from '../lib/format'

const SPECIAL: Record<string, { label: string; Icon: LucideIcon }> = {
  '.': { label: 'bu klasör', Icon: Dot },
  '..': { label: 'üst klasör', Icon: CornerLeftUp },
  '~': { label: 'ev klasörü', Icon: House }
}

const KIND_LABEL: Partial<Record<CompletionItem['kind'], string>> = {
  builtin: 'yerleşik',
  cmdlet: 'cmdlet',
  function: 'fonksiyon',
  alias: 'takma ad',
  exec: 'program'
}

function iconFor(item: CompletionItem): LucideIcon {
  if (item.kind === 'special') return SPECIAL[item.name]?.Icon ?? Folder
  if (item.kind === 'subcommand') return ChevronsRight
  if (item.kind === 'option') return Flag
  if (item.kind === 'value') return item.isDir ? Folder : Tag
  if (item.entry?.isLink && item.isDir) return FolderSymlink
  if (item.isDir) return Folder
  if (item.kind === 'file') return item.entry?.isExec ? FileCode : File
  if (item.kind === 'alias') return AtSign
  if (item.kind === 'function') return SquareFunction
  if (item.kind === 'cmdlet') return Braces
  if (item.kind === 'builtin') return TerminalSquare
  return SquareTerminal
}

/** Sade görünümde sağda gösterilen kısa bilgi. */
function hintFor(item: CompletionItem): string {
  if (item.kind === 'special') return SPECIAL[item.name]?.label ?? ''
  if (item.insert) return item.detail ?? ''
  if (item.entry) return item.isDir ? '' : formatSize(item.entry.size)
  if (item.kind === 'alias' && item.detail) return `→ ${item.detail}`
  return KIND_LABEL[item.kind] ?? ''
}

interface Props {
  state: CompletionState
  onPick(index: number): void
  onToggleDetails(): void
}

/** Terminalde imlecin altında açılan öneri listesi. Odak terminalde kalır; tuşları Completer yönetir. */
export function CompletionList({ state, onPick, onToggleDetails }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const platform = window.zortex.platform

  useEffect(() => {
    if (state.selected < 0) return
    listRef.current?.children[state.selected]?.scrollIntoView({ block: 'nearest' })
  }, [state.selected])

  const title =
    state.source === 'path' ? (state.title.split(/[\\/]/).filter(Boolean).pop() ?? state.title) : state.title

  return (
    <div
      className={`completion${state.details ? ' is-detailed' : ''}`}
      style={{ left: state.left, top: state.top, bottom: state.bottom, width: state.width }}
      // Tıklama terminalin odağını almasın; aksi halde liste kapanır.
      onMouseDown={(e) => e.preventDefault()}
      data-testid="completion"
    >
      <div className="completion-head" title={state.title}>
        {state.source === 'path' ? <Folder size={12} /> : state.source === 'spec' ? <ChevronsRight size={12} /> : <SquareTerminal size={12} />}
        <span className="completion-title">{state.details && state.source === 'path' ? state.title : title}</span>
        <span className="completion-count">{state.items.length}</span>
      </div>
      <ul ref={listRef} role="listbox" aria-label="Öneriler">
        {state.items.map((item, i) => {
          const Icon = iconFor(item)
          const entry = item.entry
          return (
            <li
              key={`${item.kind}:${item.name}`}
              role="option"
              aria-selected={i === state.selected}
              className={[
                'completion-item',
                i === state.selected ? 'is-selected' : '',
                item.kind === 'special' ? 'is-special' : '',
                item.isDir ? 'is-dir' : '',
                item.isDangerous ? 'is-dangerous' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onPick(i)}
              data-testid="completion-item"
            >
              {state.details && entry && (
                <>
                  <span className="completion-col mode">{formatMode(entry, platform)}</span>
                  <span className="completion-col size">{entry.isDir ? '' : formatSize(entry.size)}</span>
                  <span className="completion-col date">{formatDate(entry.mtime)}</span>
                </>
              )}
              <Icon size={14} className="completion-icon" />
              <span className="completion-name" data-testid="completion-name">
                {item.name}
              </span>
              {item.insert ? (
                // Spec önerisi: açıklama (uzunsa kısaltılır, tamamı ipucunda).
                <span className="completion-detail" title={item.detail}>
                  {item.detail}
                </span>
              ) : !state.details ? (
                <span className="completion-hint">{hintFor(item)}</span>
              ) : !entry && item.kind !== 'special' ? (
                <span className="completion-detail" title={item.detail}>
                  {KIND_LABEL[item.kind]}
                  {item.detail ? ` · ${item.detail}` : ''}
                </span>
              ) : item.kind === 'special' ? (
                <span className="completion-hint">{hintFor(item)}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="completion-foot">
        <kbd>↑↓</kbd> seç <kbd>Tab</kbd> tamamla
        <button className="completion-toggle" onClick={onToggleDetails} title="Ayrıntılı görünüm (Ctrl+Space)">
          <kbd>Ctrl+Space</kbd> {state.details ? 'sade' : 'ayrıntılı'}
        </button>
        <kbd>Esc</kbd> kapat
      </div>
    </div>
  )
}
