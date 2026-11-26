/**
 * Komut satırı ayrıştırma ve tamamlama metni üretimi (saf, platformdan bağımsız).
 * Terminal ekranından okunan girdi metnini sözcüklere böler; imlecin bulunduğu sözcüğü ve
 * o sözcüğün komut adı mı yoksa argüman mı olduğunu bulur.
 */
import type { ShellKind } from './shell'

export interface Word {
  /** Ekranda yazıldığı hali (tırnak ve kaçışlar dahil). */
  raw: string
  /** Kabuğun göreceği değer: tırnaklar ve kaçışlar çözülmüş. */
  value: string
  /** Sözcük tırnakla başladıysa ve tırnak hâlâ açıksa o tırnak. */
  quote: '' | '"' | "'"
  /** Tırnak sözcüğün ortasında açıldı (`--x="abc`): yol tamamlama yapılmaz. */
  midQuote: boolean
}

export interface ParsedLine {
  /** İmlecin bulunduğu (son) sözcük; satır boşlukla bitiyorsa boş sözcük. */
  current: Word
  /** Geçerli komutun adı; `current` komut konumundaysa null. */
  command: Word | null
  /** Komut adıyla `current` arasındaki argümanlar. */
  args: Word[]
}

const SEPARATORS: Record<ShellKind, string> = {
  posix: ';|&\n()',
  pwsh: ';|&\n({}',
  cmd: '&|\n()'
}
const ESCAPE: Record<ShellKind, string> = { posix: '\\', pwsh: '`', cmd: '^' }
const QUOTES: Record<ShellKind, string> = { posix: `"'`, pwsh: `"'`, cmd: '"' }

/** Arkasından gelen sözcüğü komut olarak çalıştıran önekler. */
const COMMAND_PREFIXES = new Set(['sudo', 'doas', 'time', 'nohup', 'env', 'exec', 'command', 'builtin', 'nice', 'watch', 'xargs', 'caffeinate', 'start'])

const emptyWord = (): Word => ({ raw: '', value: '', quote: '', midQuote: false })

export function parseCommandLine(text: string, kind: ShellKind): ParsedLine {
  const seps = SEPARATORS[kind]
  const esc = ESCAPE[kind]
  const quotes = QUOTES[kind]
  let segment: Word[] = []
  let cur: Word | null = null
  let inQuote = ''

  const ensure = (): Word => (cur ??= emptyWord())
  const flush = (): void => {
    if (cur) segment.push(cur)
    cur = null
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      const w = ensure()
      if (ch === inQuote) {
        inQuote = ''
        w.raw += ch
      } else if (kind === 'posix' && inQuote === '"' && ch === '\\' && i + 1 < text.length) {
        w.raw += ch + text[i + 1]
        w.value += text[i + 1]
        i++
      } else {
        w.raw += ch
        w.value += ch
      }
      continue
    }
    if (ch === esc && i + 1 < text.length) {
      const w = ensure()
      w.raw += ch + text[i + 1]
      w.value += text[i + 1]
      i++
      continue
    }
    if (ch === ' ' || ch === '\t') {
      flush()
      continue
    }
    if (seps.includes(ch)) {
      flush()
      segment = []
      continue
    }
    const w = ensure()
    if (quotes.includes(ch)) {
      inQuote = ch
      if (w.raw === '') w.quote = ch as Word['quote']
      else w.midQuote = true
      w.raw += ch
      continue
    }
    w.raw += ch
    w.value += ch
  }

  let current: Word
  if (cur) {
    current = cur
    // Tırnak kapandıysa artık "açık tırnak" yok.
    if (!inQuote) current.quote = ''
    if (!inQuote) current.midQuote = false
  } else {
    current = emptyWord()
  }

  // Komut adını bul: ortam ataması (`FOO=1 cmd`) ve `sudo` gibi önekler atlanır.
  let index = 0
  while (index < segment.length) {
    const v = segment[index].value
    if (kind === 'posix' && /^[A-Za-z_]\w*=/.test(v)) index++
    else if (COMMAND_PREFIXES.has(v.toLowerCase())) index++
    else break
  }
  const command = segment[index] ?? null
  return { current, command, args: command ? segment.slice(index + 1) : [] }
}

