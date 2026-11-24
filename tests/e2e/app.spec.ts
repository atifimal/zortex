import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

/**
 * Uçtan uca testler derlenmiş uygulamayı (out/) çalıştırır: önce `npm run build`.
 * Her test boş bir veri klasörüyle başlar.
 */

let app: ElectronApplication
let page: Page
let dataDir: string

const screenshotDir = process.env.ZORTEX_SCREENSHOT_DIR

async function shot(name: string): Promise<void> {
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `${name}.png`), animations: 'disabled' })
}

/** Belirtilen terminalin çıktısını sayfa içinde biriktirmeye başlar. */
async function recordOutput(paneId: string): Promise<void> {
  await page.evaluate((id) => {
    const w = window as unknown as { __out: Record<string, string> }
    w.__out ??= {}
    w.__out[id] = ''
    window.zortex.pty.onData(id, (d) => {
      w.__out[id] += d
    })
  }, paneId)
}

async function output(paneId: string): Promise<string> {
  return page.evaluate((id) => (window as unknown as { __out: Record<string, string> }).__out[id] ?? '', paneId)
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'zortex-e2e-'))
  const env = { ...process.env, ZORTEX_DATA_DIR: dataDir } as Record<string, string>
  // ZORTEX_E2E_EXE verilirse paketlenmiş uygulama (ör. dist/win-unpacked/Zortex.exe) test edilir.
  const exe = process.env.ZORTEX_E2E_EXE
  app = await electron.launch(exe ? { executablePath: exe, args: [], env } : { args: ['.'], env })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 }).catch(() => {})
  await expect(page.getByTestId('pane-1')).toBeVisible()
  await expect(page.getByTestId('pane-1').locator('.pane-title')).not.toHaveText('Başlatılıyor…')
})

