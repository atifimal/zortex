export interface Category {
  id: string
  name: string
}

export interface Snippet {
  id: string
  name: string
  /** Komut şablonu. Parametreler `{{ad}}` veya varsayılanlı `{{ad:varsayılan}}` biçiminde yazılır. */
  command: string
  categoryId: string
  description?: string
  /** true ise komut gönderildikten sonra Enter basılır. */
  autoRun: boolean
  /** Oluşturulma zamanı (ms). Eski verilerde yoksa `updatedAt` kullanılır. */
  createdAt: number
  updatedAt: number
}

export interface Settings {
  /** Seçili kabuğun kimliği; boş ise platformun varsayılanı kullanılır. */
  shellId: string
  fontSize: number
  /** Terminalde `cd ` yazılırken klasör önerileri gösterilsin mi. */
  cdSuggest: boolean
}

export interface AppData {
  version: 1
  categories: Category[]
  snippets: Snippet[]
  settings: Settings
  /** Snippet başına en son girilen parametre değerleri. */
  paramHistory: Record<string, Record<string, string>>
}

export interface ShellInfo {
  id: string
  name: string
  path: string
  args: string[]
}

export type Platform = 'win32' | 'darwin' | 'linux'

export interface ImportResult {
  categoriesAdded: number
  snippetsAdded: number
}

export const DEFAULT_SETTINGS: Settings = {
  shellId: '',
  fontSize: 14,
  cdSuggest: true
}
