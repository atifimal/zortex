import { existsSync, readFileSync } from 'node:fs'
import { basename, delimiter, join } from 'node:path'
import type { ShellInfo } from '../shared/types'

function findInPath(exe: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, exe)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function windowsShells(): ShellInfo[] {
  const shells: ShellInfo[] = []
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'

  const pwsh = findInPath('pwsh.exe') ?? [join(programFiles, 'PowerShell', '7', 'pwsh.exe')].find(existsSync)
  if (pwsh) shells.push({ id: 'pwsh', name: 'PowerShell 7', path: pwsh, args: ['-NoLogo'] })

  const winPs = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (existsSync(winPs)) shells.push({ id: 'powershell', name: 'Windows PowerShell', path: winPs, args: ['-NoLogo'] })

  const cmd = process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe')
  if (existsSync(cmd)) shells.push({ id: 'cmd', name: 'Komut İstemi (cmd)', path: cmd, args: [] })

  const gitBash = [join(programFiles, 'Git', 'bin', 'bash.exe'), join(programFiles + ' (x86)', 'Git', 'bin', 'bash.exe')].find(
    existsSync
  )
  if (gitBash) shells.push({ id: 'git-bash', name: 'Git Bash', path: gitBash, args: ['--login', '-i'] })

  const wsl = join(systemRoot, 'System32', 'wsl.exe')
  if (existsSync(wsl)) shells.push({ id: 'wsl', name: 'WSL', path: wsl, args: [] })

  return shells
}

const SHELL_NAMES: Record<string, string> = { zsh: 'zsh', bash: 'bash', fish: 'fish', sh: 'sh', nu: 'Nushell', pwsh: 'PowerShell' }

function unixShells(): ShellInfo[] {
  const paths = new Set<string>()
  const login = process.env.SHELL
  if (login && existsSync(login)) paths.add(login)
  try {
    for (const line of readFileSync('/etc/shells', 'utf8').split('\n')) {
      const p = line.trim()
      if (p && !p.startsWith('#') && existsSync(p)) paths.add(p)
    }
  } catch {
    // /etc/shells bulunamazsa yalnızca $SHELL ve bilinen yollar kullanılır.
  }
  for (const p of ['/bin/zsh', '/bin/bash', '/bin/sh']) if (existsSync(p)) paths.add(p)

  const shells: ShellInfo[] = []
  const usedIds = new Set<string>()
  for (const p of paths) {
    const base = basename(p)
    let id = base
    if (usedIds.has(id)) id = p
    usedIds.add(id)
    const label = SHELL_NAMES[base] ?? base
    shells.push({ id, name: p === login ? `${label} (varsayılan)` : `${label} — ${p}`, path: p, args: ['-l'] })
  }
  return shells
}

let cache: ShellInfo[] | undefined

export function listShells(): ShellInfo[] {
  cache ??= process.platform === 'win32' ? windowsShells() : unixShells()
  return cache
}

export function resolveShell(shellId: string): ShellInfo {
  const shells = listShells()
  const chosen = shells.find((s) => s.id === shellId) ?? shells[0]
  if (chosen) return chosen
  return process.platform === 'win32'
    ? { id: 'cmd', name: 'cmd', path: 'cmd.exe', args: [] }
    : { id: 'sh', name: 'sh', path: '/bin/sh', args: ['-l'] }
}
