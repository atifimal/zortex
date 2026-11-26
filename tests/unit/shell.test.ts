import { describe, expect, it } from 'vitest'
import { cwdFromOsc, cwdFromPrompt, msysToWindows, shellKindOf, specialDirsFor } from '../../src/shared/shell'

describe('shellKindOf', () => {
  it('kabuk kimliğinden türü çıkarır', () => {
    expect(shellKindOf('pwsh')).toBe('pwsh')
    expect(shellKindOf('powershell')).toBe('pwsh')
    expect(shellKindOf('cmd')).toBe('cmd')
    expect(shellKindOf('zsh')).toBe('posix')
    expect(shellKindOf('git-bash')).toBe('posix')
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

describe('msysToWindows', () => {
  it('Git Bash yollarını Windows yoluna çevirir', () => {
    expect(msysToWindows('/c/Users/ati', null)).toBe('C:\\Users\\ati')
    expect(msysToWindows('/d', null)).toBe('D:\\')
    expect(msysToWindows('/usr/bin', 'C:\\Program Files\\Git')).toBe('C:\\Program Files\\Git\\usr\\bin')
    expect(msysToWindows('/usr/bin', null)).toBe('/usr/bin')
  })
})

describe('specialDirsFor', () => {
  it('özel klasörleri yalnızca ilk parçada ve uyanlarla gösterir', () => {
    expect(specialDirsFor('', 'pwsh')).toEqual(['.', '..', '~'])
    expect(specialDirsFor('', 'cmd')).toEqual(['.', '..'])
    expect(specialDirsFor('.', 'posix')).toEqual(['.', '..'])
    expect(specialDirsFor('s', 'posix')).toEqual([])
    expect(specialDirsFor('a/', 'posix')).toEqual([])
  })
})
