import type { IDisposable, IMarker, Terminal } from '@xterm/xterm'
import { builtinCommands, type CommandEntry } from '../../../shared/builtins'
import {
  CD_COMMANDS,
  commandKey,
  guessInput,
  isPathLike,
  parseCommandLine,
  replacementKeys,
  splitPath,
  type Word
} from '../../../shared/cmdline'
import {
  cwdFromOsc,
  cwdFromPrompt,
  isMsysShell,
  msysToWindows,
  shellKindOf,
  specialDirsFor,
  type ShellKind
} from '../../../shared/shell'
import type { CompletionMode, ShellInfo } from '../../../shared/types'
import type { FsEntry } from '../../../preload/api'
import { loadPref, savePref } from './storage'

export type CompletionItemKind = 'special' | 'dir' | 'file' | CommandEntry['kind']

export interface CompletionItem {
  name: string
  kind: CompletionItemKind
  isDir: boolean
  /** Yazılan klasör kısmı korunarak mı eklenir (yol öğeleri). */
  keepDir: boolean
  detail?: string
  entry?: FsEntry
}

export interface CompletionState {
  items: CompletionItem[]
  /** Klavyeyle seçili öğe; -1 ise seçim yok (Enter komutu çalıştırır). */
  selected: number
  source: 'path' | 'command'
  /** Başlıkta gösterilen klasör yolu ya da açıklama. */
  title: string
  details: boolean
  left: number
  width: number
  top?: number
  bottom?: number
}

type Trigger = 'auto' | 'manual'
type Outcome = 'shown' | 'empty' | 'stale'
type Plan = { type: 'path'; dirsOnly: boolean; execOnly: boolean; specials: boolean } | { type: 'command' }

