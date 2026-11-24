import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { createDefaultData, sanitizeData } from '../shared/data'
import type { AppData, Platform } from '../shared/types'

const DATA_FOLDER = 'Zortex Data'
const DATA_FILE = 'data.json'

/**
 * Verinin saklanacağı klasörü belirler:
 *  1. ZORTEX_DATA_DIR ortam değişkeni (testler ve ileri kullanım için)
 *  2. Windows portable .exe: exe'nin yanındaki "Zortex Data" klasörü (uygulamayla birlikte taşınır)
 *  3. macOS: .app'in yanında "Zortex Data" klasörü varsa o (isteğe bağlı portable mod)
 *  4. Aksi halde işletim sisteminin kullanıcı veri klasörü
 */
export function resolveDataDir(): string {
  if (process.env.ZORTEX_DATA_DIR) return process.env.ZORTEX_DATA_DIR
  if (process.env.PORTABLE_EXECUTABLE_DIR) return join(process.env.PORTABLE_EXECUTABLE_DIR, DATA_FOLDER)
  if (process.platform === 'darwin' && app.isPackaged) {
    // .../Zortex.app/Contents/MacOS/Zortex -> .app'in bulunduğu klasör
    const besideApp = join(dirname(dirname(dirname(dirname(app.getPath('exe'))))), DATA_FOLDER)
    if (existsSync(besideApp)) return besideApp
  }
  return app.getPath('userData')
}

export class DataStore {
  readonly dir: string
  private readonly file: string

  constructor(dir = resolveDataDir()) {
    this.dir = dir
    this.file = join(dir, DATA_FILE)
  }

  load(): AppData {
    if (!existsSync(this.file)) {
      const fresh = createDefaultData(process.platform as Platform)
      this.save(fresh)
      return fresh
    }
    try {
      return sanitizeData(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch (error) {
      // Bozuk dosyayı kaybetmemek için yedekleyip temiz veriyle devam et.
      const backup = join(this.dir, `data.corrupt-${Date.now()}.json`)
      try {
        renameSync(this.file, backup)
      } catch {
        // yedekleme başarısızsa yine de devam edilir
      }
      console.error('Veri dosyası okunamadı, yedeklendi:', backup, error)
      const fresh = createDefaultData(process.platform as Platform)
      this.save(fresh)
      return fresh
    }
  }

  /** Yarım kalmış yazmalara karşı önce geçici dosyaya yazar, sonra yerine taşır. */
  save(data: AppData): void {
    mkdirSync(this.dir, { recursive: true })
    const clean = sanitizeData(data)
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }
}
