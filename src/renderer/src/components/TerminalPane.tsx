import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Crosshair, Eraser, RotateCw } from 'lucide-react'
import { terminalTheme } from '../lib/terminalTheme'
import { isMac, terminalFontFamily } from '../lib/platform'
import { terminalRegistry } from '../lib/terminalRegistry'

interface Props {
  id: string
  index: number
  focused: boolean
  /** Birden fazla bölme görünürken hedef rozeti gösterilir. */
  showTargetBadge: boolean
  shellId: string
  fontSize: number
  onFocusRequest(index: number): void
}

interface RuntimeState {
  exited: boolean
  starting: boolean
  pending: string
  disposed: boolean
}

export function TerminalPane({ id, index, focused, showTargetBadge, shellId, fontSize, onFocusRequest }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const runtime = useRef<RuntimeState>({ exited: false, starting: false, pending: '', disposed: false })
  const startRef = useRef<() => void>(() => {})
  const shellIdRef = useRef(shellId)
  shellIdRef.current = shellId
  const onFocusRef = useRef(onFocusRequest)
  onFocusRef.current = onFocusRequest

  const [shellName, setShellName] = useState('')
  const [exitCode, setExitCode] = useState<number | null>(null)

  const fit = useCallback(() => {
    const host = hostRef.current
    const fitAddon = fitRef.current
    if (!host || !fitAddon || host.clientWidth === 0 || host.clientHeight === 0) return
    try {
      fitAddon.fit()
    } catch {
      // terminal henüz çizilmemiş olabilir
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current!
    const state = runtime.current
    state.disposed = false

    const term = new Terminal({
      fontFamily: terminalFontFamily,
      fontSize,
      lineHeight: 1.15,
      theme: terminalTheme,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10_000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      drawBoldTextInBrightColors: false,
      ...(isMac ? {} : { windowsPty: { backend: 'conpty' as const } })
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.loadAddon(new WebLinksAddon((event, uri) => {
      // Kazara açmayı önlemek için bağlantılar Ctrl/⌘ + tıklama ile açılır.
      if (isMac ? event.metaKey : event.ctrlKey) window.zortex.openExternal(uri)
    }))
    term.open(host)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // WebGL yoksa varsayılan DOM çiziciyle devam edilir.
    }
    termRef.current = term
    fitRef.current = fitAddon

    const copySelection = (): void => {
      const text = term.getSelection()
      if (text) window.zortex.clipboard.writeText(text)
      term.clearSelection()
    }
    const pasteClipboard = (): void => {
      void window.zortex.clipboard.readText().then((text) => text && term.paste(text))
    }

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const key = e.key.toLowerCase()
      if (isMac) {
        // ⌘C / ⌘V uygulama menüsü üzerinden çalışır; ⌘K ekranı temizler.
        if (e.metaKey && !e.ctrlKey && !e.altKey && key === 'k') {
          term.clear()
          return false
        }
        return true
      }
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        // Seçim varken Ctrl+C kopyalar, yokken kabuğa kesme sinyali (^C) gider.
        if (key === 'c' && (e.shiftKey || term.hasSelection())) {
          e.preventDefault()
          copySelection()
          return false
        }
        if (key === 'v') {
          e.preventDefault()
          pasteClipboard()
          return false
        }
      }
      return true
    })

    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      if (term.hasSelection()) copySelection()
      else pasteClipboard()
    }
    host.addEventListener('contextmenu', onContextMenu)

    const onTextareaFocus = (): void => onFocusRef.current(index)
    term.textarea?.addEventListener('focus', onTextareaFocus)

    const offData = window.zortex.pty.onData(id, (data) => term.write(data))
    const offExit = window.zortex.pty.onExit(id, (code) => {
      state.exited = true
      setExitCode(code)
      term.write(`\r\n\x1b[90m[Kabuk kapandı (çıkış kodu ${code}). Yeniden başlatmak için Enter'a basın.]\x1b[0m\r\n`)
    })

    term.onData((data) => {
      if (state.exited) {
        if (data === '\r') startRef.current()
        return
      }
      if (state.starting) {
        state.pending += data
        return
      }
      window.zortex.pty.write(id, data)
    })
    term.onResize(({ cols, rows }) => {
      if (!state.starting && !state.exited) window.zortex.pty.resize(id, cols, rows)
    })

    const start = async (): Promise<void> => {
      if (state.starting || state.disposed) return
      state.starting = true
      fit()
      try {
        const { shell } = await window.zortex.pty.create({
          id,
          cols: term.cols,
          rows: term.rows,
          shellId: shellIdRef.current
        })
        if (state.disposed) return
        state.exited = false
        setExitCode(null)
        setShellName(shell.name)
        // Başlatma sırasında boyut değiştiyse kabuğa bildir.
        window.zortex.pty.resize(id, term.cols, term.rows)
        if (state.pending) {
          window.zortex.pty.write(id, state.pending)
          state.pending = ''
        }
      } catch (error) {
        if (state.disposed) return
        state.exited = true
        state.pending = ''
        setExitCode(-1)
        const message = error instanceof Error ? error.message : String(error)
        term.write(`\r\n\x1b[31m[Kabuk başlatılamadı: ${message}]\x1b[0m\r\n`)
      } finally {
        state.starting = false
      }
    }
    startRef.current = () => void start()

    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(host)

    const unregister = terminalRegistry.register(id, {
      send(text) {
        if (state.exited) {
          state.pending = text
          void start()
        } else if (state.starting) {
          state.pending += text
        } else {
          window.zortex.pty.write(id, text)
        }
      },
      focus() {
        term.focus()
      }
    })

    void start()

    return () => {
      state.disposed = true
      state.pending = ''
      cancelAnimationFrame(frame)
      observer.disconnect()
      unregister()
      offData()
      offExit()
      host.removeEventListener('contextmenu', onContextMenu)
      term.textarea?.removeEventListener('focus', onTextareaFocus)
      window.zortex.pty.kill(id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // Terminal yalnızca bir kez kurulur; yazı boyutu aşağıdaki ayrı efektte güncellenir.
  }, [id, index])

  useEffect(() => {
    const term = termRef.current
    if (!term || term.options.fontSize === fontSize) return
    term.options.fontSize = fontSize
    fit()
  }, [fontSize, fit])

  const restart = (): void => {
    const term = termRef.current
    if (!term) return
    window.zortex.pty.kill(id)
    runtime.current.exited = true
    term.reset()
    startRef.current()
    term.focus()
  }

  const target = (): void => {
    onFocusRequest(index)
    termRef.current?.focus()
  }

  return (
    <section
      className={`pane${focused ? ' is-focused' : ''}`}
      data-testid={`pane-${index + 1}`}
      data-focused={focused}
      onMouseDown={() => onFocusRequest(index)}
      aria-label={`Terminal ${index + 1}`}
    >
      <header className="pane-header">
        <span className="pane-index">{index + 1}</span>
        <span className="pane-title">{shellName || 'Başlatılıyor…'}</span>
        {exitCode !== null && <span className="pane-status">kapandı</span>}
        {showTargetBadge && focused && (
          <span className="pane-target-badge" title="Snippet'ler bu terminalde çalışır">
            <Crosshair size={12} /> Hedef
          </span>
        )}
        <div className="pane-actions">
          {showTargetBadge && !focused && (
            <button className="icon-btn" title="Hedef terminal yap" onClick={target} aria-label="Hedef terminal yap">
              <Crosshair size={14} />
            </button>
          )}
          <button
            className="icon-btn"
            title={isMac ? 'Ekranı temizle (⌘K)' : 'Ekranı temizle'}
            onClick={() => {
              termRef.current?.clear()
              termRef.current?.focus()
            }}
            aria-label="Ekranı temizle"
          >
            <Eraser size={14} />
          </button>
          <button className="icon-btn" title="Kabuğu yeniden başlat" onClick={restart} aria-label="Kabuğu yeniden başlat">
            <RotateCw size={14} />
          </button>
        </div>
      </header>
      <div className="pane-body" ref={hostRef} />
    </section>
  )
}