const INPUT_WINDOW_MS = 1500
const DIR_CACHE_MS = 2000
const COMMAND_CACHE_MS = 30_000
const MAX_ITEMS = 400
const TAB_RECENT_MS = 400
const TAB_QUIET_MS = 60
const TAB_MAX_WAIT_MS = 400
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * Terminal için komut ve dosya/klasör tamamlama.
 *
 * Kabuk entegrasyonu etkinse kabuk her istemde OSC 133;A ve çalışma klasörünü bildirir. Girdinin
 * başladığı yer şöyle bulunur:
 *   1. PowerShell/cmd istemin düz metnini bildirir; satırda bu metnin ardı girdidir.
 *   2. POSIX kabukları istemin sonuna 133;B koyar; macOS/Linux'ta sıra korunduğundan imlecin o anki yeri.
 *      (Windows'ta ConPTY dizileri metinden önce iletebildiği için bu yer güvenilir değildir.)
 *   3. Son çare: istemden sonraki ilk tuşta imlecin bulunduğu yer.
 * Entegrasyon yoksa varsayılan PowerShell/cmd istemleri ve `cd` komutu ekrandan tahmin edilir.
 */
export class Completer {
  mode: CompletionMode = 'auto'

  private kind: ShellKind = 'posix'
  private shell: ShellInfo | null = null
  private msys = false
  private details = loadPref('completion.details', false, isBool)

  // Kabuk entegrasyonu durumu
  private seenIntegration = false
  private atPrompt = false
  private awaitAnchor = false
  private anchor: { marker: IMarker; x: number; text: string } | null = null
  /** Kabuğun bildirdiği istem metni (PowerShell, cmd); girdi bu metnin hemen ardından başlar. */
  private promptText: string | null = null
  private integrationCwd: string | null | undefined = undefined
  private pathEnv: string | null = null
  private msysRoot: string | null = null

  // Entegrasyon yokken kullanılan tahminler
  private oscCwd: string | null = null
  private processCwd: Promise<string | null> | null = null

  private state: CompletionState | null = null
  private word: Word | null = null
  /** Tab/Ctrl+Space ile açıldı ya da klasöre inildi: otomatik kurallar beklenmeden gösterilir. */
  private forced = false
  /** Tab'a basıldı; ilk sonuçlanan değerlendirme tek öneriyi tamamlar ya da Tab'ı kabuğa iletir. */
  private pendingTab = false
  /** Tab sonrası bekleme sırasında gelen çıktı bu fonksiyonla beklemeyi uzatır. */
  private tabSettle: (() => void) | null = null
  private dismissedRow: number | null = null
  private lastInputAt = 0
  private seq = 0
  private scheduled = 0
  private dirCache = new Map<string, { at: number; value: Promise<{ path: string; entries: FsEntry[] }> }>()
  private commandCache: { key: string; at: number; value: Promise<CommandEntry[]> } | null = null
  private disposables: IDisposable[] = []
  private disposed = false

  constructor(
    private readonly term: Terminal,
    private readonly container: HTMLElement,
    private readonly ptyId: string,
    private readonly onChange: (state: CompletionState | null) => void
  ) {
    const platform = window.zortex.platform
    this.disposables.push(
      term.parser.registerOscHandler(133, (data) => {
        if (data.startsWith('A')) {
          this.seenIntegration = true
          this.atPrompt = true
          this.awaitAnchor = true
          this.dropAnchor()
          this.dismissedRow = null
          this.close()
        } else if (data.startsWith('B')) {
          if (platform !== 'win32' && this.atPrompt) this.captureAnchor()
        } else if (data.startsWith('C')) {
          this.atPrompt = false
          this.close()
        }
        return true
      }),
      term.parser.registerOscHandler(6973, (data) => {
        const at = data.indexOf(';')
        const key = at === -1 ? data : data.slice(0, at)
        const value = at === -1 ? '' : data.slice(at + 1)
        if (key === 'cwd') {
          this.seenIntegration = true
          this.integrationCwd = value || null
        } else if (key === 'path') this.pathEnv = value || null
        else if (key === 'msysroot') this.msysRoot = value || null
        else if (key === 'prompt') this.promptText = value || null
        return true
      }),
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

  /** Kabuk (yeniden) başlatıldığında çağrılır. */
  setShell(shell: ShellInfo): void {
    this.shell = shell
    this.kind = shellKindOf(shell.id)
    this.msys = isMsysShell(shell.id)
    this.seenIntegration = false
    this.atPrompt = false
    this.awaitAnchor = false
    this.dropAnchor()
    this.integrationCwd = undefined
    this.pathEnv = null
    this.msysRoot = null
    this.promptText = null
    this.oscCwd = null
    this.processCwd = null
    this.commandCache = null
    this.close()
    // PowerShell cmdlet listesinin alınması bir-iki saniye sürer; ilk tuşta beklenmesin.
    if (this.kind === 'pwsh' && this.mode !== 'off') setTimeout(() => void this.commands(), 1500)
  }

  setMode(mode: CompletionMode): void {
    this.mode = mode
    if (mode === 'off') this.close()
  }

  /** Kullanıcının (ya da bir snippet'in) terminale gönderdiği her girdiden önce çağrılır. */
  noteInput(data: string): void {
    this.lastInputAt = Date.now()
    // Tab sonucu beklenirken yazılmaya devam edildi: bekleyen Tab iptal (sonuç artık yanlış yere düşer).
    this.pendingTab = false
    this.tabSettle = null
    if (this.seenIntegration && this.atPrompt && this.awaitAnchor && !this.promptText) this.captureAnchor()
    if (data.includes('\r')) {
      this.promptText = null
      // Komut çalıştı: istem tekrar gelene kadar öneri yok; klasör değişmiş olabilir.
      if (this.seenIntegration) this.atPrompt = false
      this.oscCwd = null
      this.processCwd = null
      this.dismissedRow = null
      this.close()
    }
  }

  /** Kabuk çıktısı ekrana işlendikten sonra çağrılır; yazılanın yankısı geldiyse liste güncellenir. */
  afterWrite(): void {
    // Tab bekliyorsa çıktı durulana kadar ertele (yankı parça parça gelebilir).
    if (this.pendingTab) this.tabSettle?.()
    if (this.state || Date.now() - this.lastInputAt < INPUT_WINDOW_MS) this.schedule()
  }

  /** xterm'in özel tuş işleyicisi; `false` dönerse tuş kabuğa gitmez. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.type !== 'keydown' || this.mode === 'off') return true
    const consume = (): false => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey
    const isTab = e.key === 'Tab' && plain && !e.shiftKey
    const isCtrlSpace = e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'Space' || e.key === ' ')
    // Boş istemde basıldıysa girdinin başladığı yer şimdi yakalanır (henüz tuş yazılmadı).
    if ((isTab || isCtrlSpace) && this.seenIntegration && this.atPrompt && this.awaitAnchor && !this.promptText) {
      this.captureAnchor()
    }
    if (isCtrlSpace) {
      if (this.state) this.toggleDetails()
      else {
        this.forced = true
        void this.evaluate('manual')
      }
      return consume()
    }

    const state = this.state
    if (!state) {
      if (isTab) {
        this.tabComplete()
        return consume()
      }
      return true
    }
    if (!plain) return true

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
      case 'PageDown':
        this.select(Math.min(count - 1, state.selected + 8))
        return consume()
      case 'PageUp':
        this.select(Math.max(0, state.selected - 8))
        return consume()
      case 'Tab':
        if (!e.shiftKey) this.accept(state.selected >= 0 ? state.selected : 0)
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

  toggleDetails(): void {
    this.details = !this.details
    savePref('completion.details', this.details)
    this.forced = true
    void this.evaluate('manual')
  }

  /** Öğeyi imleçteki sözcüğün yerine koyar. Klasörse liste açık kalır ve içeriğiyle yenilenir. */
  accept(index: number): void {
    const item = this.state?.items[index]
    if (item && this.word) this.acceptItem(item, this.word)
  }

  private acceptItem(item: CompletionItem, word: Word): void {
    const buf = this.term.buffer.active
    const nextChar = buf.getLine(buf.baseY + buf.cursorY)?.getCell(buf.cursorX)?.getChars()
    const keys = replacementKeys(
      word,
      { name: item.name, isDir: item.isDir, keepDir: item.keepDir, nextChar },
      this.kind,
      window.zortex.platform
    )
    window.zortex.pty.write(this.ptyId, keys)
    this.lastInputAt = Date.now()
    if (item.isDir) {
      this.forced = true
      if (this.state) this.update({ ...this.state, selected: -1 })
    } else {
      this.close()
    }
  }

  close(): void {
    this.seq++
    this.word = null
    this.forced = false
    if (this.state) this.update(null)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.scheduled)
    this.dropAnchor()
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }

  // ---------- iç işleyiş ----------

  private update(next: CompletionState | null): void {
    this.state = next
    this.onChange(next)
  }

  private cursorRow(): number {
    const buf = this.term.buffer.active
    return buf.baseY + buf.cursorY
  }

  private schedule(): void {
    cancelAnimationFrame(this.scheduled)
    this.scheduled = requestAnimationFrame(() => void this.evaluate('auto'))
  }

  /** Tab: öneri varsa listeyi açar (tek öneri varsa doğrudan tamamlar), yoksa Tab kabuğa gider. */
  private tabComplete(): void {
    this.forced = true
    this.pendingTab = true
    // Tab'ı yalnızca Tab'ın kendi değerlendirmesi karşılar; araya bir başkası girip bu değerlendirme
    // bayatlarsa yeniden denenir.
    const run = (): void => {
      this.tabSettle = null
      if (!this.pendingTab) return
      void this.evaluate('manual').then((outcome) => outcome === 'stale' && run())
    }
    if (Date.now() - this.lastInputAt > TAB_RECENT_MS) {
      run()
      return
    }
    // Az önce yazılanların yankısı henüz gelmemiş olabilir; ekrandaki satır eskiyse yanlış tamamlanır.
    // Çıktı kısa bir süre sessiz kalınca (en geç TAB_MAX_WAIT_MS sonra) değerlendirilir.
    const deadline = Date.now() + TAB_MAX_WAIT_MS
    let timer = 0
    this.tabSettle = () => {
      clearTimeout(timer)
      timer = window.setTimeout(run, Math.max(0, Math.min(TAB_QUIET_MS, deadline - Date.now())))
    }
    this.tabSettle()
  }

  private dropAnchor(): void {
    this.anchor?.marker.dispose()
    this.anchor = null
  }

  private captureAnchor(): void {
    const buf = this.term.buffer.active
    this.awaitAnchor = false
    if (buf.type !== 'normal') return
    const marker = this.term.registerMarker(0)
    const line = buf.getLine(buf.baseY + buf.cursorY)
    if (!marker || !line) return
    this.dropAnchor()
    this.anchor = { marker, x: buf.cursorX, text: line.translateToString(false, 0, buf.cursorX) }
  }

  /** `(row, x)` konumundan imlece kadar olan metin; sarılmamış satır sonları `\n` olur. */
  private textFrom(row: number, x: number): string | null {
    const buf = this.term.buffer.active
    const endRow = this.cursorRow()
    if (row > endRow || (row === endRow && x > buf.cursorX)) return null
    let text = ''
    for (let y = row; y <= endRow; y++) {
      const line = buf.getLine(y)
      if (!line) return null
      const start = y === row ? x : 0
      const end = y === endRow ? buf.cursorX : this.term.cols
      let piece = line.translateToString(false, start, end)
      if (y < endRow && !buf.getLine(y + 1)?.isWrapped) piece = `${piece.trimEnd()}\n`
      text += piece
    }
    return text
  }

  /** İmleç satırını (sarılmış önceki satırlarla birlikte) imlece kadar okur. */
  private lineBeforeCursor(): string | null {
    const buf = this.term.buffer.active
    let y = this.cursorRow()
    while (y > 0 && buf.getLine(y)?.isWrapped) y--
    return this.textFrom(y, 0)
  }

  /** Yazılmakta olan komut satırı ve öncesindeki istem metni. */
  private readInput(): { text: string; prompt: string } | null {
    if (!this.seenIntegration) {
      const line = this.lineBeforeCursor()
      const guess = line === null ? null : guessInput(line, this.kind)
      return guess ? { text: guess.input, prompt: guess.prompt } : null
    }
    if (!this.atPrompt) return null
    const buf = this.term.buffer.active
    if (this.promptText) {
      const prompt = this.promptText
      const cursor = this.cursorRow()
      for (let y = cursor; y >= Math.max(0, cursor - 20); y--) {
        const line = buf.getLine(y)
        if (!line || !line.translateToString(false).startsWith(prompt)) continue
        // Metin uzunluğunu hücre sütununa çevir (geniş karakterler iki hücre kaplar).
        let x = 0
        while (x < this.term.cols && line.translateToString(false, 0, x).length < prompt.length) x++
        const text = this.textFrom(y, x)
        return text === null ? null : { text, prompt }
      }
      return null
    }
    // Yer yalnızca tuşa basıldığında yakalanır: otomatik değerlendirme istem çizilmeden de çalışabilir.
    const anchor = this.anchor
    if (!anchor) return null
    const matches = (row: number): boolean =>
      row >= 0 && buf.getLine(row)?.translateToString(false, 0, anchor.x) === anchor.text
    let row = anchor.marker.isDisposed ? -1 : anchor.marker.line
    if (!matches(row)) {
      // Ekran temizlendi ya da istem yeniden çizildi: istem metnini imlecin üstünde ara.
      row = -1
      const cursor = this.cursorRow()
      for (let y = cursor; y >= Math.max(0, cursor - 20); y--) {
        if (matches(y)) {
          row = y
          break
        }
      }
    }
    if (row === -1) return null
    const text = this.textFrom(row, anchor.x)
    return text === null ? null : { text, prompt: anchor.text }
  }

  private async cwd(prompt: string): Promise<string | null> {
    if (this.seenIntegration) {
      const cwd = this.integrationCwd
      if (cwd && this.msys) return msysToWindows(cwd, this.msysRoot)
      return cwd ?? null
    }
    const known = this.oscCwd ?? cwdFromPrompt(prompt, this.kind)
    if (known) return known
    this.processCwd ??= window.zortex.pty.cwd(this.ptyId).catch(() => null)
    return this.processCwd
  }

  private listDir(cwd: string, dir: string): Promise<{ path: string; entries: FsEntry[] }> {
    const key = `${cwd}\0${dir}`
    const hit = this.dirCache.get(key)
    if (hit && Date.now() - hit.at < DIR_CACHE_MS) return hit.value
    const value = window.zortex.completion
      .listDir({ cwd, dir, msysRoot: this.msys ? this.msysRoot ?? '' : null })
      .catch(() => ({ path: dir, entries: [] }))
    this.dirCache.set(key, { at: Date.now(), value })
    if (this.dirCache.size > 40) this.dirCache.delete(this.dirCache.keys().next().value!)
    return value
  }

  private commands(): Promise<CommandEntry[]> {
    const shell = this.shell
    if (!shell) return Promise.resolve([])
    const msysRoot = this.msys ? this.msysRoot ?? '' : null
    const key = `${shell.path}\0${this.pathEnv}\0${msysRoot}`
    const hit = this.commandCache
    if (hit && hit.key === key && Date.now() - hit.at < COMMAND_CACHE_MS) return hit.value
    const builtins = builtinCommands(this.kind)
    const value = window.zortex.completion
      .commands({ kind: this.kind, shellPath: shell.path, pathEnv: this.pathEnv, msysRoot })
      .catch(() => ({ entries: [], complete: false }))
      .then(({ entries, complete }) => {
        // PowerShell'in tam listesi henüz gelmediyse kısa süre sonra yeniden sorulur.
        if (!complete && this.commandCache?.value === value) this.commandCache.at = Date.now() - COMMAND_CACHE_MS + 2000
        const caseless = this.kind !== 'posix' || window.zortex.platform === 'win32'
        const seen = new Set<string>()
        const merged: CommandEntry[] = []
        for (const entry of [...builtins, ...entries]) {
          const k = caseless ? entry.name.toLowerCase() : entry.name
          if (seen.has(k)) continue
          seen.add(k)
          merged.push(entry)
        }
        return merged.sort((a, b) => collator.compare(a.name, b.name))
      })
    this.commandCache = { key, at: Date.now(), value }
    return value
  }

  private async pathItems(word: Word, plan: Extract<Plan, { type: 'path' }>, prompt: string, seq: number) {
    const { dir, prefix } = splitPath(word.value, this.kind)
    const cwd = (await this.cwd(prompt)) ?? ''
    if (seq !== this.seq) return null
    // Klasör bilinmiyorsa yalnızca mutlak yollar listelenebilir.
    if (!cwd && !/^([A-Za-z]:|[\\/]|~)/.test(dir)) return null
    const listing = await this.listDir(cwd, dir)
    const lower = prefix.toLowerCase()
    const showHidden = prefix.startsWith('.') || this.details
    const entries = listing.entries
      .filter(
        (e) =>
          (showHidden || !e.name.startsWith('.')) &&
          e.name.toLowerCase().startsWith(lower) &&
          (!plan.dirsOnly || e.isDir) &&
          (!plan.execOnly || e.isDir || e.isExec)
      )
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || collator.compare(a.name, b.name))
    const items: CompletionItem[] = [
      ...(plan.specials ? specialDirsFor(word.value, this.kind) : []).map(
        (name): CompletionItem => ({ name, kind: 'special', isDir: true, keepDir: false })
      ),
      ...entries.map(
        (entry): CompletionItem => ({ name: entry.name, kind: entry.isDir ? 'dir' : 'file', isDir: entry.isDir, keepDir: true, entry })
      )
    ]
    return { items, title: listing.path }
  }

  private async commandItems(word: Word) {
    const lower = word.value.toLowerCase()
    const list = await this.commands()
    const items = list
      .filter((c) => c.name.toLowerCase().startsWith(lower))
      .sort((a, b) => Number(b.name.toLowerCase() === lower) - Number(a.name.toLowerCase() === lower))
      .map((c): CompletionItem => ({ name: c.name, kind: c.kind, isDir: false, keepDir: false, detail: c.detail }))
    return { items, title: 'Komutlar' }
  }

  private plan(trigger: Trigger, text: string): { word: Word; plan: Plan } | null {
    const manual = trigger === 'manual' || this.forced
    const parsed = parseCommandLine(text, this.kind)
    const word = parsed.current
    if (word.midQuote) return null
    if (!parsed.command) {
      if (isPathLike(word.value)) return { word, plan: { type: 'path', dirsOnly: false, execOnly: true, specials: false } }
      return word.value || manual ? { word, plan: { type: 'command' } } : null
    }
    // Seçenekler (`-a`, `--force`) henüz önerilmiyor; Tab kabuğun kendi tamamlamasına gider.
    if (word.value.startsWith('-')) return null
    if (CD_COMMANDS.has(commandKey(parsed.command.value))) {
      return { word, plan: { type: 'path', dirsOnly: true, execOnly: false, specials: true } }
    }
    return word.value || manual ? { word, plan: { type: 'path', dirsOnly: false, execOnly: false, specials: false } } : null
  }

  private async evaluate(trigger: Trigger): Promise<Outcome> {
    const seq = ++this.seq
    const buf = this.term.buffer.active
    const manual = trigger === 'manual' || this.forced
    const fail = (): Outcome => {
      if (this.pendingTab && trigger === 'manual') {
        // Önerimiz yok: Tab kabuğun kendi tamamlamasına gider.
        this.pendingTab = false
        window.zortex.pty.write(this.ptyId, '\t')
      }
      this.close()
      return 'empty'
    }
    if (this.mode === 'off' || this.disposed || !this.shell) return fail()
    if (!manual && this.mode !== 'auto') return fail()
    // Tam ekran programlarda (vim, less…) ya da geçmişe kaydırılmışken öneri gösterilmez.
    if (buf.type !== 'normal' || buf.viewportY !== buf.baseY) return fail()
    if (!manual && this.dismissedRow === this.cursorRow()) return fail()

    const input = this.readInput()
    const planned = input && this.plan(trigger, input.text)
    if (!input || !planned) return fail()
    const { word, plan } = planned

    const result =
      plan.type === 'path' ? await this.pathItems(word, plan, input.prompt, seq) : await this.commandItems(word)
    if (seq !== this.seq || this.disposed) return 'stale'
    if (!result) return fail()
    let items = result.items
    // Yazılanla birebir aynı tek öneriyi otomatik modda göstermenin anlamı yok.
    if (!manual && items.length === 1 && !items[0].isDir && items[0].name === word.value) return fail()
    if (items.length === 0) return fail()
    items = items.slice(0, MAX_ITEMS)
    if (this.pendingTab && trigger === 'manual') {
      this.pendingTab = false
      // Tab ile tek öneri: kabuklardaki gibi doğrudan tamamla.
      if (items.length === 1) {
        this.acceptItem(items[0], word)
        return 'shown'
      }
    }

    const previous = this.state && this.state.selected >= 0 ? this.state.items[this.state.selected]?.name : undefined
    const selected = previous ? items.findIndex((i) => i.name === previous) : -1
    this.word = word
    const width = this.details ? 600 : 360
    this.update({
      items,
      selected,
      source: plan.type,
      title: result.title,
      details: this.details,
      width,
      ...this.position(word, width)
    })
    return 'shown'
  }

  /** Listeyi sözcüğün başladığı hücrenin hemen altına (yer yoksa üstüne) konumlar. */
  private position(word: Word, width: number): Pick<CompletionState, 'left' | 'top' | 'bottom'> {
    const buf = this.term.buffer.active
    const screen = this.container.querySelector<HTMLElement>('.xterm-screen')
    const box = this.container.getBoundingClientRect()
    if (!screen) return { left: 0, top: 0 }
    const rect = screen.getBoundingClientRect()
    const cellW = rect.width / this.term.cols
    const cellH = rect.height / this.term.rows
    const column = Math.max(0, buf.cursorX - [...word.raw].length)
    const left = Math.max(4, Math.min(rect.left - box.left + column * cellW, box.width - width - 4))
    const rowTop = rect.top - box.top + buf.cursorY * cellH
    const below = box.height - (rowTop + cellH)
    if (below < 200 && rowTop > below) return { left, bottom: box.height - rowTop + 2 }
    return { left, top: rowTop + cellH + 2 }
  }
}
