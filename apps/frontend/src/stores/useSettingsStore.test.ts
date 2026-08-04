import { JSDOM } from 'jsdom'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from './useSettingsStore'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    const globalWindow = globalThis as { window?: Window }
    const globalDocument = globalThis as { document?: Document }

    globalWindow.window = undefined
    globalDocument.document = undefined
  })

  it('respects prefers-color-scheme on init and toggles theme state', () => {
    const dom = new JSDOM('<html><body></body></html>')
    globalThis.window = dom.window as unknown as Window & typeof globalThis
    globalThis.document = dom.window.document

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
      }),
    })

    const store = useSettingsStore()

    expect(store.theme).toBe('system')
    expect(store.resolvedTheme).toBe('dark')
    expect(store.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    store.toggleTheme()

    expect(store.theme).toBe('light')
    expect(store.resolvedTheme).toBe('light')
    expect(store.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
