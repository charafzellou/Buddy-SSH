// @vitest-environment jsdom

import type { BuddySshMessage } from '@buddy-ssh/shared'
import { describe, expect, it, vi } from 'vitest'
import { useTerminal } from './useTerminal'

describe('useTerminal', () => {
  it('sends DATA for keystrokes and writes received DATA into the terminal', () => {
    const container = document.createElement('div')
    const transport: {
      onData?: (message: Extract<BuddySshMessage, { type: 'DATA' | 'STDERR' }>) => void
      send: ReturnType<typeof vi.fn>
    } = {
      send: vi.fn(),
    }
    const fakeTerminal = new FakeTerminal()

    const handle = useTerminal({
      container,
      transport,
      settings: {
        fontFamily: 'IBM Plex Mono',
        fontSize: 14,
        scrollback: 5000,
      },
      createBundle: () => ({
        terminal: fakeTerminal as never,
        addons: {
          fit: { fit: vi.fn() } as never,
          search: {} as never,
          webLinks: {} as never,
          serialize: {} as never,
          clipboard: {} as never,
          webgl: {} as never,
        },
        clipboard: { osc52Enabled: false } as never,
      }),
    })

    fakeTerminal.emitData('ls\n')
    expect(transport.send).toHaveBeenCalledWith({
      v: 1,
      type: 'DATA',
      payload: { data: [108, 115, 10] },
    })

    transport.onData?.({
      v: 1,
      type: 'DATA',
      payload: { data: [104, 105] },
    })
    expect(fakeTerminal.writes).toEqual(['hi'])

    handle.dispose()
    expect(fakeTerminal.disposed).toBe(true)
  })
})

class FakeTerminal {
  readonly writes: string[] = []
  openedOn: HTMLElement | null = null
  disposed = false
  private onDataCallback: ((data: string) => void) | null = null

  open(element: HTMLElement): void {
    this.openedOn = element
  }

  write(data: string): void {
    this.writes.push(data)
  }

  onData(callback: (data: string) => void): { dispose(): void } {
    this.onDataCallback = callback
    return {
      dispose: () => {
        this.onDataCallback = null
      },
    }
  }

  dispose(): void {
    this.disposed = true
  }

  emitData(data: string): void {
    this.onDataCallback?.(data)
  }
}
