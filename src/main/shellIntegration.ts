import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { basename, join } from 'node:path'
import type { ShellInfo } from '../shared/types'

/**
 * Kabuk entegrasyonu: kabuk her istem gösterdiğinde terminale görünmez OSC dizileri yazar.
 *   OSC 6973;cwd;<yol>      çalışma klasörü (dosya sistemi dışındaysa boş)
 *   OSC 6973;path;<PATH>    PATH değiştiyse
 *   OSC 6973;msysroot;<yol> Git Bash'te MSYS kökünün Windows yolu (bir kez)
 *   OSC 6973;prompt;<metin> istemin son satırının düz metni (PowerShell, cmd)
 *   OSC 133;A / B / C / D;<kod> istem başladı / girdi başlıyor / komut başladı / komut bitti
 * Kullanıcının kendi profil dosyaları her zamanki gibi yüklenir; istemin görünümü değişmez
 * (POSIX kabuklarında yalnızca sonuna görünmez bir 133;B işareti eklenir).
 */

// Betik metinlerinde `${...}` kabuk sözdizimidir; JS şablonu olmaması için `$` ayrı yazılır.
const D = '$'

const POSIX_HOOK_BODY = String.raw`
    builtin printf '\e]6973;cwd;%s\a' "$PWD"
    if [[ "$PATH" != "$__zortex_path" ]]; then
      __zortex_path=$PATH
      builtin printf '\e]6973;path;%s\a' "$PATH"
    fi
    builtin printf '\e]133;A\a'`

const ZSH_HOOKS = String.raw`
if [[ -z $__zortex_loaded ]]; then
  __zortex_loaded=1
  __zortex_precmd() {
    builtin printf '\e]133;D;%s\a' "$?"${POSIX_HOOK_BODY}
  }
  __zortex_preexec() { builtin printf '\e]133;C\a'; }
  # Girdinin başladığı yer: istemin sonuna görünmez işaret.
  __zortex_ps1() {
    [[ $PS1 == *$'\e]133;B'* ]] || PS1="$PS1"$'%{\e]133;B\a%}'
  }
  # Temalar (oh-my-zsh, p10k…) istemi kendi precmd'lerinde kurar; bu dosya kullanıcının .zshrc'sinden
  # sonra yüklendiği için işaret onlardan sonra eklenir.
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __zortex_precmd
  add-zsh-hook precmd __zortex_ps1
  add-zsh-hook preexec __zortex_preexec
fi`

/** Kullanıcının zsh dosyasını kendi ZDOTDIR'ı etkinken yükler. */
const zshSource = (file: string): string => String.raw`
if [[ -f "$ZORTEX_USER_ZDOTDIR/${file}" ]]; then
  __zortex_zdotdir=$ZDOTDIR
  ZDOTDIR=$ZORTEX_USER_ZDOTDIR
  builtin . "$ZORTEX_USER_ZDOTDIR/${file}"
  ZORTEX_USER_ZDOTDIR=$ZDOTDIR
  ZDOTDIR=$__zortex_zdotdir
fi`

const ZSH_RESTORE = String.raw`
ZDOTDIR=$ZORTEX_USER_ZDOTDIR
unset ZORTEX_USER_ZDOTDIR __zortex_zdotdir`

const ZSH_FILES: Record<string, string> = {
  '.zshenv': zshSource('.zshenv'),
  '.zprofile': zshSource('.zprofile'),
  '.zshrc': `${zshSource('.zshrc')}\n${ZSH_HOOKS}\nif [[ ! -o login ]]; then${ZSH_RESTORE}\nfi\n`,
  '.zlogin': `${zshSource('.zlogin')}\n${ZSH_RESTORE}\n`
}

const BASH = String.raw`
if [[ -n "$ZORTEX_SHELL_LOGIN" ]]; then
  unset ZORTEX_SHELL_LOGIN
  [ -r /etc/profile ] && . /etc/profile
  if [ -r ~/.bash_profile ]; then . ~/.bash_profile
  elif [ -r ~/.bash_login ]; then . ~/.bash_login
  elif [ -r ~/.profile ]; then . ~/.profile
  fi
else
  [ -r ~/.bashrc ] && . ~/.bashrc
fi
if [[ -z $__zortex_loaded ]]; then
  __zortex_loaded=1
  if [[ $OSTYPE == msys* || $OSTYPE == cygwin* ]]; then
    __zortex_msys=1
    builtin printf '\e]6973;msysroot;%s\a' "$(builtin cd / && builtin pwd -W)"
  fi
  __zortex_prompt() {
    local ret=$?
    builtin printf '\e]133;D;%s\a' "$ret"${POSIX_HOOK_BODY.replace(
      `builtin printf '\\e]6973;cwd;%s\\a' "$PWD"`,
      // Git Bash: /tmp gibi bağlama noktaları da doğru çözülsün diye Windows yolu bildirilir.
      `if [[ -n $__zortex_msys ]]; then builtin printf '\\e]6973;cwd;%s\\a' "$(builtin pwd -W)"; else builtin printf '\\e]6973;cwd;%s\\a' "$PWD"; fi`
    )}
    return $ret
  }
  # Girdinin başladığı yer: istemin sonuna görünmez işaret (diğer PROMPT_COMMAND'lardan sonra).
  __zortex_ps1() {
    [[ $PS1 == *'\e]133;B'* ]] || PS1="$PS1"'\[\e]133;B\a\]'
  }
  if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    PROMPT_COMMAND=(__zortex_prompt "${D}{PROMPT_COMMAND[@]}" __zortex_ps1)
  else
    PROMPT_COMMAND="__zortex_prompt${D}{PROMPT_COMMAND:+;$PROMPT_COMMAND};__zortex_ps1"
  fi
fi
`

