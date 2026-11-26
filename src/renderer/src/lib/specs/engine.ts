/// <reference types="@withfig/autocomplete-types" />
/**
 * Fig biçimindeki tamamlama spec'lerini yorumlar: satırdaki sözcükleri spec üzerinde yürür,
 * imleçteki sözcük için alt komut / seçenek / argüman önerilerini üretir. Üreticiler (generators)
 * dışarıdan verilen `exec` ile komut çalıştırır (ör. `git branch`).
 */

export interface SpecContext {
  /** Komut adı, argümanlar ve en sonda imleçteki (yarım) sözcük; tırnak/kaçışlar çözülmüş. */
  tokens: string[]
  cwd: string
  exec: Fig.ExecuteCommandFunction
  /** Başka bir spec'i yükler (`loadSpec: "docker-compose"`, `npx <komut>`). */
  loadSpec(name: string): Promise<Fig.Spec | null>
  /** `sh -c` / `bash -c` ile çalıştırılacak dize betikler için. */
  shellCommand: string
  /** Üretici sonuçları için önbellek (komut + klasör anahtarlı). */
  cache: Map<string, { at: number; value: Promise<Fig.Suggestion[]> }>
}

export type SpecSuggestionKind = 'subcommand' | 'option' | 'value'

export interface SpecSuggestion {
  /** Listede görünen ad. */
  name: string
  /** Sözcüğün sorgu kısmının yerine yazılacak metin. */
  insert: string
  description?: string
  kind: SpecSuggestionKind
  priority: number
  /** Ekledikten sonra: boşluk (`space`), hiçbir şey (`none`: `--opt=`, klasör…). */
  suffix: 'space' | 'none'
  /** `insertValue`: olduğu gibi yazılır (kaçış/tırnak eklenmez). */
  raw?: boolean
  /** `{cursor}` için: yazdıktan sonra imleç bu kadar sola alınır. */
  cursorBack?: number
  /** Klasör gibi davranır: liste açık kalır. */
  isDir?: boolean
  isDangerous?: boolean
}

export interface SpecResult {
  suggestions: SpecSuggestion[]
  /** Dosya/klasör önerileri de eklenmeli mi. */
  template: { filepaths: boolean; folders: boolean }
  /**
   * Sorgu sözcüğün tamamı değil, bu karakterin son geçtiği yerden sonrası (`getQueryTerm`, `--opt=`).
   * Eklenecek metin bu noktadan sonrasının yerine geçer.
   */
  queryTerm?: string
  /** Bu konumda bir komut adı beklenir (`sudo <komut>`); spec'i yoksa komut listesi gösterilmeli. */
  expectsCommand: boolean
  /** Spec bu konum için hiçbir şey bilmiyor: çağıran düz dosya önerisine dönebilir. */
  unknown: boolean
}

const DEFAULT_PRIORITY = 50
const GENERATOR_CACHE_MS = 5000

const toArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const names = (n: string | string[] | undefined): string[] => toArray(n)

function emptyResult(): SpecResult {
  return { suggestions: [], template: { filepaths: false, folders: false }, expectsCommand: false, unknown: true }
}

/** Spec'in kök alt komutu (fonksiyon biçimindeki "sürümlü" spec'ler desteklenmez). */
function rootOf(spec: Fig.Spec | null | undefined): Fig.Subcommand | null {
  return spec && typeof spec === 'object' ? spec : null
}

/** `-x` / `--xx`; Windows araçlarında (seçenekleri `/` ile başlayan spec'lerde) `/x` de seçenektir. */
function isOptionLike(token: string, sub: Fig.Subcommand): boolean {
  if (token.startsWith('-')) return true
  return token.startsWith('/') && toArray(sub.options).some((o) => names(o.name).some((n) => n.startsWith('/')))
}

function findOption(options: Fig.Option[], name: string): Fig.Option | undefined {
  // Windows araçlarının `/x` seçenekleri büyük/küçük harf duyarsızdır.
  const same = (n: string): boolean => n === name || (n.startsWith('/') && n.toLowerCase() === name.toLowerCase())
  return options.find((o) => names(o.name).some(same))
}

async function resolveSubcommand(sub: Fig.Subcommand, ctx: SpecContext): Promise<Fig.Subcommand> {
  const load = sub.loadSpec
  if (typeof load === 'string') {
    const loaded = rootOf(await ctx.loadSpec(load))
    if (loaded) return { ...loaded, name: sub.name, description: sub.description ?? loaded.description }
  } else if (load && typeof load === 'object') {
    return { ...load, name: sub.name }
  }
  return sub
}