/** Komut adını karşılaştırma için sadeleştirir: küçük harf, `.exe` vb. uzantı olmadan. */
export function commandKey(name: string): string {
  return name.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '')
}

export const CD_COMMANDS = new Set(['cd', 'chdir', 'pushd', 'sl', 'set-location', 'push-location'])

/** Sözcük bir yol gibi mi görünüyor (`./x`, `~/x`, `C:\x`, `src/x`)? */
export function isPathLike(value: string): boolean {
  return /^[.~/\\]/.test(value) || /[\\/]/.test(value) || /^[A-Za-z]:/.test(value)
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

const BACKSPACE = '\x7f'
const LEFT = '\x1b[D'
const RIGHT = '\x1b[C'

export interface Replacement {
  /** Eklenecek ad (klasör/dosya adı ya da komut adı). */
  name: string
  /** Klasörse ayraç eklenir ve imleç yol içinde kalır; değilse sözcük kapatılıp boşluk eklenir. */
  isDir: boolean
  /** Sözcüğün yazılmış klasör kısmı korunur mu (yol tamamlamada evet, `..`/`~` ve komutlarda hayır). */
  keepDir: boolean
  /** İmlecin hemen sağındaki karakter (daha önce eklenmiş kapanış tırnağını atlamak için). */
  nextChar?: string
}

/**
 * Seçilen öğeyi imleçteki sözcüğün yerine koymak için kabuğa gönderilecek tuşları üretir.
 * Mümkünse yalnızca eksik kısım eklenir; değilse sözcük silinip yeniden yazılır.
 * POSIX kabuklarında özel karakterler ters bölüyle kaçırılır; Windows kabuklarında gerekirse
 * çift tırnak kullanılır ve klasörde imleç kapanış tırnağının önünde bırakılır.
 */
export function replacementKeys(word: Word, r: Replacement, kind: ShellKind, platform: string): string {
  const sep = separatorFor(word.value, kind, platform)
  const body = word.quote ? word.raw.slice(1) : word.raw
  const rawDir = r.keepDir ? body.slice(0, lastSeparator(body, kind) + 1) : ''

  let quote: string = word.quote
  let addedQuote = false
  let core: string
  if (!r.keepDir && /^(\.{1,2}|~)$/.test(r.name)) {
    core = r.name
  } else if (quote) {
    core = rawDir + r.name
  } else if (kind === 'posix') {
    core = rawDir + r.name.replace(POSIX_SPECIAL, '\\$&')
  } else if (NEEDS_QUOTE[kind].test(rawDir + r.name)) {
    quote = '"'
    addedQuote = true
    core = rawDir + r.name
  } else {
    core = rawDir + r.name
  }

  const nextRaw = quote + core + (r.isDir ? sep : '')
  const typed = nextRaw.startsWith(word.raw)
    ? nextRaw.slice(word.raw.length)
    : BACKSPACE.repeat([...word.raw].length) + nextRaw

  if (r.isDir) return addedQuote ? `${typed}${quote}${LEFT}` : typed
  if (!quote) return `${typed} `
  // Kapanış tırnağı zaten imlecin sağındaysa üzerinden geç.
  return r.nextChar === quote && !addedQuote ? `${typed}${RIGHT} ` : `${typed}${quote} `
}

/**
 * Kabuk entegrasyonu yokken ekrandaki satırdan girdiyi tahmin eder.
 * Windows'ta varsayılan PowerShell/cmd istemi atlanır; diğer durumlarda yalnızca `cd` tanınır.
 * @returns Girdi metni ve öncesindeki istem metni.
 */
export function guessInput(line: string, kind: ShellKind): { prompt: string; input: string } | null {
  const prompt =
    kind === 'pwsh'
      ? /^PS (?:[A-Za-z]:|\\\\|[\w.]+\\FileSystem::)[^>]*>+ ?/.exec(line)
      : kind === 'cmd'
        ? /^\s*(?:[A-Za-z]:|\\\\)[^>]*>/.exec(line)
        : null
  if (prompt) return { prompt: prompt[0], input: line.slice(prompt[0].length) }
  const cd = /(?:^|[\s;&|(>$#%❯➜»λ])((?:cd|chdir|pushd|sl|set-location) +.*)$/i.exec(line)
  if (!cd) return null
  return { prompt: line.slice(0, line.length - cd[1].length), input: cd[1] }
}
