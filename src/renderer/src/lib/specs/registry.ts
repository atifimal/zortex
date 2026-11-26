/// <reference types="@withfig/autocomplete-types" />
/// <reference types="vite/client" />
import type { ShellKind } from '../../../../shared/shell'
import { WINDOWS_SPECS } from './windows'

/**
 * Tamamlama spec'leri: Fig'in açık kaynaklı spec deposundan (withfig/autocomplete, MIT lisanslı)
 * seçilmiş araçlar ve Windows araçları için Zortex'in kendi spec'leri.
 * Fig spec'leri ayrı parçalar halinde paketlenir ve yalnızca o komut yazıldığında yüklenir.
 * aws ve gcloud spec'leri (≈50 MB) uygulama boyutunu büyüteceği için dahil edilmedi.
 */
const FIG_MODULES = import.meta.glob<{ default: Fig.Spec }>([
  '../../../../../node_modules/@withfig/autocomplete/build/{git,git-flow,gh,npm,npx,yarn,pnpm,node,bun,deno,docker,docker-compose,kubectl,helm,terraform,ssh,scp,rsync,curl,wget,tar,pip,pip3,python,python3,go,cargo,rustup,dotnet,mvn,gradle,code,java,ffmpeg,jq,poetry,uv,conda,nvm,brew,make,tmux,vim,less,ls,cp,mv,rm,mkdir,cat,grep,find,chmod,chown,ps,kill,pkill,killall,head,tail,sed,touch,du,df,top,htop,lsof,man,diff,zip,unzip,ping,ssh-keygen,systemctl,launchctl,defaults,open,xcodebuild,xcrun,swift,django-admin}.js',
  '../../../../../node_modules/@withfig/autocomplete/build/{dotnet,deno,python}/*.js'
])

const BUILD_PREFIX = '/@withfig/autocomplete/build/'
const figLoaders = new Map<string, () => Promise<{ default: Fig.Spec }>>()
for (const [path, load] of Object.entries(FIG_MODULES)) {
  const at = path.indexOf(BUILD_PREFIX)
  if (at !== -1) figLoaders.set(path.slice(at + BUILD_PREFIX.length).replace(/\.js$/, ''), load)
}

/** Yalnızca Unix araçları: PowerShell/cmd'de bu adlar başka şeylere karşılık gelir ya da yoktur. */
const POSIX_ONLY = new Set([
  'ls', 'cp', 'mv', 'rm', 'mkdir', 'cat', 'grep', 'find', 'chmod', 'chown', 'ps', 'kill', 'pkill', 'killall', 'head',
  'tail', 'sed', 'touch', 'du', 'df', 'top', 'htop', 'lsof', 'man', 'diff', 'zip', 'unzip', 'less', 'vim', 'tmux',
  'systemctl', 'launchctl', 'defaults', 'open', 'xcodebuild', 'xcrun', 'ping', 'brew'
])

const isWindows = (): boolean => window.zortex.platform === 'win32'

/** Bu kabukta ve platformda `command` için spec var mı? */
export function hasSpec(command: string, kind: ShellKind): boolean {
  if (isWindows() && command in WINDOWS_SPECS) return true
  if (!figLoaders.has(command)) return false
  return kind === 'posix' || !POSIX_ONLY.has(command)
}

const cache = new Map<string, Promise<Fig.Spec | null>>()

/** Spec'i yükler (`git`, `dotnet/dotnet-add` gibi yollar da olabilir). */
export function loadSpec(name: string): Promise<Fig.Spec | null> {
  if (isWindows() && name in WINDOWS_SPECS) return Promise.resolve(WINDOWS_SPECS[name])
  let hit = cache.get(name)
  if (!hit) {
    const loader = figLoaders.get(name)
    hit = loader
      ? loader()
          .then((m) => m.default ?? null)
          .catch(() => null)
      : Promise.resolve(null)
    cache.set(name, hit)
  }
  return hit
}

/** Test ve tanılama için: paketlenen spec adları. */
export const specNames = (): string[] => [...figLoaders.keys(), ...Object.keys(WINDOWS_SPECS)]
