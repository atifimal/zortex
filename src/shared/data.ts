import { DEFAULT_SETTINGS, type AppData, type Category, type ImportResult, type Platform, type Snippet } from './types'

export function newId(): string {
  return globalThis.crypto.randomUUID()
}

export function createDefaultData(platform: Platform): AppData {
  const now = Date.now()
  const general: Category = { id: newId(), name: 'Genel' }
  const git: Category = { id: newId(), name: 'Git' }
  const network: Category = { id: newId(), name: 'Ağ' }

  const listCmd = platform === 'win32' ? 'Get-ChildItem -Force "{{klasör:.}}"' : 'ls -la "{{klasör:.}}"'
  const findCmd =
    platform === 'win32'
      ? 'Get-ChildItem -Recurse -Filter "{{desen:*.log}}" | Select-Object FullName'
      : 'find . -name "{{desen:*.log}}"'
  const portCmd =
    platform === 'win32'
      ? 'Get-NetTCPConnection -LocalPort {{port}} -ErrorAction SilentlyContinue'
      : 'lsof -nP -iTCP:{{port}} -sTCP:LISTEN'

  const snippets: Snippet[] = [
    { id: newId(), name: 'Klasörü listele', command: listCmd, categoryId: general.id, autoRun: true, createdAt: now, updatedAt: now },
    { id: newId(), name: 'Dosya ara', command: findCmd, categoryId: general.id, autoRun: true, createdAt: now, updatedAt: now },
    { id: newId(), name: 'Durum', command: 'git status -sb', categoryId: git.id, autoRun: true, createdAt: now, updatedAt: now },
    {
      id: newId(),
      name: 'Yeni dal oluştur',
      command: 'git switch -c {{dal}}',
      categoryId: git.id,
      autoRun: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: newId(),
      name: 'Commit',
      command: 'git commit -am "{{mesaj}}"',
      categoryId: git.id,
      description: 'İzlenen tüm değişiklikleri commit eder',
      autoRun: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: newId(),
      name: 'SSH bağlantısı',
      command: 'ssh {{kullanıcı}}@{{sunucu}} -p {{port:22}}',
      categoryId: network.id,
      autoRun: true,
      createdAt: now,
      updatedAt: now
    },
    { id: newId(), name: 'Portu kim dinliyor', command: portCmd, categoryId: network.id, autoRun: true, createdAt: now, updatedAt: now }
  ]

  return {
    version: 1,
    categories: [general, git, network],
    snippets,
    settings: { ...DEFAULT_SETTINGS },
    paramHistory: {}
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/** Diskten veya içe aktarılan dosyadan gelen veriyi doğrular; bozuk alanları atar, eksikleri tamamlar. */
export function sanitizeData(raw: unknown): AppData {
  if (!isObject(raw)) throw new Error('Geçersiz veri biçimi')

  const categories: Category[] = []
  const categoryIds = new Set<string>()
  for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
    if (!isObject(c)) continue
    const id = str(c.id) || newId()
    const name = str(c.name).trim()
    if (!name || categoryIds.has(id)) continue
    categoryIds.add(id)
    categories.push({ id, name })
  }

  const snippets: Snippet[] = []
  const snippetIds = new Set<string>()
  let fallbackCategory: Category | undefined
  for (const s of Array.isArray(raw.snippets) ? raw.snippets : []) {
    if (!isObject(s)) continue
    const name = str(s.name).trim()
    const command = str(s.command)
    if (!name || !command) continue
    let id = str(s.id) || newId()
    if (snippetIds.has(id)) id = newId()
    snippetIds.add(id)
    let categoryId = str(s.categoryId)
    if (!categoryIds.has(categoryId)) {
      if (!fallbackCategory) {
        fallbackCategory = { id: newId(), name: 'Kategorisiz' }
        categories.push(fallbackCategory)
        categoryIds.add(fallbackCategory.id)
      }
      categoryId = fallbackCategory.id
    }
    const description = str(s.description).trim()
    const updatedAt = typeof s.updatedAt === 'number' ? s.updatedAt : Date.now()
    const createdAt = typeof s.createdAt === 'number' ? s.createdAt : updatedAt
    snippets.push({
      id,
      name,
      command,
      categoryId,
      ...(description ? { description } : {}),
      autoRun: typeof s.autoRun === 'boolean' ? s.autoRun : true,
      createdAt,
      updatedAt
    })
  }

  const rawSettings = isObject(raw.settings) ? raw.settings : {}
  const fontSize = typeof rawSettings.fontSize === 'number' ? rawSettings.fontSize : DEFAULT_SETTINGS.fontSize

  const paramHistory: AppData['paramHistory'] = {}
  if (isObject(raw.paramHistory)) {
    for (const [snippetId, values] of Object.entries(raw.paramHistory)) {
      if (!snippetIds.has(snippetId) || !isObject(values)) continue
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) if (typeof v === 'string') clean[k] = v
      paramHistory[snippetId] = clean
    }
  }

  return {
    version: 1,
    categories,
    snippets,
    settings: {
      shellId: str(rawSettings.shellId),
      fontSize: Math.min(32, Math.max(8, Math.round(fontSize))),
      completion:
        rawSettings.completion === 'auto' || rawSettings.completion === 'tab' || rawSettings.completion === 'off'
          ? rawSettings.completion
          : DEFAULT_SETTINGS.completion,
      shellIntegration:
        typeof rawSettings.shellIntegration === 'boolean' ? rawSettings.shellIntegration : DEFAULT_SETTINGS.shellIntegration
    },
    paramHistory
  }
}

/**
 * İçe aktarılan snippet'leri mevcut veriye ekler.
 * Kategoriler ada göre eşleştirilir; aynı kategoride aynı ad ve komuta sahip snippet tekrar eklenmez.
 */
export function mergeData(current: AppData, incoming: AppData): { data: AppData; result: ImportResult } {
  const categories = [...current.categories]
  const snippets = [...current.snippets]
  const byName = new Map(categories.map((c) => [c.name.toLocaleLowerCase('tr-TR'), c]))
  const idMap = new Map<string, string>()
  let categoriesAdded = 0
  let snippetsAdded = 0

  for (const c of incoming.categories) {
    const key = c.name.toLocaleLowerCase('tr-TR')
    let target = byName.get(key)
    if (!target) {
      target = { id: newId(), name: c.name }
      categories.push(target)
      byName.set(key, target)
      categoriesAdded++
    }
    idMap.set(c.id, target.id)
  }

  for (const s of incoming.snippets) {
    const categoryId = idMap.get(s.categoryId)
    if (!categoryId) continue
    const duplicate = snippets.some((x) => x.categoryId === categoryId && x.name === s.name && x.command === s.command)
    if (duplicate) continue
    const now = Date.now()
    snippets.push({ ...s, id: newId(), categoryId, createdAt: now, updatedAt: now })
    snippetsAdded++
  }

  return { data: { ...current, categories, snippets }, result: { categoriesAdded, snippetsAdded } }
}
