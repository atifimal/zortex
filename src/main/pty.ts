import os from 'node:os'
import * as pty from 'node-pty'
import type { WebContents } from 'electron'
import { resolveShell } from './shells'
import type { ShellInfo } from '../shared/types'
import { IPC } from '../preload/api'

interface Session {
  proc: pty.IPty
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

  create(owner: WebContents, id: string, cols: number, rows: number, shellId: string): ShellInfo {
    this.kill(id)
    const shell = resolveShell(shellId)
    const proc = pty.spawn(shell.path, shell.args, {
      name: 'xterm-256color',
      cols: Math.max(2, cols),
      rows: Math.max(1, rows),
      cwd: os.homedir(),
      env: buildEnv()
    })

    const session: Session = { proc, owner, buffer: '', flushTimer: null }
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

    return shell
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.proc.write(data)
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
