// Uygulama ikonunu SVG'den üretir: `npx electron scripts/make-icon.cjs`
// Çıktı: build/icon.png (1024x1024). electron-builder bundan .ico ve .icns üretir.
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 1024
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a2133"/>
      <stop offset="1" stop-color="#0b0e14"/>
    </linearGradient>
    <linearGradient id="z" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9dbbff"/>
      <stop offset="0.5" stop-color="#6f9bff"/>
      <stop offset="1" stop-color="#b18cff"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <rect x="64.5" y="64.5" width="895" height="895" rx="200" fill="none" stroke="#2e3749" stroke-width="3"/>
  <line x1="512" y1="200" x2="512" y2="824" stroke="#2e3749" stroke-width="10" stroke-dasharray="4 26" stroke-linecap="round"/>
  <line x1="200" y1="512" x2="824" y2="512" stroke="#2e3749" stroke-width="10" stroke-dasharray="4 26" stroke-linecap="round"/>
  <path d="M300 300 H724 L360 724 H724" fill="none" stroke="url(#z)" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const out = join(__dirname, '..', 'build')
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'icon.png'), image.resize({ width: SIZE, height: SIZE }).toPNG())
  console.log('build/icon.png yazıldı', image.getSize())
  app.quit()
})
