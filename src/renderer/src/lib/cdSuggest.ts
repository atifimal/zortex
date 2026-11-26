import type { IDisposable, Terminal } from '@xterm/xterm'
import {
  completionKeys,
  cwdFromOsc,
  cwdFromPrompt,
  parseCdInput,
  specialDirsFor,
  type CdInput,
  type ShellKind
} from '../../../shared/cd'

export interface CdSuggestItem {
  name: string
  special: boolean
}

export interface CdSuggestState {
  items: CdSuggestItem[]
  /** Klavyeyle seçili öğe; -1 ise henüz seçim yapılmadı (Enter komutu çalıştırır). */
  selected: number
  cwd: string
  left: number
  /** Liste imlecin altına sığmıyorsa satırın üstünde açılır. */
  top?: number
  bottom?: number
}

const INPUT_WINDOW_MS = 1500
const DIR_CACHE_MS = 2000

/**
 * `cd ` yazılırken imlecin altında klasör önerileri gösterir.
 * Yazılanı ekrandaki satırdan okur; kabuğun klasörünü OSC 7 / OSC 9;9 bildirimlerinden,
 * Windows'ta istem metninden (`PS C:\yol>`), macOS/Linux'ta ana süreçten öğrenir.
 */
export class CdSuggest {
  kind: ShellKind = 'posix'
  enabled = true

  private state: CdSuggestState | null = null
  private input: CdInput | null = null
  private lastInputAt = 0
  private seq = 0
  private scheduled = 0
  private oscCwd: string | null = null
  private shellCwd: Promise<string | null> | null = null
  private dirCache = new Map<string, { at: number; names: Promise<string[]> }>()
  /** Esc ile kapatılan satır; Enter'a kadar o satırda yeniden açılmaz. */
  private dismissedRow: number | null = null
  private disposables: IDisposable[] = []
  private disposed = false

  constructor(
    private readonly term: Terminal,
    private readonly container: HTMLElement,
    private readonly ptyId: string,
    private readonly onChange: (state: CdSuggestState | null) => void
  ) {
    const platform = window.zortex.platform
    this.disposables.push(
      term.parser.registerOscHandler(7, (data) => {
        this.oscCwd = cwdFromOsc(7, data, platform) ?? this.oscCwd
        return false
      }),
      term.parser.registerOscHandler(9, (data) => {
        this.oscCwd = cwdFromOsc(9, data, platform) ?? this.oscCwd
        return false
      }),
      term.onResize(() => this.close()),
      term.onScroll(() => this.state && this.schedule())
    )
    const onBlur = (): void => this.close()
    term.textarea?.addEventListener('blur', onBlur)
    this.disposables.push({ dispose: () => term.textarea?.removeEventListener('blur', onBlur) })
  }

  /** Kullanıcının terminale gönderdiği her girdiden önce çağrılır. */
  noteInput(data: string): void {
    this.lastInputAt = Date.now()
    if (data.includes('\r')) {
      // Komut çalıştı: klasör değişmiş olabilir, bilinenler sıfırlanır.
      this.oscCwd = null
      this.shellCwd = null
      this.dismissedRow = null
      this.close()
    }
  }

  /** Kabuk çıktısı ekrana işlendikten sonra çağrılır; yazılanın yankısı geldiyse liste güncellenir. */
  afterWrite(): void {
    if (this.state || Date.now() - this.lastInputAt < INPUT_WINDOW_MS) this.schedule()
  }

