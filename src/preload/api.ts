import type { AppData, ImportResult, Platform, ShellInfo } from '../shared/types'

export interface PtyCreateOptions {
  id: string
  cols: number
  rows: number
  shellId: string
}

export interface ZortexApi {
  platform: Platform
  pty: {
    create(options: PtyCreateOptions): Promise<{ shell: ShellInfo }>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(id: string, listener: (data: string) => void): () => void
    onExit(id: string, listener: (exitCode: number) => void): () => void
  }
  data: {
    load(): Promise<AppData>
    save(data: AppData): Promise<void>
    exportSnippets(data: AppData): Promise<string | null>
    importSnippets(current: AppData): Promise<{ data: AppData; result: ImportResult } | null>
    location(): Promise<string>
    openLocation(): Promise<void>
  }
  shells: {
    list(): Promise<ShellInfo[]>
  }
  clipboard: {
    readText(): Promise<string>
    writeText(text: string): void
  }
  openExternal(url: string): void
}

export const IPC = {
  ptyCreate: 'pty:create',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  dataLoad: 'data:load',
  dataSave: 'data:save',
  dataExport: 'data:export',
  dataImport: 'data:import',
  dataLocation: 'data:location',
  dataOpenLocation: 'data:open-location',
  shellsList: 'shells:list',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
  openExternal: 'open-external'
} as const
