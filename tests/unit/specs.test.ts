/// <reference types="@withfig/autocomplete-types" />
import { describe, expect, it } from 'vitest'
import { resolveSpec, type SpecContext } from '../../src/renderer/src/lib/specs/engine'
import { WINDOWS_SPECS } from '../../src/renderer/src/lib/specs/windows'
import { insertionKeys, parseCommandLine } from '../../src/shared/cmdline'
// Paketin "exports" alanı derin içe aktarmaya izin vermediği için dosya yoluyla (tipsiz modüller).
const figSpec = async (name: string): Promise<Fig.Spec> =>
  ((await import(`../../node_modules/@withfig/autocomplete/build/${name}.js`)) as { default: Fig.Spec }).default
const gitSpec = await figSpec('git')
const npmSpec = await figSpec('npm')

type Calls = Fig.ExecuteCommandInput[]

function ctx(line: string, outputs: Record<string, string> = {}, calls: Calls = []): SpecContext {
  const parsed = parseCommandLine(line, 'posix')
  const tokens = [parsed.command!.value, ...parsed.args.map((a) => a.value), parsed.current.value]
  return {
    tokens,
    cwd: '/repo',
    exec: async (input) => {
      calls.push(input)
      const key = [input.command, ...(input.args ?? [])].join(' ')
      const hit = Object.entries(outputs).find(([k]) => key.startsWith(k))
      return { stdout: hit?.[1] ?? '', stderr: '', status: hit ? 0 : 1 }
    },
    loadSpec: async () => null,
    shellCommand: 'sh',
    cache: new Map()
  }
}

const names = async (spec: Fig.Spec, line: string, outputs?: Record<string, string>): Promise<string[]> =>
  (await resolveSpec(spec, ctx(line, outputs))).suggestions.map((s) => s.name)

const toy: Fig.Spec = {
  name: 'toy',
  subcommands: [
    { name: ['build', 'b'], description: 'Build it', options: [{ name: ['-o', '--out'], args: { name: 'dir', template: 'folders' } }, { name: '--fast' }] },
    { name: 'run', args: { name: 'script', suggestions: ['dev', 'test', { name: 'deploy', isDangerous: true }] } },
    { name: 'secret', hidden: true }
  ],
  options: [
    { name: ['-v', '--verbose'], isPersistent: true },
    { name: '--format', requiresEquals: true, args: { name: 'fmt', suggestions: ['json', 'text'] } }
  ]
}

describe('resolveSpec', () => {
  it('alt komutları önekle süzer; gizlileri yalnızca yazılınca gösterir', async () => {
    expect(await names(toy, 'toy ')).toEqual(['build', 'run'])
    expect(await names(toy, 'toy r')).toEqual(['run'])
    expect(await names(toy, 'toy se')).toEqual(['secret'])
  })

  it('seçenekleri tire ile başlayınca önerir; kullanılanları ve kalıcı seçenekleri doğru yönetir', async () => {
    expect(await names(toy, 'toy build -')).toEqual(['-o, --out', '--fast', '-v, --verbose'])
    expect(await names(toy, 'toy build --fast -')).toEqual(['-o, --out', '-v, --verbose'])
  })

  it('seçeneğin argümanını ve şablonunu bildirir', async () => {
    const res = await resolveSpec(toy, ctx('toy build -o '))
    expect(res.template.folders).toBe(true)
    expect(res.unknown).toBe(false)
  })

  it('argüman önerileri ve requiresEquals', async () => {
    expect(await names(toy, 'toy run d')).toEqual(['dev', 'deploy'])
    const fmt = (await resolveSpec(toy, ctx('toy --f'))).suggestions[0]
    expect(fmt).toMatchObject({ name: '--format', insert: '--format=', suffix: 'none' })
    const value = await resolveSpec(toy, ctx('toy --format=j'))
    expect(value.suggestions.map((s) => s.insert)).toEqual(['json'])
    expect(value.queryTerm).toBe('=')
  })

  it('takma adlı alt komutun içine girer', async () => {
    expect(await names(toy, 'toy b --f')).toEqual(['--fast'])
  })
})

