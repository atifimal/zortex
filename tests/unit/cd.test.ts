import { describe, expect, it } from 'vitest'
import { completionKeys, cwdFromOsc, cwdFromPrompt, parseCdInput, specialDirsFor, splitPath } from '../../src/shared/cd'

const BS = '\x7f'

describe('parseCdInput', () => {
  it('istemden sonra yazılan cd yolunu bulur', () => {
    expect(parseCdInput('PS C:\\Users\\ati> cd ', 'pwsh')).toEqual({ raw: '', path: '', quote: '' })
    expect(parseCdInput('PS C:\\Users\\ati> cd src\\ren', 'pwsh')?.path).toBe('src\\ren')
    expect(parseCdInput('ati@mac ~/proj % cd src/re', 'posix')?.path).toBe('src/re')
    expect(parseCdInput('C:\\>cd /d D:\\work', 'cmd')?.path).toBe('D:\\work')
    expect(parseCdInput('$ Set-Location doc', 'pwsh')?.path).toBe('doc')
  })

  it('tırnak ve kaçışları çözer', () => {
    expect(parseCdInput('$ cd "my dir/su', 'posix')).toEqual({ raw: '"my dir/su', path: 'my dir/su', quote: '"' })
    expect(parseCdInput('$ cd my\\ dir/su', 'posix')?.path).toBe('my dir/su')
  })

  it('cd yazılmıyorsa ya da yol bittiyse null döner', () => {
    expect(parseCdInput('$ ls ', 'posix')).toBeNull()
    expect(parseCdInput('$ cd', 'posix')).toBeNull()
    expect(parseCdInput('$ abcd foo', 'posix')).toBeNull()
    expect(parseCdInput('$ cd foo ', 'posix')).toBeNull()
    expect(parseCdInput('$ cd "a b" ', 'posix')).toBeNull()
  })
})

describe('cwdFromPrompt', () => {
  it('PowerShell ve cmd istemlerinden klasörü çıkarır', () => {
    expect(cwdFromPrompt('PS C:\\Users\\ati> ', 'pwsh')).toBe('C:\\Users\\ati')
    expect(cwdFromPrompt('PS Microsoft.PowerShell.Core\\FileSystem::\\\\srv\\share> ', 'pwsh')).toBe('\\\\srv\\share')
    expect(cwdFromPrompt('C:\\Windows>', 'cmd')).toBe('C:\\Windows')
    expect(cwdFromPrompt('ati@mac ~ % ', 'posix')).toBeNull()
    expect(cwdFromPrompt('PS HKLM:\\> ', 'pwsh')).toBeNull()
  })
})

describe('cwdFromOsc', () => {
  it('OSC 7 ve OSC 9;9 bildirimlerini çözer', () => {
    expect(cwdFromOsc(7, 'file://mac/Users/ati/my%20dir', 'darwin')).toBe('/Users/ati/my dir')
    expect(cwdFromOsc(7, 'file://pc/C:/Users/ati', 'win32')).toBe('C:\\Users\\ati')
    expect(cwdFromOsc(9, '9;"C:\\Users\\ati"', 'win32')).toBe('C:\\Users\\ati')
    expect(cwdFromOsc(9, '4;1;50', 'win32')).toBeNull()
  })
})

describe('specialDirsFor / splitPath', () => {
  it('özel klasörleri yalnızca ilk parçada ve uyanlarla gösterir', () => {
    expect(specialDirsFor('', 'pwsh')).toEqual(['.', '..', '~'])
    expect(specialDirsFor('', 'cmd')).toEqual(['.', '..'])
    expect(specialDirsFor('.', 'posix')).toEqual(['.', '..'])
    expect(specialDirsFor('s', 'posix')).toEqual([])
    expect(specialDirsFor('a/', 'posix')).toEqual([])
  })

  it('yolu klasör ve önek olarak ayırır', () => {
    expect(splitPath('src/ren', 'posix')).toEqual({ dir: 'src/', prefix: 'ren' })
    expect(splitPath('src\\ren', 'pwsh')).toEqual({ dir: 'src\\', prefix: 'ren' })
    expect(splitPath('a\\ b', 'posix')).toEqual({ dir: '', prefix: 'a\\ b' })
  })
})

describe('completionKeys', () => {
  const keys = (line: string, name: string, kind: 'posix' | 'pwsh' | 'cmd', platform = 'win32'): string =>
    completionKeys(parseCdInput(line, kind)!, name, kind, platform)

  it('önek uyuyorsa yalnızca eksik kısmı ve ayracı ekler', () => {
    expect(keys('PS C:\\> cd ', 'src', 'pwsh')).toBe('src\\')
    expect(keys('PS C:\\> cd sr', 'src', 'pwsh')).toBe('c\\')
    expect(keys('PS C:\\> cd src/re', 'renderer', 'pwsh')).toBe('nderer/')
    expect(keys('$ cd sr', 'src', 'posix', 'darwin')).toBe('c/')
    expect(keys('$ cd ', '..', 'posix', 'darwin')).toBe('../')
    expect(keys('$ cd ', '~', 'posix', 'darwin')).toBe('~/')
  })

  it('büyük/küçük harf farklıysa yazılanı silip yeniden yazar', () => {
    expect(keys('$ cd SR', 'src', 'posix', 'linux')).toBe(`${BS}${BS}src/`)
  })

  it('POSIX kabuklarında boşlukları ters bölüyle kaçırır', () => {
    expect(keys('$ cd my', 'my dir', 'posix', 'darwin')).toBe(' dir/'.replace(' ', '\\ '))
    expect(keys('$ cd ~/Do', 'Documents', 'posix', 'darwin')).toBe('cuments/')
  })

  it('Windows kabuklarında boşluklu yolu tırnağa alır, imleci kapanış tırnağının önünde bırakır', () => {
    expect(keys('PS C:\\> cd Prog', 'Program Files', 'pwsh')).toBe(`${BS.repeat(4)}"Program Files\\"\x1b[D`)
    expect(keys('PS C:\\> cd "Program Files\\', 'Common Files', 'pwsh')).toBe('Common Files\\')
  })
})
