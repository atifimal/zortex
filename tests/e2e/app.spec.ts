import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** Biriken çıktı; görünmez OSC dizileri (kabuk entegrasyonu) çıkarılmış. ConPTY bunları metnin ortasına koyabilir. */
async function output(paneId: string): Promise<string> {
  const raw = await page.evaluate((id) => (window as unknown as { __out: Record<string, string> }).__out[id] ?? '', paneId)
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
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

test('snippetler sıralanır ve sürükle-bırak ile özel sıraya dizilir', async () => {
  // Snippet komutları da kategori adını içerebildiği için kategori başlığına göre eşleştir.
  const category = (name: string) =>
    page.getByTestId('category').filter({ has: page.locator('.tree-category-name', { hasText: new RegExp(`^${name}$`) }) })
  const git = category('Git')
  const names = (): Promise<string[]> =>
    git.locator('.snippet-name').evaluateAll((els) => els.map((e) => e.firstChild?.textContent ?? ''))
  await expect.poll(names).toEqual(['Commit', 'Durum', 'Yeni dal oluştur'])

  await page.getByTestId('sort-button').click()
  await page.getByTestId('sort-name-desc').click()
  await expect.poll(names).toEqual(['Yeni dal oluştur', 'Durum', 'Commit'])

  // "Commit"i en üste sürükle: sıralama özel sıraya geçer ve ekrandaki sıra korunur.
  await git.getByTestId('snippet').filter({ hasText: 'Commit' }).dragTo(git.getByTestId('snippet').first(), {
    targetPosition: { x: 40, y: 4 }
  })
  await expect.poll(names).toEqual(['Commit', 'Yeni dal oluştur', 'Durum'])
  await page.getByTestId('sort-button').click()
  await expect(page.getByTestId('sort-manual')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')

  // Başka kategoriye taşı.
  const ag = category('Ağ')
  await git.getByTestId('snippet').filter({ hasText: 'Durum' }).dragTo(ag.getByTestId('category-toggle'))
  await expect(ag.getByTestId('snippet').filter({ hasText: 'Durum' })).toHaveCount(1)
  await expect.poll(names).toEqual(['Commit', 'Yeni dal oluştur'])

  // Klavye ile: Alt+↓
  await git.getByTestId('snippet').filter({ hasText: 'Commit' }).getByTestId('snippet-run').focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(names).toEqual(['Yeni dal oluştur', 'Commit'])
  await shot('07-siralama')

  await expect
    .poll(() => {
      const saved = JSON.parse(readFileSync(join(dataDir, 'data.json'), 'utf8'))
      const gitId = saved.categories.find((c: { name: string }) => c.name === 'Git').id
      return saved.snippets.filter((s: { categoryId: string }) => s.categoryId === gitId).map((s: { name: string }) => s.name)
    })
    .toEqual(['Yeni dal oluştur', 'Commit'])
})

/** Testler için geçici bir klasör ağacı oluşturur ve 1. terminalde o klasöre geçer. */
async function enterTempTree(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'zortex-cd-'))
  mkdirSync(join(root, 'alpha', 'inner'), { recursive: true })
  mkdirSync(join(root, 'beta'))
  mkdirSync(join(root, '.hidden'))
  writeFileSync(join(root, 'notes.txt'), 'zortex-dosya-icerigi\n')
  await recordOutput('pane-1')
  await page.getByTestId('pane-1').locator('.pane-body').click()
  await page.keyboard.type(`cd "${root}"`)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  return root
}

const completion = (): ReturnType<Page['getByTestId']> => page.getByTestId('completion')
const names = (): ReturnType<Page['getByTestId']> => completion().getByTestId('completion-name')

