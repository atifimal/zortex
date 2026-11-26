import os from 'node:os'
import { basename } from 'node:path'
import * as pty from 'node-pty'
import { processCwd } from './completion'
import { applyShellIntegration } from './shellIntegration'
import type { WebContents } from 'electron'
import { resolveShell } from './shells'
import type { ShellInfo } from '../shared/types'
import { IPC } from '../preload/api'

interface Session {
  proc: pty.IPty
  shellPath: string
  owner: WebContents
  buffer: string
  flushTimer: NodeJS.Timeout | null
}

/** Yoğun çıktıda IPC trafiğini azaltmak için veriyi kısa aralıklarla toplu gönderir. */
const FLUSH_MS = 4

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'Zortex'
  // Finder'dan açılan macOS uygulamalarında LANG tanımlı olmaz; UTF-8 karakterler bozulmasın.
  if (process.platform !== 'win32' && !env.LANG) env.LANG = 'en_US.UTF-8'
  return env
}

export class PtyManager {
  private sessions = new Map<string, Session>()

  create(
    owner: WebContents,
    id: string,
    cols: number,
    rows: number,
    shellId: string,
    integration: boolean
  ): { shell: ShellInfo; integrated: boolean } {
    this.kill(id)
    const shell = resolveShell(shellId)
    const launch = integration ? applyShellIntegration(shell, buildEnv()) : { args: shell.args, env: buildEnv(), integrated: false }
    const proc = pty.spawn(shell.path, launch.args, {
      name: 'xterm-256color',
      cols: Math.max(2, cols),
      rows: Math.max(1, rows),
      cwd: os.homedir(),
      env: launch.env
    })

    const session: Session = { proc, shellPath: shell.path, owner, buffer: '', flushTimer: null }
    this.sessions.set(id, session)

    const flush = (): void => {
      session.flushTimer = null
      if (!session.buffer || owner.isDestroyed()) return
      owner.send(IPC.ptyData, id, session.buffer)
      session.buffer = ''
    }

    proc.onData((data) => {
      session.buffer += data
      session.flushTimer ??= setTimeout(flush, FLUSH_MS)
    })

    proc.onExit(({ exitCode }) => {
      if (session.flushTimer) clearTimeout(session.flushTimer)
      flush()
      // Bilerek sonlandırılan (kill / yeniden başlatma) oturumlar için çıkış bildirilmez.
      if (this.sessions.get(id) !== session) return
      this.sessions.delete(id)
      if (!owner.isDestroyed()) owner.send(IPC.ptyExit, id, exitCode)
    })

    return { shell, integrated: launch.integrated }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.proc.write(data)
  }

  /**
   * Kabuğun çalışma klasörü. Ön planda kabuk dışında bir program (ssh, python…) varsa
   * yazılan `cd` o programa aittir; yerel klasör yanıltıcı olacağından `null` döner.
   */
  async cwd(id: string): Promise<string | null> {
    const session = this.sessions.get(id)
    if (!session || process.platform === 'win32') return null
    const name = (p: string): string => basename(p).replace(/^-/, '')
    if (name(session.proc.process) !== name(session.shellPath)) return null
    return processCwd(session.proc.pid)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session || cols < 2 || rows < 1) return
    try {
      session.proc.resize(Math.floor(cols), Math.floor(rows))
    } catch {
      // Süreç tam o anda kapanmış olabilir.
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    if (session.flushTimer) clearTimeout(session.flushTimer)
    try {
      session.proc.kill()
    } catch {
      // Zaten sonlanmış.
    }
  }

  killOwnedBy(owner: WebContents): void {
    for (const [id, s] of this.sessions) if (s.owner === owner) this.kill(id)
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}
