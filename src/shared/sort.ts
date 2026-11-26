import type { Snippet } from './types'

/**
 * Kenar çubuğundaki snippet sıralaması.
 * `manual`: kullanıcının sürükle-bırak ile belirlediği sıra (veri dosyasındaki dizi sırası).
 */
export type SnippetSort = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'updated-desc' | 'manual'

export const SNIPPET_SORTS: { value: SnippetSort; label: string }[] = [
  { value: 'name-asc', label: 'Ad (A → Z)' },
  { value: 'name-desc', label: 'Ad (Z → A)' },
  { value: 'created-desc', label: 'Eklenme (yeni → eski)' },
  { value: 'created-asc', label: 'Eklenme (eski → yeni)' },
  { value: 'updated-desc', label: 'Son düzenlenen' },
  { value: 'manual', label: 'Özel sıra (sürükle-bırak)' }
]

export const DEFAULT_SNIPPET_SORT: SnippetSort = 'name-asc'

export const isSnippetSort = (v: unknown): v is SnippetSort => SNIPPET_SORTS.some((s) => s.value === v)

const byName = (a: Snippet, b: Snippet): number => a.name.localeCompare(b.name, 'tr-TR', { sensitivity: 'base' })

/** Snippet'leri seçilen ölçüte göre sıralar. Eşitlikte dizi sırası korunur (sıralama kararlıdır). */
export function sortSnippets(snippets: Snippet[], sort: SnippetSort): Snippet[] {
  const list = [...snippets]
  switch (sort) {
    case 'manual':
      return list
    case 'name-asc':
      return list.sort(byName)
    case 'name-desc':
      return list.sort((a, b) => byName(b, a))
    case 'created-desc':
      return list.sort((a, b) => b.createdAt - a.createdAt)
    case 'created-asc':
      return list.sort((a, b) => a.createdAt - b.createdAt)
    case 'updated-desc':
      return list.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

/**
 * Sürükle-bırak sonrası yeni sırayı hesaplar.
 * @param visibleOrder Ekranda görünen sıra (kategori kategori, tüm snippet kimlikleri).
 * @param movedId Taşınan snippet.
 * @param beforeId Önüne bırakıldığı snippet; `null` ise hedef kategorinin sonuna eklenir.
 * @param categoryOf Kimlikten kategori bulan yardımcı (taşınan için hedef kategori dikkate alınır).
 * @returns Tüm snippet kimliklerinin yeni sırası.
 */
export function moveInOrder(
  visibleOrder: string[],
  movedId: string,
  targetCategoryId: string,
  beforeId: string | null,
  categoryOf: (id: string) => string | undefined
): string[] {
  const order = visibleOrder.filter((id) => id !== movedId)
  let at: number
  if (beforeId && beforeId !== movedId && order.includes(beforeId)) {
    at = order.indexOf(beforeId)
  } else {
    // Hedef kategorinin son snippet'inden sonrası; kategori boşsa listenin sonu.
    let last = -1
    order.forEach((id, i) => {
      if (categoryOf(id) === targetCategoryId) last = i
    })
    at = last === -1 ? order.length : last + 1
  }
  order.splice(at, 0, movedId)
  return order
}
