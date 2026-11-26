/**
 * Terminalde `cd ` yazılırken klasör önerisi için saf yardımcılar.
 * Ekrandaki satır metninden ne yazıldığını çıkarır ve seçilen öneriyi kabuğa gönderilecek tuşlara çevirir.
 */

export type ShellKind = 'posix' | 'pwsh' | 'cmd'

export function shellKindOf(shellId: string): ShellKind {
  const id = shellId.toLowerCase()
  if (id === 'cmd') return 'cmd'
  if (id === 'pwsh' || id === 'powershell' || id.endsWith('/pwsh')) return 'pwsh'
  return 'posix'
}

export interface CdInput {
  /** İmleçten önce, komut adından sonra yazılmış ham metin (açılış tırnağı ve kaçışlar dahil). */
  raw: string
  /** Yazılan yol: tırnaksız, kaçışları çözülmüş. */
  path: string
  /** Açık bırakılmış tırnak karakteri; yoksa boş. */
  quote: '' | '"' | "'"
}

// Komuttan önce satır başı, boşluk ya da tipik istem/ayraç karakterleri gelebilir.
const PREFIX = String.raw`(?:^|[\s;&|(>$#%❯➜»λ])(?:cd|chdir|pushd|sl|set-location) +(?:\/d +)?`
const CD_RE: Record<ShellKind, RegExp> = {
  // POSIX kabuklarında boşluk vb. ters bölüyle kaçırılabilir: `cd my\ dir/`.
  posix: new RegExp(PREFIX + String.raw`("[^"]*|'[^']*|(?:\\.|[^\s"'\\])*)$`, 'i'),
  // Windows kabuklarında ters bölü klasör ayracıdır.
  pwsh: new RegExp(PREFIX + String.raw`("[^"]*|'[^']*|[^\s"']*)$`, 'i'),
  cmd: new RegExp(PREFIX + String.raw`("[^"]*|[^\s"]*)$`, 'i')
}

/** İmlece kadar olan satır metninde `cd <yol>` yazılıyorsa yazılan yolu döndürür. */
export function parseCdInput(lineBeforeCursor: string, kind: ShellKind): CdInput | null {
  const m = CD_RE[kind].exec(lineBeforeCursor)
  if (!m) return null
  const raw = m[1]
  const quote = raw.startsWith('"') ? '"' : raw.startsWith("'") ? "'" : ''
  let path = quote ? raw.slice(1) : raw
  if (kind === 'posix' && !quote) path = path.replace(/\\(.)/g, '$1')
  return { raw, path, quote }
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
const isSpecial = (name: string): boolean => (SPECIAL_DIRS as readonly string[]).includes(name)

/** Listenin en üstünde gösterilecek özel klasörler (yazılana uyanlar). */
export function specialDirsFor(path: string, kind: ShellKind): string[] {
  if (/[\\/]/.test(path)) return []
  return SPECIAL_DIRS.filter((d) => (kind !== 'cmd' || d !== '~') && d.startsWith(path))
}

function lastSeparator(text: string, kind: ShellKind): number {
  return kind === 'posix' ? text.lastIndexOf('/') : Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
}

/** Yolun son ayracına kadar olan kısmı (ayraç dahil) ve kalan önek. */
export function splitPath(path: string, kind: ShellKind): { dir: string; prefix: string } {
  const at = lastSeparator(path, kind)
  return { dir: path.slice(0, at + 1), prefix: path.slice(at + 1) }
}

export function separatorFor(path: string, kind: ShellKind, platform: string): string {
  if (kind === 'posix') return '/'
  if (path.includes('\\') && !path.includes('/')) return '\\'
  if (path.includes('/')) return '/'
  return platform === 'win32' ? '\\' : '/'
}

const POSIX_SPECIAL = /[\s'"\\$`!&;|<>(){}*?#[\]]/g
const NEEDS_QUOTE: Record<Exclude<ShellKind, 'posix'>, RegExp> = {
  pwsh: /[\s'"`$&;|<>(){}@#,]/,
  cmd: /[\s&^|<>()]/
}

/**
 * Seçilen klasörü yazılan metnin yerine koymak için kabuğa gönderilecek tuşları üretir.
 * Mümkünse yalnızca eksik kısım eklenir; değilse yazılan kısım silinip yenisi yazılır.
 * POSIX kabuklarında özel karakterler ters bölüyle kaçırılır; Windows kabuklarında yol çift tırnağa
 * alınır ve imleç kapanış tırnağının önünde bırakılır ki alt klasörlere inmeye devam edilebilsin.
 */
export function completionKeys(input: CdInput, name: string, kind: ShellKind, platform: string): string {
  const sep = separatorFor(input.path, kind, platform)
  const body = input.quote ? input.raw.slice(1) : input.raw
  const rawDir = body.slice(0, lastSeparator(body, kind) + 1)

  let nextRaw: string
  let closeQuote = ''
  if (isSpecial(name)) {
    nextRaw = input.quote + name + sep
  } else if (input.quote) {
    nextRaw = input.quote + rawDir + name + sep
  } else if (kind === 'posix') {
    nextRaw = rawDir + name.replace(POSIX_SPECIAL, '\\$&') + sep
  } else if (NEEDS_QUOTE[kind].test(rawDir + name)) {
    nextRaw = `"${rawDir}${name}${sep}`
    closeQuote = '"\x1b[D'
  } else {
    nextRaw = rawDir + name + sep
  }

  const typed = nextRaw.startsWith(input.raw)
    ? nextRaw.slice(input.raw.length)
    : '\x7f'.repeat([...input.raw].length) + nextRaw
  return typed + closeQuote
}
