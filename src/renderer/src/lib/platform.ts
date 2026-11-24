export const isMac = window.zortex.platform === 'darwin'

/** Kısayol etiketleri: macOS'ta ⌘, diğerlerinde Ctrl+Shift. */
export function shortcutLabel(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+Shift+${key}`
}

/**
 * Uygulama kısayolu için birincil değiştirici tuş.
 * Windows'ta Ctrl tek başına kabuğa aittir (Ctrl+F, Ctrl+B ...), bu yüzden Ctrl+Shift kullanılır.
 */
export function isAppShortcut(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey && !e.ctrlKey && !e.altKey : e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey
}

export const terminalFontFamily = isMac
  ? '"SF Mono", Menlo, Monaco, "Courier New", monospace'
  : '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace'
