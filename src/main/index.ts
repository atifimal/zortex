import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { PtyManager } from './pty'
import { DataStore, resolveDataDir } from './store'
import { listShells } from './shells'
import { mergeData, sanitizeData } from '../shared/data'
import type { AppData } from '../shared/types'
import { IPC, type PtyCreateOptions } from '../preload/api'
import appIcon from '../../resources/icon.png?asset'

const isMac = process.platform === 'darwin'
const ptys = new PtyManager()
let store: DataStore
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Zortex',
    backgroundColor: '#0d1016',
    autoHideMenuBar: true,
    // Windows/Linux görev çubuğu ikonu (paketlenmiş exe'de de pencere ikonu bundan gelir).
    ...(isMac ? {} : { icon: appIcon }),
    // Başlık çubuğu uygulamanın üst şeridiyle birleşir; pencere düğmeleri işletim sistemince çizilir.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#11151d', symbolColor: '#aab3c5', height: 40 }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  mainWindow = win

  win.once('ready-to-show', () => win.show())

  // Uygulama içinde başka bir sayfaya gidilmesini veya yeni pencere açılmasını engelle.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const contents = win.webContents
  win.on('closed', () => {
    ptys.killOwnedBy(contents)
    if (mainWindow === win) mainWindow = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openExternalSafe(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') void shell.openExternal(url)
  } catch {
    // geçersiz adres
  }
}

/** Yalnızca uygulamanın kendi penceresinden gelen IPC isteklerini kabul et. */
function trusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return BrowserWindow.fromWebContents(event.sender) !== null && event.senderFrame === event.sender.mainFrame
}

function isString(v: unknown, max = 1_000_000): v is string {
  return typeof v === 'string' && v.length <= max
}
function isDim(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10_000
}

function registerIpc(): void {
  ipcMain.handle(IPC.ptyCreate, (event, opts: PtyCreateOptions) => {
    if (!trusted(event)) throw new Error('untrusted')
    if (!isString(opts?.id, 64) || !isDim(opts.cols) || !isDim(opts.rows)) throw new Error('Geçersiz terminal isteği')
    const shellInfo = ptys.create(event.sender, opts.id, opts.cols, opts.rows, isString(opts.shellId, 512) ? opts.shellId : '')
    return { shell: shellInfo }
  })
  ipcMain.on(IPC.ptyWrite, (event, id: unknown, data: unknown) => {
    if (trusted(event) && isString(id, 64) && isString(data)) ptys.write(id, data)
  })
  ipcMain.on(IPC.ptyResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    if (trusted(event) && isString(id, 64) && isDim(cols) && isDim(rows)) ptys.resize(id, cols, rows)
  })
  ipcMain.on(IPC.ptyKill, (event, id: unknown) => {
    if (trusted(event) && isString(id, 64)) ptys.kill(id)
  })

  ipcMain.handle(IPC.dataLoad, (event) => {
    if (!trusted(event)) throw new Error('untrusted')
    return store.load()
  })
  ipcMain.handle(IPC.dataSave, (event, data: AppData) => {
    if (!trusted(event)) throw new Error('untrusted')
    store.save(data)
  })
  ipcMain.handle(IPC.dataLocation, (event) => {
    if (!trusted(event)) throw new Error('untrusted')
    return store.dir
  })
  ipcMain.handle(IPC.dataOpenLocation, async (event) => {
    if (!trusted(event)) throw new Error('untrusted')
    await shell.openPath(store.dir)
  })

  ipcMain.handle(IPC.dataExport, async (event, data: AppData) => {
    if (!trusted(event) || !mainWindow) throw new Error('untrusted')
    const stamp = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Snippet'leri dışa aktar",
      defaultPath: `zortex-snippets-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    const clean = sanitizeData(data)
    const payload = { version: 1, categories: clean.categories, snippets: clean.snippets }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
    return filePath
  })

  ipcMain.handle(IPC.dataImport, async (event, current: AppData) => {
    if (!trusted(event) || !mainWindow) throw new Error('untrusted')
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Snippet'leri içe aktar",
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || filePaths.length === 0) return null
    const incoming = sanitizeData(JSON.parse(await readFile(filePaths[0], 'utf8')))
    return mergeData(sanitizeData(current), incoming)
  })

  ipcMain.handle(IPC.shellsList, (event) => {
    if (!trusted(event)) throw new Error('untrusted')
    return listShells()
  })

  ipcMain.handle(IPC.clipboardRead, (event) => {
    if (!trusted(event)) throw new Error('untrusted')
    return clipboard.readText()
  })
  ipcMain.on(IPC.clipboardWrite, (event, text: unknown) => {
    if (trusted(event) && isString(text, 10_000_000)) clipboard.writeText(text)
  })
  ipcMain.on(IPC.openExternal, (event, url: unknown) => {
    if (trusted(event) && isString(url, 4096)) openExternalSafe(url)
  })
}

function buildMenu(): void {
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }
  // macOS'ta Cmd+C / Cmd+V / Cmd+Q gibi kısayollar uygulama menüsü üzerinden çalışır.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'Görünüm',
        submenu: [
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(app.isPackaged ? [] : ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as const))
        ]
      },
      { role: 'windowMenu' }
    ])
  )
}

// Portable modda Chromium önbelleği ve tercihleri de veri klasöründe tutulur; sistemde iz bırakılmaz.
if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.ZORTEX_DATA_DIR) {
  app.setPath('userData', join(resolveDataDir(), '.electron'))
}

// Testler kendi veri klasörüyle çalışır ve açık bir Zortex penceresine takılmamalıdır.
const singleInstance = process.env.ZORTEX_DATA_DIR ? true : app.requestSingleInstanceLock()

if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    store = new DataStore()
    registerIpc()
    buildMenu()
    // Paketlenmiş macOS uygulaması .icns kullanır; geliştirmede Dock'ta Electron ikonu yerine bu görünür.
    if (isMac && !app.isPackaged) app.dock?.setIcon(appIcon)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    ptys.killAll()
    if (!isMac) app.quit()
  })

  app.on('before-quit', () => ptys.killAll())
}
