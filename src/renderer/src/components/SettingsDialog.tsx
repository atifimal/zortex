import { useEffect, useState } from 'react'
import { Download, FolderOpen, Upload } from 'lucide-react'
import { Modal } from './Modal'
import type { CompletionMode, Settings, ShellInfo } from '../../../shared/types'
import { isMac, shortcutLabel } from '../lib/platform'

interface Props {
  settings: Settings
  onChange(patch: Partial<Settings>): void
  onImport(): void
  onExport(): void
  onClose(): void
}

export function SettingsDialog({ settings, onChange, onImport, onExport, onClose }: Props) {
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [location, setLocation] = useState('')

  useEffect(() => {
    void window.zortex.shells.list().then(setShells)
    void window.zortex.data.location().then(setLocation)
  }, [])

  const focusKeys = isMac ? '⌘1 … ⌘4' : 'Ctrl+Shift+1 … 4'
  const shortcuts: [string, string][] = [
    ['Snippet ara', shortcutLabel('F')],
    ['Yeni snippet', shortcutLabel('N')],
    ['Kenar çubuğunu aç/kapat', shortcutLabel('B')],
    ['Hedef terminali seç', focusKeys],
    ['Kopyala / yapıştır', isMac ? '⌘C / ⌘V' : 'Ctrl+C (seçim varken) / Ctrl+V'],
    ['Seçimi kopyala veya yapıştır', 'Sağ tık'],
    ['Bağlantıyı aç', isMac ? '⌘ + tıklama' : 'Ctrl + tıklama']
  ]

  return (
    <Modal title="Ayarlar" onClose={onClose} width={560} testId="settings-dialog">
      <div className="form">
        <div className="form-row">
          <label className="field grow">
            <span className="field-label">Kabuk</span>
            <select className="input" value={settings.shellId} onChange={(e) => onChange({ shellId: e.target.value })}>
              <option value="">Otomatik ({shells[0]?.name ?? '…'})</option>
              {shells.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="field-hint">Yeni açılan ve yeniden başlatılan terminallerde geçerli olur.</span>
          </label>
          <label className="field" style={{ width: 130 }}>
            <span className="field-label">Yazı boyutu</span>
            <input
              className="input"
              type="number"
              min={8}
              max={32}
              value={settings.fontSize}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 8 && n <= 32) onChange({ fontSize: Math.round(n) })
              }}
            />
          </label>
        </div>

        <div className="form-row">
          <label className="field grow">
            <span className="field-label">Komut ve dosya önerileri</span>
            <select
              className="input"
              value={settings.completion}
              onChange={(e) => onChange({ completion: e.target.value as CompletionMode })}
              data-testid="setting-completion"
            >
              <option value="auto">Yazarken göster</option>
              <option value="tab">Yalnızca Tab / Ctrl+Space ile</option>
              <option value="off">Kapalı</option>
            </select>
            <span className="field-hint">
              ↑/↓ seç · Tab tamamla · Ctrl+Space ayrıntılı görünüm · Esc kapat. Öneri yoksa Tab kabuğun kendi tamamlamasına gider.
            </span>
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.shellIntegration}
            onChange={(e) => onChange({ shellIntegration: e.target.checked })}
            data-testid="setting-shell-integration"
          />
          <span>
            Kabuk entegrasyonu{' '}
            <span className="muted">
              — kabuk her istemde bulunduğu klasörü bildirir; öneriler özel istem temalarında ve Git Bash'te de çalışır.
              Yeni açılan terminallerde geçerli olur.
            </span>
          </span>
        </label>

        <div className="field">
          <span className="field-label">Snippet'ler</span>
          <div className="button-row">
            <button className="btn" onClick={onImport}>
              <Upload size={14} /> İçe aktar
            </button>
            <button className="btn" onClick={onExport}>
              <Download size={14} /> Dışa aktar
            </button>
            <button className="btn" onClick={() => void window.zortex.data.openLocation()}>
              <FolderOpen size={14} /> Veri klasörünü aç
            </button>
          </div>
          <span className="field-hint mono-path" title={location}>
            {location}
          </span>
        </div>

        <div className="field">
          <span className="field-label">Kısayollar</span>
          <table className="shortcut-table">
            <tbody>
              {shortcuts.map(([label, keys]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    <kbd>{keys}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
