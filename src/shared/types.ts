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
  /**
   * Terminalde komut/dosya önerileri:
   * `auto` yazarken açılır, `tab` yalnızca Tab / Ctrl+Space ile açılır, `off` kapalı.
   */
  completion: CompletionMode
  /** Kabuğa, klasör ve istem bilgisini bildiren küçük bir entegrasyon betiği yüklensin mi. */
  shellIntegration: boolean
}

export type CompletionMode = 'auto' | 'tab' | 'off'

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
  completion: 'auto',
  shellIntegration: true
}
