import { useEffect, useRef } from 'react'
import { CornerLeftUp, Dot, Folder, House } from 'lucide-react'
import type { CdSuggestState } from '../lib/cdSuggest'

const SPECIAL: Record<string, { label: string; Icon: typeof Folder }> = {
  '.': { label: 'bu klasör', Icon: Dot },
  '..': { label: 'üst klasör', Icon: CornerLeftUp },
  '~': { label: 'ev klasörü', Icon: House }
}

interface Props {
  state: CdSuggestState
  onPick(index: number): void
}

/** `cd` yazılırken imlecin altında açılan klasör listesi. Odak terminalde kalır; tuşları CdSuggest yönetir. */
export function CdSuggestList({ state, onPick }: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (state.selected < 0) return
    listRef.current?.children[state.selected]?.scrollIntoView({ block: 'nearest' })
  }, [state.selected])

  const folderName = state.cwd.split(/[\\/]/).filter(Boolean).pop() ?? state.cwd

  return (
    <div
      className="cd-suggest"
      style={{ left: state.left, top: state.top, bottom: state.bottom }}
      // Tıklama terminalin odağını almasın; aksi halde liste kapanır.
      onMouseDown={(e) => e.preventDefault()}
      data-testid="cd-suggest"
    >
      <div className="cd-suggest-head" title={state.cwd}>
        <Folder size={12} /> {folderName}
      </div>
      <ul ref={listRef} role="listbox" aria-label="Klasör önerileri">
        {state.items.map((item, i) => {
          const special = item.special ? SPECIAL[item.name] : undefined
          const Icon = special?.Icon ?? Folder
          return (
            <li
              key={`${item.special ? 's' : 'd'}:${item.name}`}
              role="option"
              aria-selected={i === state.selected}
              className={`cd-suggest-item${i === state.selected ? ' is-selected' : ''}${item.special ? ' is-special' : ''}`}
              onClick={() => onPick(i)}
              data-testid="cd-suggest-item"
            >
              <Icon size={14} className="cd-suggest-icon" />
              <span className="cd-suggest-name">{item.name}</span>
              {special && <span className="cd-suggest-hint">{special.label}</span>}
            </li>
          )
        })}
      </ul>
      <div className="cd-suggest-foot">
        <kbd>↑↓</kbd> seç <kbd>Tab</kbd> tamamla <kbd>Esc</kbd> kapat
      </div>
    </div>
  )
}
