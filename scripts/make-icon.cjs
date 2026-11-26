// Uygulama ikonunu SVG'den üretir: `npx electron scripts/make-icon.cjs`
// Çıktılar:
//   build/icon.png     (1024x1024) electron-builder bundan .ico ve .icns üretir.
//   resources/icon.png (256x256)   pencere/Dock ikonu ve üst şeritteki logo.
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 1024
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#132219"/>
      <stop offset="1" stop-color="#070b09"/>
    </linearGradient>
    <linearGradient id="z" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bbf7d0"/>
      <stop offset="1" stop-color="#4ade80"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#22c55e" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#22c55e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <rect x="64.5" y="64.5" width="895" height="895" rx="200" fill="none" stroke="#1f3a2a" stroke-width="3"/>
  <circle cx="512" cy="512" r="400" fill="url(#glow)"/>
  <!-- zort.ing "Z!" logosu (public/favicon.svg, 64x64), yeşile boyanmış -->
  <g transform="translate(178 178) scale(10.5)"><g transform="translate(9.04 57.47) scale(0.58883 0.58883)"><g transform="rotate(-8)"><g transform="translate(0 0)"><path fill="#052e16" transform="translate(5.77 7.69)" d="M0.80-0.90L0.80-0.90L0.80-15.50L29.30-54.20Q26.40-54.20 24.05-53.95Q21.70-53.70 18.65-53.25Q15.60-52.80 10.40-52.10L10.40-52.10L12.30-67.80L53.20-70.70L50.60-56.90L23.30-18.10Q24.70-18.10 27.90-18.25Q31.10-18.40 35.15-18.65Q39.20-18.90 43.10-19.20L43.10-19.20L43.10-4Q41.90-4 37.10-3.80Q32.30-3.60 23.90-3.10L23.90-3.10Q16.30-2.60 10.15-2.05Q4-1.50 0.80-0.90Z"/><path fill="url(#z)" stroke="#15803d" stroke-width="11.54" stroke-linejoin="round" paint-order="stroke" d="M0.80-0.90L0.80-0.90L0.80-15.50L29.30-54.20Q26.40-54.20 24.05-53.95Q21.70-53.70 18.65-53.25Q15.60-52.80 10.40-52.10L10.40-52.10L12.30-67.80L53.20-70.70L50.60-56.90L23.30-18.10Q24.70-18.10 27.90-18.25Q31.10-18.40 35.15-18.65Q39.20-18.90 43.10-19.20L43.10-19.20L43.10-4Q41.90-4 37.10-3.80Q32.30-3.60 23.90-3.10L23.90-3.10Q16.30-2.60 10.15-2.05Q4-1.50 0.80-0.90Z"/></g><g transform="translate(-130 0)"><path fill="#052e16" transform="translate(5.77 7.69)" d="M189.40-23.10L189.40-23.10Q191-29.30 192.50-35.40Q194-41.50 195.50-47.60L195.50-47.60Q196.90-53.70 198.45-59.85Q200-66 201.60-72.10L201.60-72.10Q207.30-73 212-73.60Q216.70-74.20 219.70-74.70L219.70-74.70Q214.30-62.10 209.85-49.35Q205.40-36.60 201-23.70L201-23.70Q198.10-23.70 195.20-23.50Q192.30-23.30 189.40-23.10ZM189.20 2.30L189.20 2.30Q186.20 2.30 184.25 0.85Q182.30-0.60 181.35-2.75Q180.40-4.90 180.40-7.10L180.40-7.10Q180.40-11.10 183.05-14.05Q185.70-17 190.40-17L190.40-17Q196.20-17 199.10-14.25Q202-11.50 202-8L202-8Q202-4 198.70-0.85Q195.40 2.30 189.20 2.30Z"/><path fill="url(#z)" stroke="#15803d" stroke-width="11.54" stroke-linejoin="round" paint-order="stroke" d="M189.40-23.10L189.40-23.10Q191-29.30 192.50-35.40Q194-41.50 195.50-47.60L195.50-47.60Q196.90-53.70 198.45-59.85Q200-66 201.60-72.10L201.60-72.10Q207.30-73 212-73.60Q216.70-74.20 219.70-74.70L219.70-74.70Q214.30-62.10 209.85-49.35Q205.40-36.60 201-23.70L201-23.70Q198.10-23.70 195.20-23.50Q192.30-23.30 189.40-23.10ZM189.20 2.30L189.20 2.30Q186.20 2.30 184.25 0.85Q182.30-0.60 181.35-2.75Q180.40-4.90 180.40-7.10L180.40-7.10Q180.40-11.10 183.05-14.05Q185.70-17 190.40-17L190.40-17Q196.20-17 199.10-14.25Q202-11.50 202-8L202-8Q202-4 198.70-0.85Q195.40 2.30 189.20 2.30Z"/></g></g></g></g>
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
  const res = join(__dirname, '..', 'resources')
  mkdirSync(res, { recursive: true })
  writeFileSync(join(res, 'icon.png'), image.resize({ width: 256, height: 256, quality: 'best' }).toPNG())
  console.log('build/icon.png ve resources/icon.png yazıldı', image.getSize())
  app.quit()
})
