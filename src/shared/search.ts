import type { Category, Snippet } from './types'
import { DEFAULT_SNIPPET_SORT, sortSnippets, type SnippetSort } from './sort'

/** Büyük/küçük harf ve Türkçe karakter farklarını yok sayan karşılaştırma için metni sadeleştirir. */
export function foldText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
}

export interface CategoryGroup {
  category: Category
  snippets: Snippet[]
}

const byName = (a: Category, b: Category): number =>
  a.name.localeCompare(b.name, 'tr-TR', { sensitivity: 'base' })

/**
 * Snippet'leri kategorilere göre gruplar ve aramaya göre süzer.
 * Sorgu boşluklarla ayrılmış kelimelere bölünür; her kelime snippet adı, komutu, açıklaması
 * veya kategori adında geçmelidir. Arama yokken boş kategoriler de listelenir.
 * Kategoriler her zaman ada göre, kategori içindeki snippet'ler `sort` ölçütüne göre sıralanır.
 */
export function groupSnippets(
  categories: Category[],
  snippets: Snippet[],
  query: string,
  sort: SnippetSort = DEFAULT_SNIPPET_SORT
): CategoryGroup[] {
  const terms = foldText(query).split(/\s+/).filter(Boolean)
  const groups: CategoryGroup[] = []

  for (const category of [...categories].sort(byName)) {
    const inCategory = snippets.filter((s) => s.categoryId === category.id)
    const categoryText = foldText(category.name)
    const matches =
      terms.length === 0
        ? inCategory
        : inCategory.filter((s) => {
            const haystack = `${foldText(s.name)}\n${foldText(s.command)}\n${foldText(s.description ?? '')}\n${categoryText}`
            return terms.every((t) => haystack.includes(t))
          })
    if (terms.length === 0 || matches.length > 0) {
      groups.push({ category, snippets: sortSnippets(matches, sort) })
    }
  }
  return groups
}