describe('Fig git spec', () => {
  it('alt komutları açıklamalarıyla verir', async () => {
    const res = await resolveSpec(gitSpec, ctx('git chec'))
    expect(res.suggestions.map((s) => s.name)).toContain('checkout')
    expect(res.suggestions.find((s) => s.name === 'checkout')?.description).toMatch(/branch/i)
  })

  it('git checkout dalları `git branch` ile üretir', async () => {
    const calls: Calls = []
    const res = await resolveSpec(gitSpec, ctx('git checkout ', { 'git --no-optional-locks branch': '* main\n  feature/x\n' }, calls))
    expect(calls.some((c) => c.command === 'git' && c.args?.includes('branch'))).toBe(true)
    const branches = res.suggestions.filter((s) => s.kind === 'value').map((s) => s.insert)
    expect(branches).toEqual(expect.arrayContaining(['main', 'feature/x']))
  })

  it('git commit seçenekleri', async () => {
    const res = await resolveSpec(gitSpec, ctx('git commit --am'))
    expect(res.suggestions.map((s) => s.insert)).toContain('--amend')
  })
})

describe('Fig npm spec', () => {
  it('npm run betiklerini package.json dan üretir', async () => {
    const pkg = JSON.stringify({ scripts: { dev: 'vite', 'test:e2e': 'playwright test' } })
    const res = await resolveSpec(npmSpec, ctx('npm run ', { cat: pkg, bash: pkg }))
    expect(res.suggestions.map((s) => s.insert)).toEqual(expect.arrayContaining(['dev', 'test:e2e']))
  })
})

describe('Windows spec', () => {
  it('eğik çizgili seçenekler (ipconfig /all) büyük/küçük harf duyarsız', async () => {
    expect(await names(WINDOWS_SPECS.ipconfig, 'ipconfig /fl')).toEqual(['/flushdns'])
    expect(await names(WINDOWS_SPECS.winget, 'winget ins')).toEqual(['install'])
    expect(await names(WINDOWS_SPECS.winget, 'winget install --sc')).toEqual(['--scope'])
  })

  it('wsl dağıtımlarını UTF-16 çıktısından üretir', async () => {
    const out = 'U\0b\0u\0n\0t\0u\0\r\0\n\0D\0e\0b\0i\0a\0n\0'
    expect(await names(WINDOWS_SPECS.wsl, 'wsl -d ', { wsl: out })).toEqual(['Ubuntu', 'Debian'])
  })
})

describe('insertionKeys', () => {
  const word = (line: string, kind: 'posix' | 'pwsh' = 'posix') => parseCommandLine(line, kind).current
  it('alt komut ve seçenek ekler', () => {
    expect(insertionKeys(word('git chec'), { text: 'checkout', suffix: 'space' }, 'posix')).toBe('kout ')
    expect(insertionKeys(word('toy --f'), { text: '--format=', suffix: 'none' }, 'posix')).toBe('ormat=')
  })
  it('queryTerm sonrasını değiştirir', () => {
    expect(insertionKeys(word('toy --format=j'), { text: 'json', suffix: 'space', queryTerm: '=' }, 'posix')).toBe('son ')
  })
  it('{cursor} için imleci geri alır, insertValue kaçırılmaz', () => {
    expect(insertionKeys(word('git '), { text: "commit -m ''", raw: true, suffix: 'none', cursorBack: 1 }, 'posix')).toBe(
      "commit -m ''\x1b[D"
    )
  })
  it('değerdeki özel karakterleri kabuğa göre korur', () => {
    expect(insertionKeys(word('git checkout fe'), { text: 'feat (x)', suffix: 'space' }, 'posix')).toBe('at\\ \\(x\\) ')
    expect(insertionKeys(word('git checkout fe', 'pwsh'), { text: 'feat (x)', suffix: 'space' }, 'pwsh')).toBe(
      '\x7f\x7f"feat (x)" '
    )
  })
})
