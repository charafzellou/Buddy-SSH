import { sanitizeTerminalOutput } from '@/terminal/sanitize'
import { createTerminalTheme } from '@/terminal/theme'
import { type XtermBundle, type XtermFactoryOptions, createXterm } from '@/terminal/xtermFactory'
import type { BuddySshMessage } from '@buddy-ssh/shared'

type DataMessage = Extract<BuddySshMessage, { type: 'DATA' | 'STDERR' }>

export interface TerminalLike {
  open(element: HTMLElement): void
  write(data: string): void
  onData(callback: (data: string) => void): { dispose(): void }
  dispose(): void
}

export interface TerminalTransport {
  onData?: ((message: DataMessage) => void) | undefined
  send(message: BuddySshMessage): void
}

export interface UseTerminalOptions {
  container: HTMLElement
  transport: TerminalTransport
  settings: XtermFactoryOptions
  createBundle?: (options: XtermFactoryOptions) => XtermBundle
}

export interface UseTerminalHandle {
  bundle: XtermBundle
  dispose(): void
}

// useTerminal creates one terminal instance, wires it to the websocket transport,
// and returns a disposable handle for the pane lifecycle.
export function useTerminal(options: UseTerminalOptions): UseTerminalHandle {
  const bundleFactory = options.createBundle ?? createXterm
  const bundle = bundleFactory({
    ...options.settings,
    theme: options.settings.theme ?? createTerminalTheme(document.documentElement),
  })
  const terminal = bundle.terminal as unknown as TerminalLike
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  terminal.open(options.container)
  bundle.addons.fit.fit()

  const disposable = terminal.onData((data) => {
    try {
      options.transport.send({
        v: 1,
        type: 'DATA',
        payload: {
          data: Array.from(encoder.encode(data)),
        },
      })
    } catch (error) {
      // Surfaced (not swallowed) so a transport failure during typing is
      // visible instead of silently dropping keystrokes; the transport
      // itself already has a closed/error state after this point.
      console.warn('[useTerminal] failed to send keystroke data', error)
    }
  })

  options.transport.onData = (message) => {
    const sanitized = sanitizeTerminalOutput(decoder.decode(new Uint8Array(message.payload.data)))
    terminal.write(sanitized)
  }

  return {
    bundle,
    dispose() {
      disposable.dispose()
      terminal.dispose()
    },
  }
}
