import { describe, expect, it } from 'vitest'
import { foldText, groupSnippets } from '../../src/shared/search'
import type { Category, Snippet } from '../../src/shared/types'

const cats: Category[] = [
  { id: 'g', name: 'Git' },
  { id: 'n', name: 'Ağ' },
  { id: 'e', name: 'Boş' }
]
const snip = (id: string, name: string, command: string, categoryId: string): Snippet => ({
  id,
  name,
  command,
  categoryId,
  autoRun: true,
  updatedAt: 0
})
const snippets: Snippet[] = [
  snip('1', 'Durum', 'git status', 'g'),
  snip('2', 'Commit', 'git commit -m "{{mesaj}}"', 'g'),
  snip('3', 'SSH bağlantısı', 'ssh {{kullanıcı}}@{{sunucu}}', 'n'),
  snip('4', 'İnternet testi', 'ping 1.1.1.1', 'n')
]
const ids = (query: string): string[] => groupSnippets(cats, snippets, query).flatMap((g) => g.snippets.map((s) => s.id))

describe('foldText', () => {
  it('Türkçe karakterleri ve büyük harfleri sadeleştirir', () => {
    expect(foldText('İŞÇİ ığdır ÖĞÜ')).toBe('isci igdir ogu')
  })
})

describe('groupSnippets', () => {
  it('arama yokken tüm kategorileri (boş olanlar dahil) alfabetik listeler', () => {
    const groups = groupSnippets(cats, snippets, '')
    expect(groups.map((g) => g.category.name)).toEqual(['Ağ', 'Boş', 'Git'])
    expect(groups[2].snippets.map((s) => s.name)).toEqual(['Commit', 'Durum'])
  })

  it('ada, komuta ve kategoriye göre arar; eşleşmeyen kategorileri gizler', () => {
    expect(ids('commit')).toEqual(['2'])
    expect(ids('status')).toEqual(['1'])
    expect(ids('git')).toEqual(['2', '1'])
  })

  it('aksan ve büyük/küçük harf duyarsızdır', () => {
    expect(ids('BAGLANTI')).toEqual(['3'])
    expect(ids('internet')).toEqual(['4'])
  })

  it('birden çok kelimenin hepsinin geçmesini ister', () => {
    expect(ids('ağ ssh')).toEqual(['3'])
    expect(groupSnippets(cats, snippets, 'git ssh')).toEqual([])
  })
})
