import type { ShellKind } from './shell'

/** Komut önerisi listesindeki bir öğe. */
export interface CommandEntry {
  name: string
  kind: 'exec' | 'builtin' | 'alias' | 'cmdlet' | 'function'
  /** Takma adın hedefi ya da programın tam yolu. */
  detail?: string
}

const POSIX = [
  'alias', 'bg', 'bind', 'break', 'builtin', 'cd', 'command', 'continue', 'declare', 'dirs', 'disown', 'echo', 'eval',
  'exec', 'exit', 'export', 'false', 'fc', 'fg', 'getopts', 'hash', 'help', 'history', 'jobs', 'kill', 'let', 'local',
  'logout', 'popd', 'printf', 'pushd', 'pwd', 'read', 'readonly', 'return', 'set', 'shift', 'source', 'test', 'times',
  'trap', 'true', 'type', 'typeset', 'ulimit', 'umask', 'unalias', 'unset', 'wait', 'which'
]

const CMD = [
  'assoc', 'call', 'cd', 'chdir', 'cls', 'color', 'copy', 'date', 'del', 'dir', 'echo', 'endlocal', 'erase', 'exit',
  'for', 'ftype', 'goto', 'if', 'md', 'mkdir', 'mklink', 'move', 'path', 'pause', 'popd', 'prompt', 'pushd', 'rd',
  'rem', 'ren', 'rename', 'rmdir', 'set', 'setlocal', 'shift', 'start', 'time', 'title', 'type', 'ver', 'verify', 'vol'
]

/** PowerShell'in dil anahtar sözcükleri (cmdlet listesi kabuğun kendisinden alınır). */
const PWSH = ['exit', 'foreach', 'function', 'if', 'return', 'switch', 'throw', 'try', 'while']

export function builtinCommands(kind: ShellKind): CommandEntry[] {
  const names = kind === 'cmd' ? CMD : kind === 'pwsh' ? PWSH : POSIX
  return names.map((name) => ({ name, kind: 'builtin' }))
}
