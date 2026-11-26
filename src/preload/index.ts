import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ZortexApi } from './api'
import type { Platform } from '../shared/types'

type Listener<T> = (value: T) => void

const dataListeners = new Map<string, Set<Listener<string>>>()
const exitListeners = new Map<string, Set<Listener<number>>>()

ipcRenderer.on(IPC.ptyData, (_event, id: string, data: string) => {
  dataListeners.get(id)?.forEach((l) => l(data))
})
ipcRenderer.on(IPC.ptyExit, (_event, id: string, code: number) => {
  exitListeners.get(id)?.forEach((l) => l(code))
})

function subscribe<T>(map: Map<string, Set<Listener<T>>>, id: string, listener: Listener<T>): () => void {
  let set = map.get(id)
  if (!set) {
    set = new Set()
    map.set(id, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) map.delete(id)
  }
}

const api: ZortexApi = {
  platform: process.platform as Platform,
  pty: {
    create: (options) => ipcRenderer.invoke(IPC.ptyCreate, options),
    write: (id, data) => ipcRenderer.send(IPC.ptyWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, id, cols, rows),
    kill: (id) => ipcRenderer.send(IPC.ptyKill, id),
    onData: (id, listener) => subscribe(dataListeners, id, listener),
    onExit: (id, listener) => subscribe(exitListeners, id, listener),
    cwd: (id) => ipcRenderer.invoke(IPC.ptyCwd, id)
  },
  completion: {
    listDir: (req) => ipcRenderer.invoke(IPC.completionListDir, req),
    commands: (req) => ipcRenderer.invoke(IPC.completionCommands, req),
    exec: (req) => ipcRenderer.invoke(IPC.completionExec, req)
  },
  data: {
    load: () => ipcRenderer.invoke(IPC.dataLoad),
    save: (data) => ipcRenderer.invoke(IPC.dataSave, data),
    exportSnippets: (data) => ipcRenderer.invoke(IPC.dataExport, data),
    importSnippets: (current) => ipcRenderer.invoke(IPC.dataImport, current),
    location: () => ipcRenderer.invoke(IPC.dataLocation),
    openLocation: () => ipcRenderer.invoke(IPC.dataOpenLocation)
  },
  shells: {
    list: () => ipcRenderer.invoke(IPC.shellsList)
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(IPC.clipboardRead),
    writeText: (text) => ipcRenderer.send(IPC.clipboardWrite, text)
  },
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url)
}

contextBridge.exposeInMainWorld('zortex', api)
