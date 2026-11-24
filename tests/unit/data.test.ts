import { describe, expect, it } from 'vitest'
import { createDefaultData, mergeData, sanitizeData } from '../../src/shared/data'

describe('createDefaultData', () => {
  it.each(['win32', 'darwin'] as const)('%s için geçerli örnek veri üretir', (platform) => {
    const data = createDefaultData(platform)
    expect(data.snippets.length).toBeGreaterThan(0)
    const ids = new Set(data.categories.map((c) => c.id))
    expect(data.snippets.every((s) => ids.has(s.categoryId))).toBe(true)
    expect(sanitizeData(data)).toEqual(data)
  })
})

describe('sanitizeData', () => {
  it('nesne olmayan girdiyi reddeder', () => {
    expect(() => sanitizeData(null)).toThrow()
    expect(() => sanitizeData([])).toThrow()
  })

  it('bozuk kayıtları atar ve kategorisi kayıp snippet için kategori oluşturur', () => {
    const data = sanitizeData({
      categories: [{ id: 'a', name: 'A' }, { id: 'a', name: 'Tekrar' }, { name: '' }, 5],
      snippets: [
        { id: 's1', name: 'Bir', command: 'echo 1', categoryId: 'a' },
        { id: 's2', name: 'Yetim', command: 'echo 2', categoryId: 'yok' },
        { id: 's3', name: '', command: 'echo 3', categoryId: 'a' },
        { id: 's1', name: 'Aynı id', command: 'echo 4', categoryId: 'a' }
      ],
      settings: { fontSize: 99 },
      paramHistory: { s1: { x: '1', y: 2 }, silinmis: { a: 'b' } }
    })
    expect(data.categories.map((c) => c.name)).toEqual(['A', 'Kategorisiz'])
    expect(data.snippets).toHaveLength(3)
    expect(new Set(data.snippets.map((s) => s.id)).size).toBe(3)
    expect(data.snippets.find((s) => s.name === 'Yetim')?.categoryId).toBe(data.categories[1].id)
    expect(data.snippets[0].autoRun).toBe(true)
    expect(data.settings.fontSize).toBe(32)
    expect(data.paramHistory).toEqual({ s1: { x: '1' } })
  })
})

describe('mergeData', () => {
  it('kategorileri ada göre eşleştirir ve tekrar eden snippetleri atlar', () => {
    const current = sanitizeData({
      categories: [{ id: 'g', name: 'Git' }],
      snippets: [{ id: '1', name: 'Durum', command: 'git status', categoryId: 'g' }]
    })
    const incoming = sanitizeData({
      categories: [
        { id: 'x', name: 'git' },
        { id: 'y', name: 'Docker' }
      ],
      snippets: [
        { id: '1', name: 'Durum', command: 'git status', categoryId: 'x' },
        { id: '2', name: 'Log', command: 'git log', categoryId: 'x' },
        { id: '3', name: 'ps', command: 'docker ps', categoryId: 'y' }
      ]
    })
    const { data, result } = mergeData(current, incoming)
    expect(result).toEqual({ categoriesAdded: 1, snippetsAdded: 2 })
    expect(data.categories.map((c) => c.name)).toEqual(['Git', 'Docker'])
    expect(data.snippets.filter((s) => s.categoryId === 'g').map((s) => s.name)).toEqual(['Durum', 'Log'])
  })
})
