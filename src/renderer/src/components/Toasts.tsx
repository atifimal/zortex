import { useCallback, useRef, useState } from 'react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

export type ToastKind = 'info' | 'success' | 'error'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
    },
    [dismiss]
  )

  return { toasts, notify, dismiss }
}

const ICONS = { info: Info, success: CircleCheck, error: TriangleAlert }

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss(id: number): void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            <Icon size={15} />
            <span>{t.message}</span>
            <button className="icon-btn" onClick={() => onDismiss(t.id)} aria-label="Kapat">
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
