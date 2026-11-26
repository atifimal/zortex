import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Columns2, Grid2x2, PanelLeft, Rows2, Settings as SettingsIcon, Square } from 'lucide-react'
import { Sidebar, type SidebarHandle } from './components/Sidebar'
import { LAYOUT_PANE_COUNT, PANE_IDS, TerminalGrid, type LayoutMode } from './components/TerminalGrid'
import { SnippetEditor } from './components/SnippetEditor'
import { ParamPrompt } from './components/ParamPrompt'
import { SettingsDialog } from './components/SettingsDialog'
import { ConfirmDialog, PromptDialog } from './components/SimpleDialogs'
import { ToastStack, useToasts } from './components/Toasts'
import { useAppData } from './lib/useAppData'
import { loadPref, savePref } from './lib/storage'
import { isAppShortcut, shortcutLabel } from './lib/platform'
import { terminalRegistry } from './lib/terminalRegistry'
import { extractParams, fillParams, toTerminalInput } from '../../shared/params'
import type { Category, Snippet } from '../../shared/types'
import appIconUrl from '../../../resources/icon.png'

type Dialog =
  | { kind: 'editor'; snippet?: Snippet; categoryId?: string }
  | { kind: 'params'; snippet: Snippet }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; onConfirm(): void }
  | {
      kind: 'prompt'
      title: string
      label: string
      initialValue?: string
      confirmLabel: string
      validate?(value: string): string | null
      onSubmit(value: string): void
    }
  | { kind: 'settings' }

const LAYOUTS: { mode: LayoutMode; label: string; Icon: typeof Square }[] = [
  { mode: 'single', label: 'Tek terminal', Icon: Square },
  { mode: 'columns', label: 'İkiye böl (yan yana)', Icon: Columns2 },
  { mode: 'rows', label: 'İkiye böl (alt alta)', Icon: Rows2 },
  { mode: 'grid', label: 'Dörde böl', Icon: Grid2x2 }
]

const isLayout = (v: unknown): v is LayoutMode => typeof v === 'string' && v in LAYOUT_PANE_COUNT
const isWidth = (v: unknown): v is number => typeof v === 'number' && v >= 220 && v <= 640
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

