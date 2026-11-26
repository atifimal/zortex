/** Kabuk türü ve çalışma klasörüyle ilgili saf yardımcılar. */

export type ShellKind = 'posix' | 'pwsh' | 'cmd'

export function shellKindOf(shellId: string): ShellKind {
  const id = shellId.toLowerCase()
  if (id === 'cmd') return 'cmd'
  if (id === 'pwsh' || id === 'powershell' || id.endsWith('/pwsh')) return 'pwsh'
  return 'posix'
}

/** Git Bash (MSYS) yollarını Windows yoluna çevirmek gerekir mi? */
export const isMsysShell = (shellId: string): boolean => shellId === 'git-bash'

/**
 * MSYS yolunu (`/c/Users/x`, `/usr/bin`) Windows yoluna çevirir.
 * @param root MSYS kök klasörünün Windows yolu (`pwd -W` ile `/` için alınır).
 */
export function msysToWindows(path: string, root: string | null): string {
  const drive = /^\/([A-Za-z])(\/|$)(.*)$/.exec(path)
  if (drive) return `${drive[1].toUpperCase()}:\\${drive[3].replace(/\//g, '\\')}`
  if (path.startsWith('/') && root) return (root.replace(/[\\/]+$/, '') + path).replace(/\//g, '\\')
  return path
}

/**
 * Windows'ta kabuğun bulunduğu klasörü istem metninden çıkarır:
 * PowerShell varsayılan istemi `PS C:\yol> `, cmd istemi `C:\yol>`.
 */
export function cwdFromPrompt(promptText: string, kind: ShellKind): string | null {
  if (kind === 'pwsh') {
    const m = /PS ((?:[A-Za-z]:|\\\\)[^>]*?|[\w.]+\\FileSystem::[^>]*?)>+\s*$/.exec(promptText)
    // `Microsoft.PowerShell.Core\FileSystem::C:\yol` biçimindeki sağlayıcı yolu sadeleştirilir.
    return m ? m[1].replace(/^.*FileSystem::/, '') : null
  }
  if (kind === 'cmd') {
    const m = /^\s*((?:[A-Za-z]:|\\\\)[^>]*)>\s*$/.exec(promptText)
    return m ? m[1] : null
  }
  return null
}

/** OSC 7 (`file://host/yol`) veya OSC 9;9 (`"C:\yol"`) ile bildirilen klasörü çözer. */
export function cwdFromOsc(code: 7 | 9, data: string, platform: string): string | null {
  if (code === 9) {
    if (!data.startsWith('9;')) return null
    const value = data.slice(2).replace(/^"(.*)"$/, '$1')
    return value || null
  }
  try {
    const url = new URL(data)
    if (url.protocol !== 'file:') return null
    let path = decodeURIComponent(url.pathname)
    if (platform === 'win32' && /^\/[A-Za-z]:/.test(path)) path = path.slice(1).replace(/\//g, '\\')
    return path || null
  } catch {
    return null
  }
}

export const SPECIAL_DIRS = ['.', '..', '~'] as const

/** `cd` listesinin en üstünde gösterilecek özel klasörler (yazılana uyanlar). */
export function specialDirsFor(path: string, kind: ShellKind): string[] {
  if (/[\\/]/.test(path)) return []
  return SPECIAL_DIRS.filter((d) => (kind !== 'cmd' || d !== '~') && d.startsWith(path))
}
