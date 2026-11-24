/** Arayüz tercihleri (yerleşim, kenar çubuğu genişliği vb.) için küçük localStorage yardımcıları. */
export function loadPref<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(`zortex.${key}`)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`zortex.${key}`, JSON.stringify(value))
  } catch {
    // depolama dolu veya kapalı; tercih kaydedilmez
  }
}
