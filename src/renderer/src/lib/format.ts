import type { FsEntry } from '../../../preload/api'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatSize(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`
}

const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** `ls -l` gibi: son altı ay içindeyse saatle, değilse yılla. */
export function formatDate(ms: number): string {
  const recent = Date.now() - ms < 182 * 24 * 3600 * 1000
  return (recent ? timeFormat : dateFormat).format(ms)
}

/** Unix'te `drwxr-xr-x`; Windows'ta izin bitleri olmadığından tür ve çalıştırılabilirlik gösterilir. */
export function formatMode(entry: FsEntry, platform: string): string {
  const type = entry.isLink ? 'l' : entry.isDir ? 'd' : '-'
  if (platform === 'win32') return `${type}${entry.isExec ? 'x' : '-'}`
  const bits = 'rwxrwxrwx'
  let out = type
  for (let i = 0; i < 9; i++) out += entry.mode & (1 << (8 - i)) ? bits[i] : '-'
  return out
}
