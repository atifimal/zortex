import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  subtitle?: ReactNode
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  width?: number
  /** Arka plana tıklayınca kapansın mı (form içeren pencerelerde veri kaybını önlemek için kapalı). */
  dismissOnBackdrop?: boolean
  testId?: string
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ title, subtitle, onClose, children, footer, width = 480, dismissOnBackdrop = true, testId }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current!
    // İlk odaklanabilir giriş alanına (yoksa ilk düğmeye) odaklan.
    const auto = dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>('input, textarea, select')
    ;(auto ?? dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        // Odak pencerenin içinde kalsın.
        const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    dialog.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
        style={{ width }}
        data-testid={testId}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat" title="Kapat (Esc)">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}
