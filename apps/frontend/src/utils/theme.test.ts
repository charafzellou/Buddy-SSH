import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'

import { applySystemTheme } from './theme'

describe('applySystemTheme', () => {
  afterEach(() => {
    const globalWindow = globalThis as { window?: Window }
    const globalDocument = globalThis as { document?: Document }

    globalWindow.window = undefined
    globalDocument.document = undefined
  })

  it('applies and updates the html.dark class from matchMedia', () => {
    const dom = new JSDOM('<html><body></body></html>')
    globalThis.window = dom.window as unknown as Window & typeof globalThis
    globalThis.document = dom.window.document

    let onChange: ((event: MediaQueryListEvent | { matches: boolean }) => void) | undefined

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: (_type: string, callback: typeof onChange) => {
          onChange = callback
        },
      }),
    })

    applySystemTheme()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    onChange?.({ matches: false })

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