const FISH = String.raw`
if not set -q __zortex_loaded
  set -g __zortex_loaded 1
  function __zortex_prompt --on-event fish_prompt
    printf '\e]133;D;%s\a' $status
    printf '\e]6973;cwd;%s\a' $PWD
    set -l p (string join : $PATH)
    if test "$p" != "$__zortex_path"
      set -g __zortex_path $p
      printf '\e]6973;path;%s\a' $p
    end
    printf '\e]133;A\a'
  end
  function __zortex_preexec --on-event fish_preexec
    printf '\e]133;C\a'
  end
  if functions -q fish_prompt
    functions -c fish_prompt __zortex_fish_prompt
    function fish_prompt
      __zortex_fish_prompt
      printf '\e]133;B\a'
    end
  end
end
`

// Dosya yerine komut olarak verilir: betik dosyaları "execution policy" engeline takılabilir.
// İstemin düz metni de bildirilir: ConPTY OSC dizilerini metinle aynı sırada iletmeyebildiği için
// girdinin başladığı yer bu metinle bulunur.
const PWSH = String.raw`
if (-not $global:__zortexLoaded) {
  $global:__zortexLoaded = $true
  $global:__zortexPrompt = $function:prompt
  $global:__zortexPath = $null
  function global:prompt {
    $p = if ($global:__zortexPrompt) { (& $global:__zortexPrompt) -join '' } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }
    $e = [char]27; $b = [char]7
    $loc = $executionContext.SessionState.Path.CurrentLocation
    $cwd = if ($loc.Provider.Name -eq 'FileSystem') { $loc.ProviderPath } else { '' }
    $s = "$e]6973;cwd;$cwd$b"
    if ($env:PATH -ne $global:__zortexPath) { $global:__zortexPath = $env:PATH; $s += "$e]6973;path;$($env:PATH)$b" }
    $plain = $p -replace "$e\[[0-9;?]*[ -/]*[@-~]", '' -replace "$e\][^$b$e]*($b|$e\\)", ''
    $plain = ($plain -split "\r?\n")[-1]
    "$p$s$e]6973;prompt;$plain$b$e]133;A$b"
  }
}
`

let scriptDir: string | null = null

/** Betikleri uygulama veri klasörüne yazar (her açılışta güncellenir). */
export function installShellIntegration(baseDir: string): void {
  try {
    const dir = join(baseDir, 'shell-integration')
    mkdirSync(join(dir, 'zsh'), { recursive: true })
    for (const [name, content] of Object.entries(ZSH_FILES)) writeFileSync(join(dir, 'zsh', name), content, 'utf8')
    writeFileSync(join(dir, 'bash.sh'), BASH, 'utf8')
    writeFileSync(join(dir, 'fish.fish'), FISH, 'utf8')
    scriptDir = dir
  } catch {
    scriptDir = null
  }
}

function getEnv(env: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key ? env[key] : undefined
}

function setEnv(env: Record<string, string>, name: string, value: string): void {
  for (const k of Object.keys(env)) if (k.toUpperCase() === name && k !== name) delete env[k]
  env[name] = value
}

/** cmd istemi: klasör ve istem metni PROMPT kodlarıyla ($P, $G…) OSC içinde bildirilir. */
export function cmdPrompt(base: string): string {
  // Renk kodu ($e) ya da yeni satır ($_) içeren istemlerde istem metni bildirilemez.
  const promptText = /\$[eE_]/.test(base) ? '' : `$e]6973;prompt;${base}$e\\`
  return `$e]6973;cwd;$P$e\\${promptText}$e]133;A$e\\${base}`
}

/**
 * Kabuğu entegrasyonla başlatmak için argümanları ve ortamı düzenler.
 * Desteklenmeyen kabuklarda (WSL, sh, nu…) değiştirmeden döner.
 */
export function applyShellIntegration(
  shell: ShellInfo,
  env: Record<string, string>
): { args: string[]; env: Record<string, string>; integrated: boolean } {
  const unchanged = { args: shell.args, env, integrated: false }
  const name = basename(shell.path).toLowerCase().replace(/\.exe$/, '')
  const login = shell.args.includes('-l') || shell.args.includes('--login')

  if (name === 'pwsh' || name === 'powershell') {
    const encoded = Buffer.from(PWSH, 'utf16le').toString('base64')
    return { args: [...shell.args, '-NoExit', '-EncodedCommand', encoded], env, integrated: true }
  }
  if (name === 'cmd') {
    setEnv(env, 'PROMPT', cmdPrompt(getEnv(env, 'PROMPT') ?? '$P$G'))
    return { args: shell.args, env, integrated: true }
  }
  if (!scriptDir) return unchanged
  if (name === 'zsh') {
    env.ZORTEX_USER_ZDOTDIR = env.ZDOTDIR || os.homedir()
    env.ZDOTDIR = join(scriptDir, 'zsh')
    return { args: shell.args, env, integrated: true }
  }
  if (name === 'bash') {
    if (login) env.ZORTEX_SHELL_LOGIN = '1'
    const file = join(scriptDir, 'bash.sh').replace(/\\/g, '/')
    return { args: ['--init-file', file, '-i'], env, integrated: true }
  }
  if (name === 'fish') {
    const file = join(scriptDir, 'fish.fish').replace(/'/g, "\\'")
    return { args: [...shell.args, '--init-command', `source '${file}'`], env, integrated: true }
  }
  return unchanged
}
