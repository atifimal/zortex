import type { CompletionMode } from '../../../shared/types'
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { TerminalPane } from './TerminalPane'
import { loadPref, savePref } from '../lib/storage'

export type LayoutMode = 'single' | 'columns' | 'rows' | 'grid'

export const LAYOUT_PANE_COUNT: Record<LayoutMode, number> = { single: 1, columns: 2, rows: 2, grid: 4 }

export const PANE_IDS = ['pane-1', 'pane-2', 'pane-3', 'pane-4'] as const

const GAP = 6
const MIN_FRAC = 0.15

interface Rect {
  x0: number
  x1: number
  y0: number
  y1: number
}

function paneRect(layout: LayoutMode, index: number, c: number, r: number): Rect | null {
  switch (layout) {
    case 'single':
      return index === 0 ? { x0: 0, x1: 1, y0: 0, y1: 1 } : null
    case 'columns':
      return index === 0 ? { x0: 0, x1: c, y0: 0, y1: 1 } : index === 1 ? { x0: c, x1: 1, y0: 0, y1: 1 } : null
    case 'rows':
      return index === 0 ? { x0: 0, x1: 1, y0: 0, y1: r } : index === 1 ? { x0: 0, x1: 1, y0: r, y1: 1 } : null
    case 'grid': {
      const left = index % 2 === 0
      const top = index < 2
      return { x0: left ? 0 : c, x1: left ? c : 1, y0: top ? 0 : r, y1: top ? r : 1 }
    }
  }
}

/** Kesirli dikdörtgeni, bölmeler arasında boşluk bırakacak şekilde CSS konumuna çevirir. */
function rectStyle({ x0, x1, y0, y1 }: Rect): CSSProperties {
  const inset = (edge: number, isStart: boolean): number => (isStart ? (edge > 0 ? GAP / 2 : 0) : edge < 1 ? GAP / 2 : 0)
  const l = inset(x0, true)
  const r = inset(x1, false)
  const t = inset(y0, true)
  const b = inset(y1, false)
  return {
    left: `calc(${x0 * 100}% + ${l}px)`,
    width: `calc(${(x1 - x0) * 100}% - ${l + r}px)`,
    top: `calc(${y0 * 100}% + ${t}px)`,
    height: `calc(${(y1 - y0) * 100}% - ${t + b}px)`
  }
}

const isFrac = (v: unknown): v is number => typeof v === 'number' && v >= MIN_FRAC && v <= 1 - MIN_FRAC

interface Props {
  layout: LayoutMode
  focusedIndex: number
  /** Şimdiye kadar açılmış bölme sayısı; gizlenen bölmeler kapatılmaz, oturumları korunur. */
  mountedCount: number
  shellId: string
  fontSize: number
  completion: CompletionMode
  shellIntegration: boolean
  onFocusPane(index: number): void
}

export function TerminalGrid({ layout, focusedIndex, mountedCount, shellId, fontSize, completion, shellIntegration, onFocusPane }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [colFrac, setColFrac] = useState(() => loadPref('split.col', 0.5, isFrac))
  const [rowFrac, setRowFrac] = useState(() => loadPref('split.row', 0.5, isFrac))
  const [dragging, setDragging] = useState<'col' | 'row' | null>(null)
  const visibleCount = LAYOUT_PANE_COUNT[layout]

  const startDrag = (axis: 'col' | 'row') => (e: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setDragging(axis)
    const rect = container.getBoundingClientRect()
    let last = axis === 'col' ? colFrac : rowFrac

    const move = (ev: PointerEvent): void => {
      const raw = axis === 'col' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height
      last = Math.min(1 - MIN_FRAC, Math.max(MIN_FRAC, raw))
      if (axis === 'col') setColFrac(last)
      else setRowFrac(last)
    }
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      setDragging(null)
      savePref(axis === 'col' ? 'split.col' : 'split.row', last)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const reset = (axis: 'col' | 'row') => () => {
    if (axis === 'col') setColFrac(0.5)
    else setRowFrac(0.5)
    savePref(axis === 'col' ? 'split.col' : 'split.row', 0.5)
  }

  const showCol = layout === 'columns' || layout === 'grid'
  const showRow = layout === 'rows' || layout === 'grid'

  return (
    <div className={`terminal-grid${dragging ? ` is-dragging-${dragging}` : ''}`} ref={containerRef}>
      {PANE_IDS.slice(0, mountedCount).map((id, index) => {
        const rect = paneRect(layout, index, colFrac, rowFrac)
        return (
          <div key={id} className="pane-slot" style={rect ? rectStyle(rect) : { display: 'none' }}>
            <TerminalPane
              id={id}
              index={index}
              focused={index === focusedIndex}
              showTargetBadge={visibleCount > 1}
              shellId={shellId}
              fontSize={fontSize}
              completion={completion}
              shellIntegration={shellIntegration}
              onFocusRequest={onFocusPane}
            />
          </div>
        )
      })}
      {showCol && (
        <div
          className="gutter gutter-col"
          style={{ left: `calc(${colFrac * 100}% - ${GAP / 2}px)`, width: GAP }}
          onPointerDown={startDrag('col')}
          onDoubleClick={reset('col')}
          role="separator"
          aria-orientation="vertical"
          title="Sürükleyerek boyutlandır, çift tıklayarak eşitle"
        />
      )}
      {showRow && (
        <div
          className="gutter gutter-row"
          style={{ top: `calc(${rowFrac * 100}% - ${GAP / 2}px)`, height: GAP }}
          onPointerDown={startDrag('row')}
          onDoubleClick={reset('row')}
          role="separator"
          aria-orientation="horizontal"
          title="Sürükleyerek boyutlandır, çift tıklayarak eşitle"
        />
      )}
    </div>
  )
}