test.afterEach(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

test('örnek snippetler kategorilere ayrılmış olarak listelenir ve aranabilir', async () => {
  await expect(page.getByTestId('category')).toHaveCount(3)
  await shot('01-baslangic')

  await page.getByTestId('search').fill('bağlantı')
  await expect(page.getByTestId('snippet')).toHaveCount(1)
  await expect(page.getByTestId('snippet')).toContainText('SSH bağlantısı')

  await page.getByTestId('search').fill('GIT')
  await expect(page.getByTestId('category')).toHaveCount(1)
  await shot('02-arama')

  await page.getByTestId('search').fill('')
  const git = page.getByTestId('category').filter({ hasText: 'Git' })
  await git.getByTestId('category-toggle').click()
  await expect(git.getByTestId('snippet')).toHaveCount(0)
  await git.getByTestId('category-toggle').click()
  await expect(git.getByTestId('snippet')).toHaveCount(3)
})

test('parametreli snippet oluşturulur, parametreler sorulur ve hedef terminalde çalışır', async () => {
  await page.getByTestId('new-snippet').click()
  const editor = page.getByTestId('snippet-editor')
  await expect(editor).toBeVisible()

  await editor.getByTestId('snippet-name').fill('Selamla')
  const command = editor.getByTestId('snippet-command')
  await command.click()
  await command.pressSequentially('echo merhaba-')
  await editor.getByTestId('insert-param').click()
  // İmleç parantezlerin ortasında olmalı: doğrudan yazılan metin içeri girer.
  await command.pressSequentially('isim')
  await expect(command).toHaveValue('echo merhaba-{{isim}}')
  await command.press('End')
  await command.pressSequentially('-')
  await editor.getByTestId('insert-param').click()
  await command.pressSequentially('ek:varsayilan')
  await expect(command).toHaveValue('echo merhaba-{{isim}}-{{ek:varsayilan}}')
  await expect(editor.getByTestId('param-chip')).toHaveCount(2)

  await editor.getByTestId('snippet-category').selectOption({ label: '+ Yeni kategori…' })
  await editor.getByTestId('snippet-new-category').fill('Test')
  await shot('03-editor')
  await editor.getByTestId('snippet-save').click()
  await expect(editor).toBeHidden()

  await expect(page.getByTestId('category').filter({ hasText: 'Test' })).toHaveCount(1)

  // Dört bölmeye geç, 3. terminali hedef yap.
  await page.getByTestId('layout-grid').click()
  for (const n of [1, 2, 3, 4]) await expect(page.getByTestId(`pane-${n}`)).toBeVisible()
  await expect(page.getByTestId('pane-4').locator('.pane-title')).not.toHaveText('Başlatılıyor…')
  await page.getByTestId('pane-3').locator('.pane-body').click()
  await expect(page.getByTestId('pane-3')).toHaveAttribute('data-focused', 'true')
  await expect(page.getByTestId('pane-1')).toHaveAttribute('data-focused', 'false')
  await expect(page.getByTestId('target-indicator')).toContainText('Terminal 3')

  await recordOutput('pane-3')
  await recordOutput('pane-1')

  await page.getByTestId('search').fill('selamla')
  await page.getByTestId('snippet-run').click()
  const prompt = page.getByTestId('param-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('Terminal 3')
  await expect(prompt.getByTestId('param-ek')).toHaveValue('varsayilan')
  await prompt.getByTestId('param-isim').fill('zortex42')
  await expect(prompt.getByTestId('param-preview')).toHaveText('echo merhaba-zortex42-varsayilan')
  await shot('04-parametre')
  await prompt.getByTestId('param-isim').press('Enter')
  await expect(prompt).toBeHidden()

  await expect.poll(() => output('pane-3')).toContain('merhaba-zortex42-varsayilan')
  expect(await output('pane-1')).not.toContain('zortex42')
  await page.waitForTimeout(300)
  await shot('05-dort-bolme')

  // Son girilen değerler bir sonraki çalıştırmada hatırlanır.
  await page.getByTestId('snippet-run').click()
  await expect(page.getByTestId('param-isim')).toHaveValue('zortex42')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('param-prompt')).toBeHidden()

  // Veri diske yazılmış olmalı.
  const saved = JSON.parse(readFileSync(join(dataDir, 'data.json'), 'utf8'))
  expect(saved.snippets.some((s: { command: string }) => s.command === 'echo merhaba-{{isim}}-{{ek:varsayilan}}')).toBe(true)
  expect(Object.values(saved.paramHistory)).toContainEqual({ isim: 'zortex42', ek: 'varsayilan' })
})

test('ikiye bölme ve yerleşim değişiminde oturumlar korunur', async () => {
  await page.getByTestId('layout-columns').click()
  await expect(page.getByTestId('pane-2')).toBeVisible()
  await page.getByTestId('pane-2').locator('.pane-body').click()
  await expect(page.getByTestId('target-indicator')).toContainText('Terminal 2')

  await recordOutput('pane-2')
  await page.keyboard.type('echo oturum-korundu')
  await page.keyboard.press('Enter')
  await expect.poll(() => output('pane-2')).toContain('oturum-korundu')

  // Tek terminale dönünce hedef 1'e düşer, 2. bölme gizlenir ama kapanmaz.
  await page.getByTestId('layout-single').click()
  await expect(page.getByTestId('pane-2')).toBeHidden()
  await expect(page.getByTestId('target-indicator')).toContainText('Terminal 1')

  await page.getByTestId('layout-rows').click()
  await expect(page.getByTestId('pane-2')).toBeVisible()
  await expect(page.getByTestId('pane-2').locator('.pane-status')).toHaveCount(0)
  await shot('06-alt-alta')
})

test('snippet düzenlenir ve silinir', async () => {
  const durum = page.getByTestId('snippet').filter({ hasText: 'Durum' })
  await durum.getByTestId('snippet-run').focus() // satır eylemleri odakta da görünür
  await durum.getByTestId('snippet-edit').click()
  const editor = page.getByTestId('snippet-editor')
  await editor.getByTestId('snippet-name').fill('Kısa durum')
  await editor.getByTestId('snippet-save').click()
  await expect(page.getByTestId('snippet').filter({ hasText: 'Kısa durum' })).toHaveCount(1)

  const edited = page.getByTestId('snippet').filter({ hasText: 'Kısa durum' })
  await edited.getByTestId('snippet-run').focus()
  await edited.getByTestId('snippet-delete').click()
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Sil' }).click()
  await expect(page.getByTestId('snippet').filter({ hasText: 'Kısa durum' })).toHaveCount(0)
})