/** `generateSpec` ile çalışma anında üretilen alt komut/seçenekleri ekler (ör. proje betikleri). */
async function withGenerated(sub: Fig.Subcommand, ctx: SpecContext, tokens: string[]): Promise<Fig.Subcommand> {
  if (typeof sub.generateSpec !== 'function') return sub
  try {
    const extra = rootOf(await sub.generateSpec(tokens, ctx.exec))
    if (!extra) return sub
    return {
      ...sub,
      subcommands: [...toArray(sub.subcommands), ...toArray(extra.subcommands)],
      options: [...toArray(sub.options), ...toArray(extra.options)],
      args: sub.args ?? extra.args
    }
  } catch {
    return sub
  }
}

function normalizeScript(
  script: NonNullable<Fig.Generator['script']>,
  tokens: string[],
  ctx: SpecContext
): Fig.ExecuteCommandInput | null {
  const value: unknown = typeof script === 'function' ? (script as (t: string[]) => unknown)(tokens) : script
  if (typeof value === 'string') return { command: ctx.shellCommand, args: ['-c', value] }
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) {
    return { command: value[0], args: value.slice(1) }
  }
  if (value && typeof value === 'object' && typeof (value as Fig.ExecuteCommandInput).command === 'string') {
    return value as Fig.ExecuteCommandInput
  }
  return null
}

const customKeys = new WeakMap<object, number>()
let customSeq = 0

async function runGenerator(gen: Fig.Generator, ctx: SpecContext, query: string): Promise<Fig.Suggestion[]> {
  const { tokens, cwd } = ctx
  let key: string
  let produce: () => Promise<Fig.Suggestion[]>
  if (gen.custom) {
    if (!customKeys.has(gen)) customKeys.set(gen, ++customSeq)
    key = `custom:${customKeys.get(gen)}\0${cwd}\0${tokens.slice(0, -1).join('\0')}`
    const context = {
      environmentVariables: {},
      currentWorkingDirectory: cwd,
      currentProcess: '',
      sshPrefix: '',
      isDangerous: false,
      searchTerm: query
    } as unknown as Fig.GeneratorContext
    produce = () => gen.custom!(tokens, ctx.exec, context)
  } else if (gen.script) {
    const input = normalizeScript(gen.script, tokens, ctx)
    if (!input) return []
    key = `script:${cwd}\0${JSON.stringify(input)}`
    produce = async () => {
      const out = await ctx.exec({ ...input, cwd: input.cwd ?? cwd, timeout: gen.scriptTimeout ?? input.timeout })
      if (gen.postProcess) return gen.postProcess(out.stdout, tokens)
      if (gen.splitOn !== undefined) return out.stdout.split(gen.splitOn).filter(Boolean).map((name) => ({ name }))
      return []
    }
  } else {
    return []
  }
  const ttl = gen.cache && 'ttl' in gen.cache && typeof gen.cache.ttl === 'number' ? gen.cache.ttl : GENERATOR_CACHE_MS
  const hit = ctx.cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = produce()
    .then((list) => (Array.isArray(list) ? list.filter(Boolean) : []))
    .catch(() => [])
  ctx.cache.set(key, { at: Date.now(), value })
  if (ctx.cache.size > 200) ctx.cache.delete(ctx.cache.keys().next().value!)
  return value
}

const asSuggestion = (s: string | Fig.Suggestion): Fig.Suggestion => (typeof s === 'string' ? { name: s } : s)

