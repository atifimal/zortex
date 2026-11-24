import { describe, expect, it } from 'vitest'
import { extractParams, fillParams, insertParamPlaceholder, toTerminalInput } from '../../src/shared/params'

describe('extractParams', () => {
  it('parametreleri sırasıyla ve tekil olarak çıkarır', () => {
    expect(extractParams('ssh {{user}}@{{host}} -p {{port:22}} # {{user}}')).toEqual([
      { name: 'user' },
      { name: 'host' },
      { name: 'port', defaultValue: '22' }
    ])
  })

  it('boş yer tutucuları ve boşlukları yok sayar', () => {
    expect(extractParams('echo {{}} {{  }} {{ ad }}')).toEqual([{ name: 'ad' }])
  })

  it('varsayılan değerdeki iki noktayı korur', () => {
    expect(extractParams('curl {{url:http://localhost:8080}}')).toEqual([
      { name: 'url', defaultValue: 'http://localhost:8080' }
    ])
  })

  it('Türkçe karakterli adları destekler', () => {
    expect(extractParams('cd {{klasör}} && ls {{şablon:*.txt}}')).toEqual([
      { name: 'klasör' },
      { name: 'şablon', defaultValue: '*.txt' }
    ])
  })

  it('aynı parametrenin sonradan gelen varsayılanını kullanır', () => {
    expect(extractParams('{{a}} {{a:1}}')).toEqual([{ name: 'a', defaultValue: '1' }])
  })
})

describe('fillParams', () => {
  it('değerleri yerleştirir, tekrar eden parametreyi her yerde doldurur', () => {
    expect(fillParams('echo {{x}} {{y}} {{x}}', { x: 'a', y: 'b' })).toBe('echo a b a')
  })

  it('değer yoksa varsayılanı, o da yoksa boş metni kullanır', () => {
    expect(fillParams('ssh {{host}} -p {{port:22}}', {})).toBe('ssh  -p 22')
  })

  it('boş string bilinçli bir değerdir ve varsayılanı ezer', () => {
    expect(fillParams('x{{a:def}}y', { a: '' })).toBe('xy')
  })

  it('boş yer tutucuyu olduğu gibi bırakır', () => {
    expect(fillParams('echo {{}}', {})).toBe('echo {{}}')
  })

  it('değer içindeki $ özel karakterlerini olduğu gibi yazar', () => {
    const value = `$& $1 $$ '"`
    expect(fillParams('echo {{v}}', { v: value })).toBe(`echo ${value}`)
  })
})

describe('insertParamPlaceholder', () => {
  it('seçim yokken imleci parantezlerin ortasına koyar', () => {
    expect(insertParamPlaceholder('ssh @host', 4, 4)).toEqual({ text: 'ssh {{}}@host', caret: 6 })
  })

  it('seçili metni sarmalar', () => {
    expect(insertParamPlaceholder('ssh user@host', 4, 8)).toEqual({ text: 'ssh {{user}}@host', caret: 10 })
  })

  it('ters seçim yönünü de doğru işler', () => {
    expect(insertParamPlaceholder('abc', 3, 1).text).toBe('a{{bc}}')
  })
})

describe('toTerminalInput', () => {
  it('otomatik çalıştırmada sonuna CR ekler', () => {
    expect(toTerminalInput('ls', true)).toBe('ls\r')
  })
  it('elle çalıştırmada Enter eklemez', () => {
    expect(toTerminalInput('ls', false)).toBe('ls')
  })
  it('çok satırlı komutlarda satır sonlarını CR yapar ve sondaki boş satırları atar', () => {
    expect(toTerminalInput('a\r\nb\nc\n\n', true)).toBe('a\rb\rc\r')
  })
})
