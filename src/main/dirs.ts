import { execFile } from 'node:child_process'
import { readdir, readlink, stat } from 'node:fs/promises'
import os from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { splitPath, type ShellKind } from '../shared/cd'

const MAX_ENTRIES = 300
const collator = new Intl.Collator('tr-TR', { sensitivity: 'base', numeric: true })

function expandHome(path: string): string {
  if (path === '~') return os.homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(os.homedir(), path.slice(2))
  return path
}

/**
 * `cwd` içinde, yazılan yolun (`path`) klasör kısmındaki alt klasörleri listeler;
 * son parçayla başlayanları (büyük/küçük harf duyarsız) döndürür.
 * Gizli (nokta ile başlayan) klasörler yalnızca önek nokta ile başlıyorsa gösterilir.
 */
export async function listDirs(cwd: string, path: string, kind: ShellKind): Promise<string[]> {
  const { dir, prefix } = splitPath(path, kind)
  const dirPath = expandHome(dir) || '.'
  const base = isAbsolute(dirPath) ? resolve(dirPath) : resolve(cwd, dirPath)
  const lower = prefix.toLocaleLowerCase('tr-TR')
  const showHidden = prefix.startsWith('.')

  let entries
  try {
    entries = await readdir(base, { withFileTypes: true })
  } catch {
    return []
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) continue
    if (!entry.name.toLocaleLowerCase('tr-TR').startsWith(lower)) continue
    let isDir = entry.isDirectory()
    if (!isDir && entry.isSymbolicLink()) {
      isDir = await stat(join(base, entry.name)).then(
        (s) => s.isDirectory(),
        () => false
      )
    }
    if (isDir) names.push(entry.name)
  }
  return names.sort(collator.compare).slice(0, MAX_ENTRIES)
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
