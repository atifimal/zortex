import type { AppData, ImportResult, Platform, ShellInfo } from '../shared/types'
import type { ShellKind } from '../shared/shell'
import type { CommandEntry } from '../shared/builtins'

export interface PtyCreateOptions {
  id: string
  cols: number
  rows: number
  shellId: string
  /** Kabuk entegrasyonu (OSC bildirimleri) etkinleştirilsin mi. */
  integration: boolean
}

export interface FsEntry {
  name: string
  isDir: boolean
  isLink: boolean
  /** Çalıştırılabilir dosya (Unix'te x izni, Windows'ta PATHEXT uzantısı). */
  isExec: boolean
  size: number
  mtime: number
  /** Unix izin bitleri; Windows'ta 0. */
  mode: number
}

export interface ExecRequest {
  command: string
  args: string[]
  /** Boşsa ev klasörü. */
  cwd: string
  /** Kabuğun bildirdiği PATH; yoksa uygulamanınki. */
  pathEnv: string | null
  timeout?: number
}

export interface ExecResult {
  stdout: string
  stderr: string
  status: number
}

export interface ZortexApi {
  platform: Platform
  pty: {
    create(options: PtyCreateOptions): Promise<{ shell: ShellInfo; integrated: boolean }>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(id: string, listener: (data: string) => void): () => void
    onExit(id: string, listener: (exitCode: number) => void): () => void
    /** Kabuğun çalışma klasörü (yalnızca macOS/Linux; bilinemiyorsa null). */
    cwd(id: string): Promise<string | null>
  }
  completion: {
    /** `cwd`e göre `dir` klasörünü çözer ve içindekileri ayrıntılarıyla listeler. */
    listDir(req: { cwd: string; dir: string; msysRoot: string | null }): Promise<{ path: string; entries: FsEntry[] }>
    /** PATH'teki programlar ve PowerShell'de cmdlet/takma adlar. */
    commands(req: {
      kind: ShellKind
      shellPath: string
      pathEnv: string | null
      msysRoot: string | null
    }): Promise<{ entries: CommandEntry[]; complete: boolean }>
    /** Tamamlama spec'lerinin üreticileri için kabuksuz, zaman aşımlı komut çalıştırır (`git branch` vb.). */
    exec(req: ExecRequest): Promise<ExecResult>
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
  ptyCwd: 'pty:cwd',
  completionListDir: 'completion:list-dir',
  completionCommands: 'completion:commands',
  completionExec: 'completion:exec',
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
