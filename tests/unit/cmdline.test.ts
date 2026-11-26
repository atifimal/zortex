import { describe, expect, it } from 'vitest'
import { guessInput, isPathLike, parseCommandLine, replacementKeys, splitPath } from '../../src/shared/cmdline'
import type { ShellKind } from '../../src/shared/shell'

const BS = '\x7f'

describe('parseCommandLine', () => {
  it('komut konumunu ve argümanları ayırır', () => {
    const p = parseCommandLine('git che', 'posix')
    expect(p.command?.value).toBe('git')
    expect(p.current.value).toBe('che')
    expect(parseCommandLine('gi', 'posix').command).toBeNull()
    expect(parseCommandLine('', 'pwsh').command).toBeNull()
  })

  it('boşlukla biten satırda yeni boş sözcük başlar', () => {
    const p = parseCommandLine('cd ', 'pwsh')
    expect(p.command?.value).toBe('cd')
    expect(p.current).toMatchObject({ raw: '', value: '' })
  })

  it('ayraçlardan sonra yeni komut başlar', () => {
    expect(parseCommandLine('ls && gi', 'posix').command).toBeNull()
    expect(parseCommandLine('Get-Item x | Sel', 'pwsh').command).toBeNull()
    expect(parseCommandLine('echo a; cat fi', 'posix').command?.value).toBe('cat')
  })

  it('sudo ve ortam atamalarını atlar', () => {
    expect(parseCommandLine('sudo apt ', 'posix').command?.value).toBe('apt')
    expect(parseCommandLine('FOO=1 BAR=2 node sc', 'posix').command?.value).toBe('node')
    expect(parseCommandLine('sudo ap', 'posix').command).toBeNull()
  })

  it('tırnakları ve kaçışları çözer', () => {
    expect(parseCommandLine('cd "my dir/su', 'posix').current).toMatchObject({ value: 'my dir/su', quote: '"' })
    expect(parseCommandLine('cd my\\ dir/su', 'posix').current).toMatchObject({ value: 'my dir/su', quote: '' })
    expect(parseCommandLine('cd "a b"', 'posix').current).toMatchObject({ value: 'a b', quote: '' })
    expect(parseCommandLine('cd C:\\Users\\', 'pwsh').current.value).toBe('C:\\Users\\')
    expect(parseCommandLine('npm --prefix="ab', 'posix').current.midQuote).toBe(true)
  })
})

describe('isPathLike / splitPath', () => {
  it('yol gibi görünen sözcükleri tanır', () => {
    for (const v of ['./x', '../', '~/a', '/usr', 'C:\\', 'src/a', '.\\run']) expect(isPathLike(v)).toBe(true)
    for (const v of ['git', 'Get-Item', '']) expect(isPathLike(v)).toBe(false)
  })

  it('yolu klasör ve önek olarak ayırır', () => {
    expect(splitPath('src/ren', 'posix')).toEqual({ dir: 'src/', prefix: 'ren' })
    expect(splitPath('src\\ren', 'pwsh')).toEqual({ dir: 'src\\', prefix: 'ren' })
    expect(splitPath('a\\b', 'posix')).toEqual({ dir: '', prefix: 'a\\b' })
  })
})

describe('guessInput (entegrasyon yokken)', () => {
  it('varsayılan Windows istemlerini atlar', () => {
    expect(guessInput('PS C:\\Users\\ati> git st', 'pwsh')).toEqual({ prompt: 'PS C:\\Users\\ati> ', input: 'git st' })
    expect(guessInput('C:\\Windows>dir', 'cmd')).toEqual({ prompt: 'C:\\Windows>', input: 'dir' })
  })

  it('bilinmeyen istemlerde yalnızca cd tanınır', () => {
    expect(guessInput('ati@mac ~ % cd Doc', 'posix')).toEqual({ prompt: 'ati@mac ~ % ', input: 'cd Doc' })
    expect(guessInput('ati@mac ~ % git st', 'posix')).toBeNull()
  })
})

describe('replacementKeys', () => {
  const keys = (
    line: string,
    name: string,
    kind: ShellKind,
    opts: { isDir?: boolean; keepDir?: boolean; nextChar?: string } = {},
    platform = 'win32'
  ): string =>
    replacementKeys(
      parseCommandLine(line, kind).current,
      { name, isDir: opts.isDir ?? true, keepDir: opts.keepDir ?? true, nextChar: opts.nextChar },
      kind,
      platform
    )

  it('klasörde eksik kısmı ve ayracı ekler, imleç yolda kalır', () => {
    expect(keys('cd ', 'src', 'pwsh')).toBe('src\\')
    expect(keys('cd sr', 'src', 'pwsh')).toBe('c\\')
    expect(keys('cd src/re', 'renderer', 'pwsh')).toBe('nderer/')
    expect(keys('cd sr', 'src', 'posix', {}, 'darwin')).toBe('c/')
    expect(keys('cd ', '..', 'posix', { keepDir: false }, 'darwin')).toBe('../')
    expect(keys('cd ', '~', 'posix', { keepDir: false }, 'darwin')).toBe('~/')
  })

  it('dosya ve komutta sözcüğü kapatıp boşluk ekler', () => {
    expect(keys('cat REA', 'README.md', 'posix', { isDir: false }, 'darwin')).toBe('DME.md ')
    expect(keys('gi', 'git', 'posix', { isDir: false, keepDir: false }, 'darwin')).toBe('t ')
    expect(keys('Get-Ch', 'Get-ChildItem', 'pwsh', { isDir: false, keepDir: false })).toBe('ildItem ')
  })

  it('büyük/küçük harf farklıysa sözcüğü silip yeniden yazar', () => {
    expect(keys('cd SR', 'src', 'posix', {}, 'linux')).toBe(`${BS}${BS}src/`)
  })

  it('POSIX kabuklarında özel karakterleri kaçırır', () => {
    expect(keys('cd my', 'my dir', 'posix', {}, 'darwin')).toBe('\\ dir/')
    expect(keys('cd ~/Do', 'Documents', 'posix', {}, 'darwin')).toBe('cuments/')
  })

  it('Windows kabuklarında boşluklu yolu tırnağa alır', () => {
    expect(keys('cd Prog', 'Program Files', 'pwsh')).toBe(`${BS.repeat(4)}"Program Files\\"\x1b[D`)
    expect(keys('cd "Program Files\\', 'Common Files', 'pwsh')).toBe('Common Files\\')
    // Dosya: tırnak kapanır; kapanış tırnağı zaten sağdaysa üzerinden geçilir.
    expect(keys('type "my fi', 'my file.txt', 'pwsh', { isDir: false })).toBe('le.txt" ')
    expect(keys('type "a b\\my fi', 'my file.txt', 'pwsh', { isDir: false, nextChar: '"' })).toBe('le.txt\x1b[C ')
  })
})