/** Fig önerisini sorguya göre eşleştirir ve listedeki biçimine çevirir. */
function convert(
  s: Fig.Suggestion | Fig.Subcommand | Fig.Option,
  kind: SpecSuggestionKind,
  query: string,
  fuzzy: boolean
): SpecSuggestion | null {
  // Gizli öğeler yalnızca adları yazılmaya başlanınca gösterilir.
  if (s.hidden && !query) return null
  const q = query.toLowerCase()
  const all = names(s.name as string | string[])
  const matched = all.find((n) => n.toLowerCase().startsWith(q))
  const name = matched ?? (fuzzy && !s.hidden ? all.find((n) => n.toLowerCase().includes(q)) : undefined)
  if (name === undefined || !name.trim()) return null

  let insert = name
  let raw = false
  let cursorBack: number | undefined
  let suffix: SpecSuggestion['suffix'] = 'space'
  if (typeof s.insertValue === 'string') {
    raw = true
    const at = s.insertValue.indexOf('{cursor}')
    if (at === -1) insert = s.insertValue
    else {
      insert = s.insertValue.replace('{cursor}', '')
      cursorBack = [...s.insertValue.slice(at + '{cursor}'.length)].length
      suffix = 'none'
    }
  }
  if (kind === 'option') {
    const option = s as Fig.Option
    const sep = option.requiresEquals ? '=' : typeof option.requiresSeparator === 'string' ? option.requiresSeparator : option.requiresSeparator ? '=' : ''
    if (option.args && sep && !raw) {
      insert += sep
      suffix = 'none'
    }
  }
  const type = (s as Fig.Suggestion).type
  const isDir = kind === 'value' && (type === 'folder' || (!raw && insert.endsWith('/')))
  if (isDir) suffix = 'none'

  const display = s.displayName ?? (all.length > 1 && kind === 'option' ? all.join(', ') : name)
  return {
    name: display,
    insert,
    description: s.description,
    kind,
    priority: typeof s.priority === 'number' ? s.priority : DEFAULT_PRIORITY,
    suffix,
    raw: raw || undefined,
    cursorBack,
    isDir: isDir || undefined,
    isDangerous: s.isDangerous || undefined
  }
}

interface ArgOutcome {
  items: SpecSuggestion[]
  template: SpecResult['template']
  queryTerm?: string
}

async function argSuggestions(arg: Fig.Arg, ctx: SpecContext, current: string): Promise<ArgOutcome> {
  const template = { filepaths: false, folders: false }
  const addTemplate = (t: Fig.Template | undefined): void => {
    for (const name of toArray(t)) {
      if (name === 'filepaths') template.filepaths = true
      if (name === 'folders') template.folders = true
    }
  }
  addTemplate(arg.template)

  let queryTerm: string | undefined
  const generators = toArray(arg.generators)
  for (const g of generators) {
    if (typeof g.getQueryTerm === 'string') queryTerm = g.getQueryTerm
  }
  const query = queryTerm && current.includes(queryTerm) ? current.slice(current.lastIndexOf(queryTerm) + queryTerm.length) : current
  const fuzzy = arg.filterStrategy === 'fuzzy'

  const raw: Fig.Suggestion[] = toArray(arg.suggestions).map(asSuggestion)
  const generated = await Promise.all(
    generators.map(async (g) => {
      addTemplate(g.template)
      if (g.template && !g.custom && !g.script) return []
      // Fig'in kendi şablon üreticisinin (filepaths/folders) yerine Zortex'in yol önerileri kullanılır.
      return runGenerator(g, ctx, query)
    })
  )
  const items: SpecSuggestion[] = []
  for (const s of [...raw, ...generated.flat()]) {
    const converted = convert(asSuggestion(s), 'value', query, fuzzy)
    if (converted) items.push(converted)
  }
  return { items, template, queryTerm: query === current ? undefined : queryTerm }
}

