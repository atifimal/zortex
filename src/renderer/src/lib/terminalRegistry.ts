/** Terminal bölmelerine dışarıdan (ör. snippet çalıştırırken) erişmek için kayıt defteri. */
export interface TerminalHandle {
  /** Metni terminale gönderir; kabuk kapanmışsa önce yeniden başlatır. */
  send(text: string): void
  focus(): void
}

const handles = new Map<string, TerminalHandle>()

export const terminalRegistry = {
  register(id: string, handle: TerminalHandle): () => void {
    handles.set(id, handle)
    return () => {
      if (handles.get(id) === handle) handles.delete(id)
    }
  },
  get(id: string): TerminalHandle | undefined {
    return handles.get(id)
  }
}
