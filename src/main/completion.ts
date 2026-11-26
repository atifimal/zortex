import { execFile } from 'node:child_process'
import { readdir, readlink, stat, lstat } from 'node:fs/promises'
import os from 'node:os'
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path'
import { msysToWindows, type ShellKind } from '../shared/shell'
import type { CommandEntry } from '../shared/builtins'
import type { FsEntry } from '../preload/api'


export interface ListDirRequest {
  cwd: string
  /** Kullanıcının yazdığı klasör kısmı (`src/`, `~/`, `C:\`, Git Bash'te `/c/`); boşsa `cwd`. */
  dir: string
  /** Git Bash için MSYS kökünün Windows yolu; diğer kabuklarda null. */
  msysRoot: string | null
}

export interface CommandsRequest {
  kind: ShellKind
  shellPath: string
  /** Kabuğun bildirdiği PATH; yoksa uygulamanın PATH'i kullanılır. */
  pathEnv: string | null
  msysRoot: string | null
}

const MAX_ENTRIES = 3000
const isWin = process.platform === 'win32'

function pathExts(kind: ShellKind): Set<string> {
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').toLowerCase().split(';').filter(Boolean)
  if (kind === 'pwsh') exts.push('.ps1')
  return new Set(exts)
}

function expandHome(path: string): string {
  if (path === '~' || path === '~/' || path === '~\\') return os.homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(os.homedir(), path.slice(2))
  return path
}

/** İstenen klasörü çözer ve içindekileri (gizliler dahil) ayrıntılarıyla listeler. */
export async function listDir(req: ListDirRequest): Promise<{ path: string; entries: FsEntry[] }> {
  let dir = expandHome(req.dir)
  if (req.msysRoot !== null && dir.startsWith('/')) dir = msysToWindows(dir, req.msysRoot)
  const path = dir && isAbsolute(dir) ? resolve(dir) : resolve(req.cwd, dir || '.')
  let dirents
  try {
    dirents = (await readdir(path, { withFileTypes: true })).slice(0, MAX_ENTRIES)
  } catch {
    return { path, entries: [] }
  }
  const exts = pathExts('pwsh')
  const entries = await Promise.all(
    dirents.map(async (d): Promise<FsEntry | null> => {
      const full = join(path, d.name)
      try {
        const link = d.isSymbolicLink()
        const info = link ? await stat(full).catch(() => lstat(full)) : await lstat(full)
        const isDir = info.isDirectory()
        const isExec = !isDir && (isWin ? exts.has(extname(d.name).toLowerCase()) : (info.mode & 0o111) !== 0)
        return { name: d.name, isDir, isLink: link, isExec, size: info.size, mtime: info.mtimeMs, mode: isWin ? 0 : info.mode }
      } catch {
        return null
      }
    })
  )
  return { path, entries: entries.filter((e): e is FsEntry => e !== null) }
}

// ---------- Komutlar ----------

const pwshScript = (importedOnly: boolean): string =>
  [
    `Get-Command -CommandType Alias,Function,Cmdlet${importedOnly ? ' -ListImported' : ''} -ErrorAction SilentlyContinue | ForEach-Object {`,
    "  $d = if ($_.CommandType -eq 'Alias') { $_.Definition } else { '' }",
    '  "{0}`t{1}`t{2}" -f $_.Name, $_.CommandType, $d',
    '}'
  ].join('\n')

function runPwsh(shellPath: string, importedOnly: boolean): Promise<CommandEntry[]> {
  const encoded = Buffer.from(pwshScript(importedOnly), 'utf16le').toString('base64')
  return new Promise((done) => {
    execFile(
      shellPath,
      ['-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', encoded],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error && !stdout) return done([])
        const entries: CommandEntry[] = []
        for (const line of stdout.split(/\r?\n/)) {
          const [name, type, definition] = line.split('\t')
          if (!name || !type) continue
          const kind = type === 'Alias' ? 'alias' : type === 'Function' ? 'function' : 'cmdlet'
          entries.push(definition ? { name, kind, detail: definition } : { name, kind })
        }
        done(entries)
      }
    )
  })
}

const pwshFull = new Map<string, CommandEntry[]>()
const pwshFullPending = new Map<string, Promise<CommandEntry[]>>()
const pwshImported = new Map<string, Promise<CommandEntry[]>>()

/**
 * PowerShell'in cmdlet, fonksiyon ve takma adları (profil yüklenmeden).
 * Tüm modülleri taramak ilk seferde (modül önbelleği yokken) uzun sürebildiğinden, tam liste hazır
 * olana dek yalnızca yüklü modüllerin listesi verilir.
 */
