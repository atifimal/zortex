import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, readlink, stat, lstat } from 'node:fs/promises'
import os from 'node:os'
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path'
import { msysToWindows, type ShellKind } from '../shared/shell'
import type { CommandEntry } from '../shared/builtins'
import type { ExecRequest, ExecResult, FsEntry } from '../preload/api'

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

// ---------- Spec üreticileri için komut çalıştırma ----------

const FAILED: ExecResult = { stdout: '', stderr: '', status: 1 }
/** cmd.exe'nin yorumladığı karakterler: `.cmd/.bat` sarmalayıcılarına bunları içeren argüman verilmez. */
const CMD_META = /["&|<>^%!\r\n]/
const MAX_CAT_BYTES = 1024 * 1024

/** Windows'ta komutu PATH + PATHEXT ile bulur (`npm` → `npm.cmd`). */
function findOnWindowsPath(command: string, pathEnv: string): string | null {
  const exts = [...pathExts('cmd')]
  const hasExt = exts.includes(extname(command).toLowerCase())
  const candidates = (dir: string): string[] => (hasExt ? [join(dir, command)] : exts.map((e) => join(dir, command + e)))
  if (isAbsolute(command)) return candidates('').find(existsSync) ?? null
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    const found = candidates(dir).find(existsSync)
    if (found) return found
  }
  return null
}

/** Fig üreticilerinin sık kullandığı `ls -1ApL` çıktısını taklit eder (Windows'ta `ls` yoktur). */
async function emulateLs(cwd: string, args: string[]): Promise<ExecResult> {
  const flags = args.filter((a) => a.startsWith('-')).join('')
  const target = args.find((a) => !a.startsWith('-')) ?? '.'
  const { entries } = await listDir({ cwd, dir: target, msysRoot: null })
  const all = flags.includes('a') || flags.includes('A')
  const lines = entries
    .filter((e) => all || !e.name.startsWith('.'))
    .map((e) => (flags.includes('p') && e.isDir ? `${e.name}/` : e.name))
  return { stdout: lines.join('\n'), stderr: '', status: 0 }
}

async function emulateCat(cwd: string, files: string[]): Promise<ExecResult> {
  let stdout = ''
  for (const file of files) {
    try {
      const full = resolve(cwd, expandHome(file))
      if ((await stat(full)).size > MAX_CAT_BYTES) return FAILED
      stdout += (await readFile(full, 'utf8')).replace(/\r\n/g, '\n')
    } catch {
      return { stdout, stderr: `cat: ${file}: No such file or directory`, status: 1 }
    }
  }
  return { stdout, stderr: '', status: 0 }
}

/**
 * npm/yarn/pnpm spec'lerinin `until [[ -f package.json ]] … do cd ..; done; cat package.json` ve
 * `… node_modules/ … ls -1 node_modules/.bin/` betiklerini kabuk çalıştırmadan karşılar
 * (Windows'ta bash olmayabilir; olsa da süreç başlatmaktan çok daha hızlıdır).
 */
async function emulateFindUp(cwd: string, script: string): Promise<ExecResult | null> {
  const cat = /^until \[\[ -f ([\w.-]+) \]\] \|\| \[\[ \$PWD = '\/' \]\]; do cd \.\.; done; cat \1$/.exec(script)
  const bin = /^until \[\[ -d node_modules\/ \]\] \|\| \[\[ \$PWD = '\/' \]\]; do cd \.\.; done; ls -1 node_modules\/\.bin\/$/.test(script)
  if (!cat && !bin) return null
  let dir = resolve(cwd)
  for (;;) {
    const target = cat ? join(dir, cat[1]) : join(dir, 'node_modules')
    if (existsSync(target)) {
      if (cat) return emulateCat(dir, [cat[1]])
      // Windows'taki .cmd/.ps1 sarmalayıcıları tek ada indirgenir.
      const names = new Set((await emulateLs(join(target, '.bin'), ['-1'])).stdout.split('\n').map((n) => n.replace(/\.(cmd|ps1)$/i, '')))
      return { stdout: [...names].filter(Boolean).join('\n'), stderr: '', status: 0 }
    }
    const parent = resolve(dir, '..')
    if (parent === dir) return { stdout: '', stderr: '', status: 1 }
    dir = parent
  }
}

/**
 * Tamamlama spec'lerinin üreticileri için bir komutu kabuk kullanmadan çalıştırır
 * (ör. `git branch`, `npm run` için package.json). Yalnızca okuma amaçlı sorgular için kullanılır.
 * @param gitBash Windows'ta `bash -c …` kullanan üreticiler için Git Bash yolu.
 */
export async function execForCompletion(req: ExecRequest, gitBash: string | null): Promise<ExecResult> {
  const cwd = req.cwd || os.homedir()
  if (req.command === 'fig') return FAILED
  if (req.command === 'cat' && req.args.length > 0 && req.args.every((a) => !a.startsWith('-'))) {
    return emulateCat(cwd, req.args)
  }
  if (isWin && req.command === 'ls') return emulateLs(cwd, req.args)
  if ((req.command === 'bash' || req.command === 'sh') && req.args[0] === '-c') {
    const emulated = await emulateFindUp(cwd, req.args[1] ?? '')
    if (emulated) return emulated
  }

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  if (req.pathEnv) env[pathKey] = req.pathEnv
  // Tamamlama sırasında hiçbir komut kullanıcıdan girdi beklememeli.
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_OPTIONAL_LOCKS = '0'
  env.NO_COLOR = '1'

  let file = req.command
  let args = req.args
  let verbatim = false
  if (isWin) {
    if (req.command === 'bash' || req.command === 'sh') {
      if (!gitBash) return FAILED
      file = gitBash
    } else {
      const found = findOnWindowsPath(req.command, env[pathKey] ?? '')
      if (!found) return FAILED
      file = found
      if (/\.(cmd|bat)$/i.test(found)) {
        // Node, .cmd dosyalarını kabuksuz çalıştırmaz; cmd.exe'ye yalnızca zararsız argümanlar verilir.
        if (args.some((a) => CMD_META.test(a))) return FAILED
        const quote = (s: string): string => (/[\s]/.test(s) ? `"${s}"` : s)
        args = ['/d', '/s', '/c', `"${[found, ...req.args].map(quote).join(' ')}"`]
        file = env.ComSpec ?? 'cmd.exe'
        verbatim = true
      }
    }
  }

  return new Promise((done) => {
    const child = execFile(
      file,
      args,
      {
        cwd,
        env,
        timeout: Math.min(req.timeout ?? 5000, 15_000),
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        windowsVerbatimArguments: verbatim
      },
      (error, stdout, stderr) => {
        const status = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        // Fig üreticileri Unix satır sonları bekler (Windows'ta çıktı \r\n ile gelir).
        const lf = (s: unknown): string => String(s ?? '').replace(/\r\n/g, '\n')
        done({ stdout: lf(stdout), stderr: lf(stderr), status })
      }
    )
    child.stdin?.end()
  })
}