export function App() {
  const { toasts, notify, dismiss } = useToasts()
  const store = useAppData((msg) => notify(msg, 'error'))
  const { data } = store

  const [layout, setLayoutState] = useState<LayoutMode>(() => loadPref('layout', 'single', isLayout))
  const [mountedCount, setMountedCount] = useState(() => LAYOUT_PANE_COUNT[layout])
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(() => loadPref('sidebar.open', true, isBool))
  const [sidebarWidth, setSidebarWidth] = useState(() => loadPref('sidebar.width', 300, isWidth))
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const sidebarRef = useRef<SidebarHandle>(null)

  const visibleCount = LAYOUT_PANE_COUNT[layout]
  const targetIndex = Math.min(focusedIndex, visibleCount - 1)
  const targetLabel = `Terminal ${targetIndex + 1}`

  const focusPane = useCallback((index: number) => {
    setFocusedIndex(index)
    requestAnimationFrame(() => terminalRegistry.get(PANE_IDS[index])?.focus())
  }, [])

  const setLayout = (mode: LayoutMode): void => {
    setLayoutState(mode)
    savePref('layout', mode)
    const count = LAYOUT_PANE_COUNT[mode]
    setMountedCount((n) => Math.max(n, count))
    focusPane(Math.min(focusedIndex, count - 1))
  }

  const sendToTarget = useCallback(
    (text: string) => {
      const handle = terminalRegistry.get(PANE_IDS[targetIndex])
      if (!handle) {
        notify('Hedef terminal hazır değil', 'error')
        return
      }
      handle.send(text)
      handle.focus()
    },
    [targetIndex, notify]
  )

  const runSnippet = useCallback(
    (snippet: Snippet) => {
      if (extractParams(snippet.command).length > 0) {
        setDialog({ kind: 'params', snippet })
      } else {
        sendToTarget(toTerminalInput(snippet.command, snippet.autoRun))
      }
    },
    [sendToTarget]
  )

  // Uygulama kısayolları; terminalden önce yakalanır ki kabuğa gitmesin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (dialog || !isAppShortcut(e)) return
      let handled = true
      if (e.code === 'KeyF') {
        setSidebarOpen(true)
        savePref('sidebar.open', true)
        requestAnimationFrame(() => sidebarRef.current?.focusSearch())
      } else if (e.code === 'KeyN') {
        setDialog({ kind: 'editor' })
      } else if (e.code === 'KeyB') {
        setSidebarOpen((open) => {
          savePref('sidebar.open', !open)
          return !open
        })
      } else if (/^Digit[1-4]$/.test(e.code)) {
        const index = Number(e.code.slice(5)) - 1
        if (index < visibleCount) focusPane(index)
      } else {
        handled = false
      }
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dialog, visibleCount, focusPane])

  const startSidebarResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing')
    let width = sidebarWidth
    const move = (ev: PointerEvent): void => {
      width = Math.min(640, Math.max(220, ev.clientX))
      setSidebarWidth(width)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('is-resizing')
      savePref('sidebar.width', width)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  if (store.error) {
    return (
      <div className="splash">
        <h1>Veriler yüklenemedi</h1>
        <p className="muted">{store.error}</p>
      </div>
    )
  }
  if (!data) return <div className="splash" />

  const categoryNameTaken = (name: string, exceptId?: string): string | null =>
    data.categories.some((c) => c.id !== exceptId && c.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))
      ? 'Bu adda bir kategori zaten var'
      : null

  const askNewCategory = (): void =>
    setDialog({
      kind: 'prompt',
      title: 'Yeni kategori',
      label: 'Kategori adı',
      confirmLabel: 'Oluştur',
      validate: (v) => categoryNameTaken(v),
      onSubmit: (v) => store.addCategory(v)
    })

  const askRenameCategory = (category: Category): void =>
    setDialog({
      kind: 'prompt',
      title: 'Kategoriyi yeniden adlandır',
      label: 'Kategori adı',
      initialValue: category.name,
      confirmLabel: 'Kaydet',
      validate: (v) => categoryNameTaken(v, category.id),
      onSubmit: (v) => store.renameCategory(category.id, v)
    })

  const askDeleteCategory = (category: Category): void => {
    const count = data.snippets.filter((s) => s.categoryId === category.id).length
    setDialog({
      kind: 'confirm',
      title: 'Kategoriyi sil',
      message:
        count > 0
          ? `“${category.name}” kategorisi ve içindeki ${count} snippet kalıcı olarak silinecek.`
          : `“${category.name}” kategorisi silinecek.`,
      confirmLabel: 'Sil',
      onConfirm: () => store.deleteCategory(category.id)
    })
  }

  const askDeleteSnippet = (snippet: Snippet): void =>
    setDialog({
      kind: 'confirm',
      title: "Snippet'i sil",
      message: `“${snippet.name}” kalıcı olarak silinecek.`,
      confirmLabel: 'Sil',
      onConfirm: () => store.deleteSnippet(snippet.id)
    })

  const doImport = async (): Promise<void> => {
    try {
      const outcome = await window.zortex.data.importSnippets(data)
      if (!outcome) return
      store.replaceData(outcome.data)
      const { snippetsAdded, categoriesAdded } = outcome.result
      notify(
        snippetsAdded + categoriesAdded === 0
          ? 'Yeni snippet bulunamadı; hepsi zaten mevcut'
          : `${snippetsAdded} snippet ve ${categoriesAdded} kategori içe aktarıldı`,
        'success'
      )
    } catch (e) {
      notify(`İçe aktarılamadı: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const doExport = async (): Promise<void> => {
    try {
      const path = await window.zortex.data.exportSnippets(data)
      if (path) notify(`Dışa aktarıldı: ${path}`, 'success')
    } catch (e) {
      notify(`Dışa aktarılamadı: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button
            className={`icon-btn${sidebarOpen ? ' is-active' : ''}`}
            onClick={() => {
              setSidebarOpen(!sidebarOpen)
              savePref('sidebar.open', !sidebarOpen)
            }}
            title={`Kenar çubuğu (${shortcutLabel('B')})`}
            aria-label="Kenar çubuğunu aç/kapat"
          >
            <PanelLeft size={16} />
          </button>
          <img className="brand-mark" src={appIconUrl} alt="" aria-hidden draggable={false} />
          <span className="brand-name">Zortex</span>
        </div>
        <div className="topbar-center">
          <div className="segmented" role="radiogroup" aria-label="Terminal yerleşimi">
            {LAYOUTS.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                className={`segmented-btn${layout === mode ? ' is-active' : ''}`}
                onClick={() => setLayout(mode)}
                title={label}
                aria-label={label}
                role="radio"
                aria-checked={layout === mode}
                data-testid={`layout-${mode}`}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-right">
          <button
            className="icon-btn"
            onClick={() => setDialog({ kind: 'settings' })}
            title="Ayarlar"
            aria-label="Ayarlar"
            data-testid="open-settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      <main className="workspace">
        {sidebarOpen && (
          <>
            <div className="sidebar-wrap" style={{ width: sidebarWidth }}>
              <Sidebar
                ref={sidebarRef}
                categories={data.categories}
                snippets={data.snippets}
                targetLabel={targetLabel}
                onRun={runSnippet}
                onNewSnippet={(categoryId) => setDialog({ kind: 'editor', categoryId })}
                onEditSnippet={(snippet) => setDialog({ kind: 'editor', snippet })}
                onDuplicateSnippet={(snippet) => store.duplicateSnippet(snippet.id)}
                onDeleteSnippet={askDeleteSnippet}
                onNewCategory={askNewCategory}
                onRenameCategory={askRenameCategory}
                onDeleteCategory={askDeleteCategory}
                onReorder={store.reorderSnippets}
                onInfo={(message) => notify(message, 'info')}
              />
            </div>
            <div className="sidebar-resizer" onPointerDown={startSidebarResize} role="separator" aria-orientation="vertical" />
          </>
        )}
        <TerminalGrid
          layout={layout}
          focusedIndex={targetIndex}
          mountedCount={mountedCount}
          shellId={data.settings.shellId}
          fontSize={data.settings.fontSize}
          cdSuggest={data.settings.cdSuggest}
          onFocusPane={setFocusedIndex}
        />
      </main>

      {dialog?.kind === 'editor' && (
        <SnippetEditor
          snippet={dialog.snippet}
          categories={data.categories}
          defaultCategoryId={dialog.categoryId}
          onClose={() => setDialog(null)}
          onSave={(draft, newCategoryName) => {
            const categoryId = newCategoryName ? store.addCategory(newCategoryName).id : draft.categoryId
            store.saveSnippet({ ...draft, categoryId }, dialog.snippet?.id)
            notify(dialog.snippet ? 'Snippet güncellendi' : 'Snippet eklendi', 'success')
          }}
        />
      )}
      {dialog?.kind === 'params' && (
        <ParamPrompt
          snippet={dialog.snippet}
          targetLabel={targetLabel}
          history={data.paramHistory[dialog.snippet.id]}
          onClose={() => setDialog(null)}
          onRun={(values) => {
            store.rememberParams(dialog.snippet.id, values)
            const command = fillParams(dialog.snippet.command, values)
            // Pencere kapanıp odak geri döndükten sonra gönder ki terminal odakta kalsın.
            requestAnimationFrame(() => sendToTarget(toTerminalInput(command, dialog.snippet.autoRun)))
          }}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger
          onConfirm={dialog.onConfirm}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'prompt' && (
        <PromptDialog
          title={dialog.title}
          label={dialog.label}
          initialValue={dialog.initialValue}
          confirmLabel={dialog.confirmLabel}
          validate={dialog.validate}
          onSubmit={dialog.onSubmit}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          settings={data.settings}
          onChange={store.updateSettings}
          onImport={() => void doImport()}
          onExport={() => void doExport()}
          onClose={() => setDialog(null)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
