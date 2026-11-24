/**
 * Snippet parametre ayrıştırma ve doldurma.
 *
 * Söz dizimi:
 *   {{ad}}              -> zorunlu parametre
 *   {{ad:varsayılan}}   -> varsayılan değeri olan parametre
 *
 * Aynı ad birden çok kez geçerse kullanıcıya bir kez sorulur ve her yere aynı değer yazılır.
 * İçi boş `{{}}` yer tutucuları (ör. "Parametre ekle" ile eklenip doldurulmamış olanlar) yok sayılır.
 */

export interface SnippetParam {
  name: string
  defaultValue?: string
}

const PARAM_RE = /\{\{([^{}]*)\}\}/g

function parseToken(raw: string): SnippetParam | null {
  const sep = raw.indexOf(':')
  const name = (sep === -1 ? raw : raw.slice(0, sep)).trim()
  if (!name) return null
  if (sep === -1) return { name }
  return { name, defaultValue: raw.slice(sep + 1) }
}

export function extractParams(template: string): SnippetParam[] {
  const seen = new Map<string, SnippetParam>()
  for (const match of template.matchAll(PARAM_RE)) {
    const param = parseToken(match[1])
    if (!param) continue
    const existing = seen.get(param.name)
    if (!existing) {
      seen.set(param.name, param)
    } else if (existing.defaultValue === undefined && param.defaultValue !== undefined) {
      existing.defaultValue = param.defaultValue
    }
  }
  return [...seen.values()]
}

export function fillParams(template: string, values: Record<string, string>): string {
  const params = new Map(extractParams(template).map((p) => [p.name, p]))
  return template.replace(PARAM_RE, (whole, raw: string) => {
    const param = parseToken(raw)
    if (!param) return whole
    const value = values[param.name]
    if (value !== undefined) return value
    return params.get(param.name)?.defaultValue ?? ''
  })
}

/**
 * Metin alanındaki seçime `{{` `}}` ekler.
 * Seçim yoksa imleç parantezlerin ortasına, seçim varsa seçili metin sarmalanıp imleç kapanıştan önceye konur.
 */
export function insertParamPlaceholder(
  text: string,
  selectionStart: number,
  selectionEnd: number
): { text: string; caret: number } {
  const start = Math.min(selectionStart, selectionEnd)
  const end = Math.max(selectionStart, selectionEnd)
  const selected = text.slice(start, end)
  const next = `${text.slice(0, start)}{{${selected}}}${text.slice(end)}`
  return { text: next, caret: start + 2 + selected.length }
}

/** Terminale gönderilecek veriyi hazırlar: satır sonlarını CR'ye çevirir, istenirse Enter ekler. */
export function toTerminalInput(command: string, autoRun: boolean): string {
  const normalized = command.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  const body = normalized.replace(/\n/g, '\r')
  return autoRun ? `${body}\r` : body
}
