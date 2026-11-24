import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Braces } from 'lucide-react'
import { Modal } from './Modal'
import { extractParams, insertParamPlaceholder } from '../../../shared/params'
import type { Category, Snippet } from '../../../shared/types'
import type { SnippetDraft } from '../lib/useAppData'
import { isMac } from '../lib/platform'

const NEW_CATEGORY = '__new__'

interface Props {
  snippet?: Snippet
  categories: Category[]
  defaultCategoryId?: string
  onSave(draft: SnippetDraft, newCategoryName?: string): void
  onClose(): void
}

export function SnippetEditor({ snippet, categories, defaultCategoryId, onSave, onClose }: Props) {
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'tr-TR', { sensitivity: 'base' })),
    [categories]
  )
  const [name, setName] = useState(snippet?.name ?? '')
  const [command, setCommand] = useState(snippet?.command ?? '')
  const [description, setDescription] = useState(snippet?.description ?? '')
  const [autoRun, setAutoRun] = useState(snippet?.autoRun ?? true)
  const [categoryId, setCategoryId] = useState(
    snippet?.categoryId ?? defaultCategoryId ?? sortedCategories[0]?.id ?? NEW_CATEGORY
  )
  const [newCategory, setNewCategory] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const commandRef = useRef<HTMLTextAreaElement>(null)

  const params = useMemo(() => extractParams(command), [command])
  const hasEmptyPlaceholder = /\{\{\s*\}\}/.test(command)

  const insertParam = (): void => {
    const el = commandRef.current
    if (!el) return
    const { text, caret } = insertParamPlaceholder(command, el.selectionStart, el.selectionEnd)
    setCommand(text)
    setErrors((e) => ({ ...e, command: '' }))
    // Değer React tarafından yazıldıktan sonra imleci parantezlerin ortasına koy.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const onCommandKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      insertParam()
    } else if (mod && e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Snippet adı gerekli'
    if (!command.trim()) next.command = 'Komut boş olamaz'
    if (categoryId === NEW_CATEGORY && !newCategory.trim()) next.category = 'Kategori adı gerekli'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSave(
      { name, command, description, autoRun, categoryId: categoryId === NEW_CATEGORY ? '' : categoryId },
      categoryId === NEW_CATEGORY ? newCategory.trim() : undefined
    )
    onClose()
  }

  const modKey = isMac ? '⌘' : 'Ctrl'

  return (
    <Modal
      title={snippet ? "Snippet'i düzenle" : 'Yeni snippet'}
      onClose={onClose}
      width={620}
      dismissOnBackdrop={false}
      testId="snippet-editor"
    >
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label className="field grow">
            <span className="field-label">Ad</span>
            <input
              className={`input${errors.name ? ' has-error' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Sunucuya bağlan"
              maxLength={120}
              data-autofocus
              data-testid="snippet-name"
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label className="field" style={{ width: 210 }}>
            <span className="field-label">Kategori</span>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              data-testid="snippet-category"
            >
              {sortedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ Yeni kategori…</option>
            </select>
          </label>
        </div>

        {categoryId === NEW_CATEGORY && (
          <label className="field">
            <span className="field-label">Yeni kategori adı</span>
            <input
              className={`input${errors.category ? ' has-error' : ''}`}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="ör. Docker"
              maxLength={80}
              autoFocus
              data-testid="snippet-new-category"
            />
            {errors.category && <span className="field-error">{errors.category}</span>}
          </label>
        )}

        <div className="field">
          <div className="field-label-row">
            <span className="field-label">Komut</span>
            <button
              type="button"
              className="btn btn-small"
              onMouseDown={(e) => e.preventDefault() /* textarea seçimini koru */}
              onClick={insertParam}
              title={`İmlecin olduğu yere {{ }} ekler (${modKey}+Shift+P)`}
              data-testid="insert-param"
            >
              <Braces size={13} /> Parametre ekle
            </button>
          </div>
          <textarea
            ref={commandRef}
            className={`input mono${errors.command ? ' has-error' : ''}`}
            value={command}
            onChange={(e) => {
              setCommand(e.target.value)
              if (errors.command) setErrors((x) => ({ ...x, command: '' }))
            }}
            onKeyDown={onCommandKeyDown}
            rows={5}
            spellCheck={false}
            placeholder={'ör. ssh {{kullanıcı}}@{{sunucu}} -p {{port:22}}'}
            data-testid="snippet-command"
          />
          {errors.command && <span className="field-error">{errors.command}</span>}
          <div className="param-hint">
            {params.length > 0 ? (
              <>
                <span className="muted">Parametreler:</span>
                {params.map((p) => (
                  <span key={p.name} className="chip" data-testid="param-chip">
                    {p.name}
                    {p.defaultValue !== undefined && <span className="chip-default">= {p.defaultValue || '""'}</span>}
                  </span>
                ))}
              </>
            ) : (
              <span className="muted">
                Parametre için <code>{'{{ad}}'}</code>, varsayılan değer için <code>{'{{ad:değer}}'}</code> yazın.
              </span>
            )}
            {hasEmptyPlaceholder && <span className="warn-text">Boş {'{{}}'} yer tutucusu var, adını yazmayı unutmayın.</span>}
          </div>
        </div>

        <label className="field">
          <span className="field-label">
            Açıklama <span className="muted">(isteğe bağlı)</span>
          </span>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Bu snippet ne işe yarıyor?"
            maxLength={240}
          />
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} data-testid="snippet-autorun" />
          <span>
            Hemen çalıştır <span className="muted">— kapalıysa komut terminale yazılır, Enter'a siz basarsınız</span>
          </span>
        </label>

        <div className="form-actions">
          <span className="muted small">{modKey}+Enter ile kaydet</span>
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary" data-testid="snippet-save">
            Kaydet
          </button>
        </div>
      </form>
    </Modal>
  )
}