test('cd yazınca imlecin altında klasör önerileri çıkar ve seçilen tamamlanır', async () => {
  const root = await enterTempTree()
  try {
    await page.keyboard.type('cd ')
    await expect(completion()).toBeVisible()
    await expect(names()).toHaveText(['.', '..', '~', 'alpha', 'beta'])
    await shot('08-cd-oneri')

    await page.keyboard.type('al')
    await expect(names()).toHaveText(['alpha'])
    await page.keyboard.press('Tab')
    // Klasöre girildi: alt klasörü listelenir.
    await expect(names()).toHaveText(['inner'])
    await page.keyboard.press('ArrowDown')
    await expect(completion().getByTestId('completion-item').first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(names()).toHaveCount(0)
    // Seçim yokken Enter komutu çalıştırır.
    await page.keyboard.press('Enter')
    await expect(completion()).toBeHidden()

    await page.keyboard.type('echo "[$(pwd)]"')
    await page.keyboard.press('Enter')
    await expect.poll(() => output('pane-1')).toMatch(/\[[^\]\r\n]*alpha[\\/]inner\]/)

    // Esc listeyi kapatır.
    await page.keyboard.type('cd ')
    await expect(completion()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(completion()).toBeHidden()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('komut adları ve dosyalar önerilir; Ctrl+Space ayrıntılı görünümü açar', async () => {
  const root = await enterTempTree()
  try {
    // Komut adı: Windows'ta PowerShell cmdlet'i, macOS'ta kabuğun yerleşik komutu.
    const [typed, expected] = process.platform === 'win32' ? ['Get-ChildIt', 'Get-ChildItem'] : ['ech', 'echo']
    await page.keyboard.type(typed)
    await expect(names().filter({ hasText: new RegExp(`^${expected}$`) })).toHaveCount(1, { timeout: 30_000 })
    await shot('09-komut-oneri')
    // Yazılanı sil.
    for (let i = 0; i < typed.length; i++) await page.keyboard.press('Backspace')
    await expect(completion()).toBeHidden()

    // Dosya argümanı: yazınca eşleşen dosyalar çıkar.
    await page.keyboard.type('cat no')
    await expect(names()).toHaveText(['notes.txt'])
    // Ayrıntılı görünüm: izinler, boyut, tarih ve gizli dosyalar.
    await page.keyboard.press('Control+Space')
    await expect(completion()).toHaveClass(/is-detailed/)
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect(names()).toHaveText(['.hidden', 'alpha', 'beta', 'notes.txt'])
    await expect(completion().locator('.completion-col.size').last()).toHaveText('21 B')
    await shot('10-ayrintili')
    await page.keyboard.press('Control+Space')
    await expect(completion()).not.toHaveClass(/is-detailed/)
    await expect(names()).toHaveText(['alpha', 'beta', 'notes.txt'])

    // Esc ile kapatılan satırda otomatik açılmaz; Tab ile açılır ve tek eşleşme doğrudan tamamlanır.
    await page.keyboard.press('Escape')
    await page.keyboard.type('n')
    await expect(completion()).toBeHidden()
    // Yankı gelmeden basılan Tab da son yazılanı görür.
    await page.keyboard.press('Tab')
    await expect.poll(() => output('pane-1')).toContain('otes.txt')
    await expect(completion()).toBeHidden()
    await page.keyboard.press('Enter')
    await expect.poll(() => output('pane-1')).toContain('zortex-dosya-icerigi')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spec: git alt komutları, seçenekleri ve dalları önerilir', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'zortex-git-'))
  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=e2e@zortex.test', '-c', 'user.name=e2e', ...args], { cwd: repo })
  }
  git('init', '-q', '-b', 'main')
  git('commit', '-q', '--allow-empty', '-m', 'init')
  git('branch', 'feature-zortex')
  try {
    await recordOutput('pane-1')
    await page.getByTestId('pane-1').locator('.pane-body').click()
    await page.keyboard.type(`cd "${repo}"`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)

    // Alt komut: açıklamasıyla listelenir, Tab ile tamamlanır.
    await page.keyboard.type('git chec')
    const checkout = completion().getByTestId('completion-item').filter({ hasText: /^checkout/ })
    await expect(checkout).toHaveCount(1, { timeout: 30_000 })
    await expect(checkout).toContainText(/branch/i)
    await shot('11-git-alt-komut')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Tab')

    // Ardından dallar `git branch` ile üretilir.
    await expect(names().filter({ hasText: /^feature-zortex$/ })).toHaveCount(1)
    await shot('12-git-dallar')
    await page.keyboard.type('feat')
    await expect(names()).toHaveText(['feature-zortex'])
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect.poll(() => output('pane-1')).toContain("Switched to branch 'feature-zortex'")

    // Seçenekler tire ile başlayınca önerilir.
    await page.keyboard.type('git commit --am')
    await expect(names().filter({ hasText: /--amend/ })).toHaveCount(1)
    await page.keyboard.press('Escape')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('spec: npm betikleri üst klasördeki package.json dan, Windows araçları kendi spec lerinden önerilir', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zortex-npm-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'zortex-dev': 'vite', 'zortex-test': 'vitest' } }))
  mkdirSync(join(root, 'packages', 'app'), { recursive: true })
  try {
    await page.getByTestId('pane-1').locator('.pane-body').click()
    // Alt klasörden de bulunur (betik package.json'u yukarı doğru arar).
    await page.keyboard.type(`cd "${join(root, 'packages', 'app')}"`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await page.keyboard.type('npm run zortex')
    await expect(names()).toHaveText(['zortex-dev', 'zortex-test'], { timeout: 30_000 })
    await shot('13-npm-betikleri')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(400)

    if (process.platform === 'win32') {
      await page.keyboard.type('ipconfig /fl')
      await expect(names()).toHaveText(['/flushdns'])
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(400)
      await page.keyboard.type('winget ins')
      await expect(names()).toHaveText(['install'])
      await page.keyboard.press('Tab')
      await page.keyboard.type('--sc')
      await expect(names()).toHaveText(['--scope'])
      await page.keyboard.press('Escape')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
