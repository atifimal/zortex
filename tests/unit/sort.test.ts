import { describe, expect, it } from 'vitest'
import { moveInOrder, sortSnippets } from '../../src/shared/sort'
import { groupSnippets } from '../../src/shared/search'
import type { Snippet } from '../../src/shared/types'

const snip = (id: string, name: string, createdAt: number, updatedAt: number, categoryId = 'c'): Snippet => ({
  id,
  name,
  command: 'x',
  categoryId,
  autoRun: true,
  createdAt,
  updatedAt
})

// Dizi sırası = özel sıra
const list = [snip('1', 'Çay', 30, 30), snip('2', 'armut', 10, 50), snip('3', 'Elma', 20, 20)]
const names = (sorted: Snippet[]): string[] => sorted.map((s) => s.name)

describe('sortSnippets', () => {
  it('ada göre Türkçe kurallarıyla ve büyük/küçük harf duyarsız sıralar', () => {
    expect(names(sortSnippets(list, 'name-asc'))).toEqual(['armut', 'Çay', 'Elma'])
    expect(names(sortSnippets(list, 'name-desc'))).toEqual(['Elma', 'Çay', 'armut'])
  })

  it('eklenme ve düzenlenme zamanına göre sıralar', () => {
    expect(names(sortSnippets(list, 'created-desc'))).toEqual(['Çay', 'Elma', 'armut'])
    expect(names(sortSnippets(list, 'created-asc'))).toEqual(['armut', 'Elma', 'Çay'])
    expect(names(sortSnippets(list, 'updated-desc'))).toEqual(['armut', 'Çay', 'Elma'])
  })

  it('özel sırada dizi sırasını korur ve girdiyi değiştirmez', () => {
    expect(names(sortSnippets(list, 'manual'))).toEqual(['Çay', 'armut', 'Elma'])
    sortSnippets(list, 'name-asc')
    expect(list.map((s) => s.id)).toEqual(['1', '2', '3'])
  })

  it('groupSnippets kategori içinde seçilen sıralamayı kullanır', () => {
    const groups = groupSnippets([{ id: 'c', name: 'K' }], list, '', 'created-asc')
    expect(names(groups[0].snippets)).toEqual(['armut', 'Elma', 'Çay'])
  })
})

describe('moveInOrder', () => {
  const cat: Record<string, string> = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B' }
  const order = ['a1', 'a2', 'a3', 'b1', 'b2']

  it('aynı kategoride başka bir snippet in önüne taşır', () => {
    expect(moveInOrder(order, 'a3', 'A', 'a1', (id) => cat[id])).toEqual(['a3', 'a1', 'a2', 'b1', 'b2'])
    expect(moveInOrder(order, 'a1', 'A', 'a3', (id) => cat[id])).toEqual(['a2', 'a1', 'a3', 'b1', 'b2'])
  })

  it('beforeId yoksa hedef kategorinin sonuna ekler', () => {
    expect(moveInOrder(order, 'a1', 'A', null, (id) => cat[id])).toEqual(['a2', 'a3', 'a1', 'b1', 'b2'])
    expect(moveInOrder(order, 'a1', 'B', null, (id) => (id === 'a1' ? 'B' : cat[id]))).toEqual([
      'a2',
      'a3',
      'b1',
      'b2',
      'a1'
    ])
  })

  it('başka kategoride bir snippet in önüne taşır', () => {
    expect(moveInOrder(order, 'b2', 'A', 'a2', (id) => (id === 'b2' ? 'A' : cat[id]))).toEqual([
      'a1',
      'b2',
      'a2',
      'a3',
      'b1'
    ])
  })

  it('boş kategoriye bırakılınca listenin sonuna ekler', () => {
    expect(moveInOrder(order, 'a1', 'C', null, (id) => (id === 'a1' ? 'C' : cat[id]))).toEqual([
      'a2',
      'a3',
      'b1',
      'b2',
      'a1'
    ])
  })
})
