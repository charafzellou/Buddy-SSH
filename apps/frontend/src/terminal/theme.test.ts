// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { createTerminalTheme } from './theme'

describe('createTerminalTheme', () => {
  it('builds a light theme from CSS variables', () => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.setProperty('--app-bg', '#ffffff')
    document.documentElement.style.setProperty('--app-fg', '#111111')
    document.documentElement.style.setProperty('--app-muted', '#777777')

    const theme = createTerminalTheme(document.documentElement)

    expect(theme.background).toBe('#ffffff')
    expect(theme.foreground).toBe('#111111')
    expect(theme.selectionBackground).toBe('#777777')
  })

  it('builds a dark theme from CSS variables', () => {
    document.documentElement.classList.add('dark')
    document.documentElement.style.setProperty('--app-bg', '#030712')
    document.documentElement.style.setProperty('--app-fg', '#f9fafb')
    document.documentElement.style.setProperty('--app-muted', '#9ca3af')

    const theme = createTerminalTheme(document.documentElement)

    expect(theme.background).toBe('#030712')
    expect(theme.foreground).toBe('#f9fafb')
    expect(theme.cursor).toBe('#f9fafb')
    expect(theme.cursorAccent).toBe('#030712')
  })
})