async function pwshCommands(shellPath: string): Promise<{ list: CommandEntry[]; complete: boolean }> {
  const full = pwshFull.get(shellPath)
  if (full) return { list: full, complete: true }
  let pending = pwshFullPending.get(shellPath)
  if (!pending) {
    pending = runPwsh(shellPath, false)
    pwshFullPending.set(shellPath, pending)
    void pending.then((list) => {
      pwshFullPending.delete(shellPath)
      if (list.length > 0) pwshFull.set(shellPath, list)
    })
  }
  let imported = pwshImported.get(shellPath)
  if (!imported) {
    imported = runPwsh(shellPath, true)
    pwshImported.set(shellPath, imported)
    void imported.then((list) => list.length === 0 && pwshImported.delete(shellPath))
  }
  return Promise.race([
    pending.then((list) => ({ list, complete: list.length > 0 })),
    imported.then((list) => ({ list, complete: false }))
  ])
}

async function pathExecutables(req: CommandsRequest): Promise<CommandEntry[]> {
  const raw = req.pathEnv ?? process.env.PATH ?? ''
  const dirs =
    req.msysRoot !== null
      ? raw.split(':').filter(Boolean).map((p) => msysToWindows(p, req.msysRoot))
      : raw.split(delimiter).filter(Boolean)
  const exts = pathExts(req.kind)
  const seen = new Set<string>()
  const result: CommandEntry[] = []

  const perDir = await Promise.all(
    [...new Set(dirs)].map(async (dir) => {
      try {
        const dirents = await readdir(dir, { withFileTypes: true })
        const found: CommandEntry[] = []
        for (const d of dirents) {
          if (d.isDirectory()) continue
          const full = join(dir, d.name)
          if (isWin) {
            const ext = extname(d.name).toLowerCase()
            // Git Bash'te uzantısız betikler de çalışır; diğerlerinde PATHEXT gerekir.
            if (!exts.has(ext) && !(req.msysRoot !== null && ext === '')) continue
            found.push({ name: exts.has(ext) ? d.name.slice(0, -ext.length) : d.name, kind: 'exec', detail: full })
          } else {
            const info = await stat(full).catch(() => null)
            if (info?.isFile() && (info.mode & 0o111) !== 0) found.push({ name: d.name, kind: 'exec', detail: full })
          }
        }
        return found
      } catch {
        return []
      }
    })
  )
  // PATH sırası korunur: aynı ad için öndeki klasör kazanır.
  for (const list of perDir) {
    for (const entry of list) {
      const key = isWin ? entry.name.toLowerCase() : entry.name
      if (seen.has(key)) continue
      seen.add(key)
      result.push(entry)
    }
  }
  return result
}

const commandCache = new Map<string, { at: number; value: Promise<CommandList> }>()
const COMMAND_CACHE_MS = 30_000

export interface CommandList {
  entries: CommandEntry[]
  /** false: PowerShell'in tam listesi henüz hazır değil; kısa süre sonra yeniden istenmeli. */
  complete: boolean
}

/** PATH'teki programlar ve (PowerShell'de) cmdlet/fonksiyon/takma adlar. */
export function listCommands(req: CommandsRequest): Promise<CommandList> {
  const key = JSON.stringify(req)
  const hit = commandCache.get(key)
  if (hit && Date.now() - hit.at < COMMAND_CACHE_MS) return hit.value
  const value = Promise.all([
    req.kind === 'pwsh' && req.shellPath ? pwshCommands(req.shellPath) : { list: [], complete: true },
    pathExecutables(req)
  ]).then(([shell, exes]) => ({ entries: [...shell.list, ...exes], complete: shell.complete }))
  commandCache.set(key, { at: Date.now(), value })
  // Eksik liste önbellekte tutulmaz.
  void value.then((v) => !v.complete && commandCache.delete(key))
  if (commandCache.size > 20) commandCache.delete(commandCache.keys().next().value!)
  return value
}

/** Unix'te bir sürecin çalışma klasörü. Windows'ta başka bir sürecin klasörü okunamaz. */
export async function processCwd(pid: number): Promise<string | null> {
  if (process.platform === 'linux') return readlink(`/proc/${pid}/cwd`).catch(() => null)
  if (process.platform === 'darwin') {
    return new Promise((done) => {
      execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 1500 }, (error, stdout) => {
        if (error) return done(null)
        const line = stdout.split('\n').find((l) => l.startsWith('n'))
        done(line ? line.slice(1) : null)
      })
    })
  }
  return null
}
