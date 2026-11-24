import { useMemo, useState, type FormEvent } from 'react'
import { Play } from 'lucide-react'
import { Modal } from './Modal'
import { extractParams, fillParams } from '../../../shared/params'
import type { Snippet } from '../../../shared/types'

interface Props {
  snippet: Snippet
  targetLabel: string
  history: Record<string, string> | undefined
  onRun(values: Record<string, string>): void
  onClose(): void
}

export function ParamPrompt({ snippet, targetLabel, history, onRun, onClose }: Props) {
  const params = useMemo(() => extractParams(snippet.command), [snippet.command])
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(params.map((p) => [p.name, history?.[p.name] ?? p.defaultValue ?? '']))
  )
  const preview = fillParams(snippet.command, values)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    onRun(values)
    onClose()
  }

  return (
    <Modal
      title={snippet.name}
      subtitle={
        <>
          Hedef: <strong>{targetLabel}</strong>
          {snippet.description ? ` · ${snippet.description}` : ''}
        </>
      }
      onClose={onClose}
      width={520}
      testId="param-prompt"
    >
      <form className="form" onSubmit={submit}>
        {params.map((p, i) => (
          <label className="field" key={p.name}>
            <span className="field-label">
              {p.name}
              {p.defaultValue !== undefined && <span className="muted"> — varsayılan: {p.defaultValue || '(boş)'}</span>}
            </span>
            <input
              className="input mono"
              value={values[p.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
              onFocus={(e) => e.currentTarget.select()}
              spellCheck={false}
              autoFocus={i === 0}
              data-autofocus={i === 0 ? true : undefined}
              data-testid={`param-${p.name}`}
            />
          </label>
        ))}
        <div className="field">
          <span className="field-label">Önizleme</span>
          <pre className="command-preview" data-testid="param-preview">
            {preview}
          </pre>
        </div>
        <div className="form-actions">
          <span className="muted small">{snippet.autoRun ? 'Enter: çalıştır' : 'Enter: terminale yaz'} · Esc: vazgeç</span>
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary" data-testid="param-run">
            <Play size={13} /> {snippet.autoRun ? 'Çalıştır' : 'Terminale yaz'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