  /** xterm'in özel tuş işleyicisi; `false` dönerse tuş kabuğa gitmez. */
  handleKey(e: KeyboardEvent): boolean {
    const state = this.state
    if (!state || e.type !== 'keydown' || e.ctrlKey || e.altKey || e.metaKey) return true
    const consume = (): false => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }
    const count = state.items.length
    switch (e.key) {
      case 'ArrowDown':
        this.select(state.selected + 1 >= count ? 0 : state.selected + 1)
        return consume()
      case 'ArrowUp':
        if (state.selected === -1) {
          // Seçim yokken ↑ kabuğun geçmişine gider.
          this.close()
          return true
        }
        this.select(state.selected - 1)
        return consume()
      case 'Tab':
        if (e.shiftKey) return consume()
        this.accept(state.selected >= 0 ? state.selected : 0)
        return consume()
      case 'Enter':
        if (state.selected < 0) {
          this.close()
          return true
        }
        this.accept(state.selected)
        return consume()
      case 'Escape':
        this.dismissedRow = this.cursorRow()
        this.close()
        return consume()
      default:
        return true
    }
  }

  select(index: number): void {
    if (!this.state) return
    this.update({ ...this.state, selected: Math.max(-1, Math.min(this.state.items.length - 1, index)) })
  }

  /** Öğeyi yazılan yolun yerine koyar; liste yankı gelince yeni klasörün içeriğiyle yenilenir. */
  accept(index: number): void {
    const item = this.state?.items[index]
    if (!item || !this.input) return
    window.zortex.pty.write(this.ptyId, completionKeys(this.input, item.name, this.kind, window.zortex.platform))
    this.lastInputAt = Date.now()
    if (this.state) this.update({ ...this.state, selected: -1 })
  }

  close(): void {
    this.seq++
    this.input = null
    if (this.state) this.update(null)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.scheduled)
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }

  private update(next: CdSuggestState | null): void {
    this.state = next
    this.onChange(next)
  }

  private cursorRow(): number {
    const buf = this.term.buffer.active
    return buf.baseY + buf.cursorY
  }

  private schedule(): void {
    cancelAnimationFrame(this.scheduled)
    this.scheduled = requestAnimationFrame(() => void this.evaluate())
  }

  /** İmlecin bulunduğu satırı (sarılmış önceki satırlarla birlikte) imlece kadar okur. */
  private lineBeforeCursor(): string | null {
    const buf = this.term.buffer.active
    let y = buf.baseY + buf.cursorY
    let line = buf.getLine(y)
    if (!line) return null
    let text = line.translateToString(false, 0, buf.cursorX)
    while (line.isWrapped && y > 0) {
      y--
      const prev = buf.getLine(y)
      if (!prev) break
      text = prev.translateToString(false) + text
      line = prev
    }
    return text
  }

  private listDirs(cwd: string, path: string): Promise<string[]> {
    const key = `${cwd}\0${path}`
    const cached = this.dirCache.get(key)
    if (cached && Date.now() - cached.at < DIR_CACHE_MS) return cached.names
    const names = window.zortex.fs.listDirs(cwd, path, this.kind).catch(() => [])
    this.dirCache.set(key, { at: Date.now(), names })
    if (this.dirCache.size > 50) this.dirCache.delete(this.dirCache.keys().next().value!)
    return names
  }

  private async evaluate(): Promise<void> {
    const seq = ++this.seq
    const buf = this.term.buffer.active
    // Tam ekran programlarda (vim, less…) ya da geçmişe kaydırılmışken öneri gösterilmez.
    if (!this.enabled || this.disposed || buf.type !== 'normal' || buf.viewportY !== buf.baseY) return this.close()
    if (this.dismissedRow === this.cursorRow()) return this.close()
    const text = this.lineBeforeCursor()
    const input = text === null ? null : parseCdInput(text, this.kind)
    if (!text || !input) return this.close()

    const promptText = text.slice(0, text.length - input.raw.length).replace(/\S+ +(?:\/d +)?$/i, '')
    let cwd = this.oscCwd ?? cwdFromPrompt(promptText, this.kind)
    if (!cwd) {
      this.shellCwd ??= window.zortex.pty.cwd(this.ptyId).catch(() => null)
      cwd = await this.shellCwd
    }
    if (seq !== this.seq) return
    if (!cwd) return this.close()

    const names = await this.listDirs(cwd, input.path)
    if (seq !== this.seq || this.disposed) return
    const items: CdSuggestItem[] = [
      ...specialDirsFor(input.path, this.kind).map((name) => ({ name, special: true })),
      ...names.map((name) => ({ name, special: false }))
    ]
    if (items.length === 0) return this.close()

    const previous = this.state && this.state.selected >= 0 ? this.state.items[this.state.selected]?.name : undefined
    const selected = previous ? items.findIndex((i) => i.name === previous) : -1
    this.input = input
    this.update({ items, selected, cwd, ...this.position(input) })
  }

  /** Listeyi yazılan yolun başladığı hücrenin hemen altına (yer yoksa üstüne) konumlar. */
  private position(input: CdInput): Pick<CdSuggestState, 'left' | 'top' | 'bottom'> {
    const buf = this.term.buffer.active
    const screen = this.container.querySelector<HTMLElement>('.xterm-screen')
    const box = this.container.getBoundingClientRect()
    if (!screen) return { left: 0, top: 0 }
    const rect = screen.getBoundingClientRect()
    const cellW = rect.width / this.term.cols
    const cellH = rect.height / this.term.rows
    const column = Math.max(0, buf.cursorX - [...input.raw].length)
    const left = Math.max(4, Math.min(rect.left - box.left + column * cellW, box.width - 284))
    const rowTop = rect.top - box.top + buf.cursorY * cellH
    const below = box.height - (rowTop + cellH)
    if (below < 170 && rowTop > below) return { left, bottom: box.height - rowTop + 2 }
    return { left, top: rowTop + cellH + 2 }
  }
}
