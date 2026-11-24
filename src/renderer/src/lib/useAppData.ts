import { useCallback, useEffect, useRef, useState } from 'react'
import { newId } from '../../../shared/data'
import type { AppData, Category, Settings, Snippet } from '../../../shared/types'

export type SnippetDraft = Omit<Snippet, 'id' | 'updatedAt'>

export interface AppDataApi {
  data: AppData | null
  error: string | null
  addCategory(name: string): Category
  renameCategory(id: string, name: string): void
  deleteCategory(id: string): void
  saveSnippet(draft: SnippetDraft, id?: string): Snippet
  duplicateSnippet(id: string): void
  deleteSnippet(id: string): void
  updateSettings(patch: Partial<Settings>): void
  rememberParams(snippetId: string, values: Record<string, string>): void
  replaceData(next: AppData): void
}

/**
 * Uygulama verisinin tek kaynağı. Her değişiklik anında diske yazılır;
 * yazmalar sıraya alınır, böylece eski bir durum yenisinin üzerine yazılamaz.
 */
export function useAppData(onSaveError: (message: string) => void): AppDataApi {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<AppData | null>(null)
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const onSaveErrorRef = useRef(onSaveError)
  onSaveErrorRef.current = onSaveError

  useEffect(() => {
    window.zortex.data
      .load()
      .then((loaded) => {
        dataRef.current = loaded
        setData(loaded)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const commit = useCallback((update: (current: AppData) => AppData) => {
    const current = dataRef.current
    if (!current) return
    const next = update(current)
    if (next === current) return
    dataRef.current = next
    setData(next)
    saveChain.current = saveChain.current
      .then(() => window.zortex.data.save(next))
      .catch((e: unknown) => onSaveErrorRef.current(`Kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`))
  }, [])

  const addCategory = useCallback(
    (name: string): Category => {
      const trimmed = name.trim()
      const existing = dataRef.current?.categories.find(
        (c) => c.name.toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR')
      )
      if (existing) return existing
      const category: Category = { id: newId(), name: trimmed }
      commit((d) => ({ ...d, categories: [...d.categories, category] }))
      return category
    },
    [commit]
  )

  const renameCategory = useCallback(
    (id: string, name: string) =>
      commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) })),
    [commit]
  )

  const deleteCategory = useCallback(
    (id: string) =>
      commit((d) => {
        const removed = new Set(d.snippets.filter((s) => s.categoryId === id).map((s) => s.id))
        const paramHistory = Object.fromEntries(Object.entries(d.paramHistory).filter(([k]) => !removed.has(k)))
        return {
          ...d,
          categories: d.categories.filter((c) => c.id !== id),
          snippets: d.snippets.filter((s) => s.categoryId !== id),
          paramHistory
        }
      }),
    [commit]
  )

  const saveSnippet = useCallback(
    (draft: SnippetDraft, id?: string): Snippet => {
      const snippet: Snippet = { ...draft, name: draft.name.trim(), id: id ?? newId(), updatedAt: Date.now() }
      const description = draft.description?.trim()
      if (description) snippet.description = description
      else delete snippet.description
      commit((d) => ({
        ...d,
        snippets: id ? d.snippets.map((s) => (s.id === id ? snippet : s)) : [...d.snippets, snippet]
      }))
      return snippet
    },
    [commit]
  )

  const duplicateSnippet = useCallback(
    (id: string) =>
      commit((d) => {
        const source = d.snippets.find((s) => s.id === id)
        if (!source) return d
        const copy: Snippet = { ...source, id: newId(), name: `${source.name} (kopya)`, updatedAt: Date.now() }
        return { ...d, snippets: [...d.snippets, copy] }
      }),
    [commit]
  )

  const deleteSnippet = useCallback(
    (id: string) =>
      commit((d) => {
        const { [id]: _removed, ...paramHistory } = d.paramHistory
        void _removed
        return { ...d, snippets: d.snippets.filter((s) => s.id !== id), paramHistory }
      }),
    [commit]
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => commit((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    [commit]
  )

  const rememberParams = useCallback(
    (snippetId: string, values: Record<string, string>) =>
      commit((d) => ({ ...d, paramHistory: { ...d.paramHistory, [snippetId]: values } })),
    [commit]
  )

  const replaceData = useCallback((next: AppData) => commit(() => next), [commit])

  return {
    data,
    error,
    addCategory,
    renameCategory,
    deleteCategory,
    saveSnippet,
    duplicateSnippet,
    deleteSnippet,
    updateSettings,
    rememberParams,
    replaceData
  }
}