/** Spec'i satırdaki sözcüklerle yürür ve imleçteki sözcük için önerileri döndürür. */
export async function resolveSpec(spec: Fig.Spec, ctx: SpecContext): Promise<SpecResult> {
  let sub = rootOf(spec)
  if (!sub) return emptyResult()
  const tokens = ctx.tokens
  const current = tokens[tokens.length - 1] ?? ''
  sub = await withGenerated(sub, ctx, tokens)

  let persistent: Fig.Option[] = toArray(sub.options).filter((o) => o.isPersistent)
  let positional = 0
  let sawPositional = false
  let onlyArgs = false
  let pending: Fig.Arg[] = []
  const used = new Set<string>()
  const optionsOf = (s: Fig.Subcommand): Fig.Option[] => [...toArray(s.options), ...persistent]

  for (let i = 1; i < tokens.length - 1; i++) {
    const token = tokens[i]
    if (pending.length > 0) {
      const next = pending[0]
      if (!(next.isOptional && isOptionLike(token, sub))) {
        if (!next.isVariadic) pending.shift()
        continue
      }
      pending = []
    }
    if (!onlyArgs && token === '--') {
      onlyArgs = true
      continue
    }
    if (!onlyArgs && token.length > 1 && isOptionLike(token, sub)) {
      const eq = token.indexOf('=')
      const name = eq === -1 ? token : token.slice(0, eq)
      const options = optionsOf(sub)
      const option = findOption(options, name)
      if (option) {
        names(option.name).forEach((n) => used.add(n))
        if (option.args && eq === -1) pending = toArray(option.args)
      } else if (/^-[^-]{2,}$/.test(token)) {
        // Birleşik kısa seçenekler: `-la`, `-xvf dosya`.
        for (const ch of token.slice(1)) {
          const short = findOption(options, `-${ch}`)
          if (!short) continue
          names(short.name).forEach((n) => used.add(n))
          if (short.args) pending = toArray(short.args)
        }
      }
      continue
    }
    if (!sawPositional) {
      const next = toArray(sub.subcommands).find((s) => names(s.name).includes(token))
      if (next) {
        sub = await withGenerated(await resolveSubcommand(next, ctx), ctx, tokens)
        persistent = [...persistent, ...toArray(sub.options).filter((o) => o.isPersistent)]
        positional = 0
        used.clear()
        continue
      }
    }
    const args = toArray(sub.args)
    const arg = args[positional] ?? (args[args.length - 1]?.isVariadic ? args[args.length - 1] : undefined)
    if (arg && (arg.isCommand || arg.loadSpec)) {
      // `sudo git …`, `npx tsc …`: kalan kısım başka bir komutun satırıdır.
      const target = typeof arg.loadSpec === 'string' ? arg.loadSpec : token
      const nested = await ctx.loadSpec(target)
      if (!nested) return emptyResult()
      return resolveSpec(nested, { ...ctx, tokens: tokens.slice(i) })
    }
    sawPositional = true
    if (!arg?.isVariadic) positional++
  }

  const result = emptyResult()
  const addArg = async (arg: Fig.Arg): Promise<void> => {
    const outcome = await argSuggestions(arg, ctx, current)
    result.suggestions.push(...outcome.items)
    result.template.filepaths ||= outcome.template.filepaths
    result.template.folders ||= outcome.template.folders
    if (outcome.queryTerm) result.queryTerm = outcome.queryTerm
    result.unknown = false
  }

  if (pending.length > 0) {
    await addArg(pending[0])
    return finish(result)
  }

  const args = toArray(sub.args)
  const arg = args[positional] ?? (args[args.length - 1]?.isVariadic ? args[args.length - 1] : undefined)

  if (!onlyArgs && isOptionLike(current, sub)) {
    const eq = current.indexOf('=')
    const options = optionsOf(sub)
    if (eq !== -1) {
      // `--format=js…`: seçeneğin değeri önerilir.
      const option = findOption(options, current.slice(0, eq))
      if (option?.args) {
        const outcome = await argSuggestions(toArray(option.args)[0], ctx, current.slice(eq + 1))
        result.suggestions.push(...outcome.items)
        result.queryTerm = '='
        result.unknown = false
      }
      return finish(result)
    }
    for (const option of options) {
      const repeatable = option.isRepeatable === true || typeof option.isRepeatable === 'number'
      if (!repeatable && names(option.name).some((n) => used.has(n))) continue
      const converted = convert(option, 'option', current, false)
      if (converted) result.suggestions.push(converted)
    }
    result.unknown = options.length === 0
    return finish(result)
  }

  if (arg?.isCommand || (arg && arg.loadSpec && typeof arg.loadSpec !== 'string')) {
    result.expectsCommand = true
    result.unknown = false
    return finish(result)
  }
  if (arg) await addArg(arg)
  if (!sawPositional) {
    const subs = toArray(sub.subcommands)
    for (const s of subs) {
      const converted = convert(s, 'subcommand', current, false)
      if (converted) result.suggestions.push(converted)
    }
    for (const extra of toArray(sub.additionalSuggestions)) {
      const converted = convert(asSuggestion(extra), 'value', current, false)
      if (converted) result.suggestions.push(converted)
    }
    if (subs.length > 0) result.unknown = false
  }
  return finish(result)
}

function finish(result: SpecResult): SpecResult {
  // Aynı adlı öneriler tekilleştirilir; yüksek öncelik öne alınır (kararlı sıralama).
  const seen = new Set<string>()
  result.suggestions = result.suggestions
    .filter((s) => {
      const key = `${s.kind}:${s.insert}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.priority - a.priority)
  return result
}
