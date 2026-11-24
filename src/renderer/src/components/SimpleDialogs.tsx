import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'

interface ConfirmProps {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm(): void
  onClose(): void
}

export function ConfirmDialog({ title, message, confirmLabel = 'Onayla', danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      testId="confirm-dialog"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            data-autofocus
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="dialog-message">{message}</p>
    </Modal>
  )
}

interface PromptProps {
  title: string
  label: string
  initialValue?: string
  confirmLabel?: string
  placeholder?: string
  validate?(value: string): string | null
  onSubmit(value: string): void
  onClose(): void
}

export function PromptDialog({
  title,
  label,
  initialValue = '',
  confirmLabel = 'Kaydet',
  placeholder,
  validate,
  onSubmit,
  onClose
}: PromptProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = value.trim()
    const problem = !trimmed ? 'Bu alan boş bırakılamaz' : (validate?.(trimmed) ?? null)
    if (problem) {
      setError(problem)
      return
    }
    onSubmit(trimmed)
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose} width={400} testId="prompt-dialog">
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field-label">{label}</span>
          <input
            className={`input${error ? ' has-error' : ''}`}
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onFocus={(e) => e.currentTarget.select()}
            maxLength={80}
          />
          {error && <span className="field-error">{error}</span>}
        </label>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
