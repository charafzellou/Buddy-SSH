import type { ITheme } from '@xterm/xterm'

const lightDefaults = {
  background: '#f9fafb',
  foreground: '#111827',
  muted: '#6b7280',
}

const darkDefaults = {
  background: '#030712',
  foreground: '#f9fafb',
  muted: '#9ca3af',
}

// createTerminalTheme maps the app's CSS theme tokens onto xterm.js colors.
export function createTerminalTheme(root: HTMLElement = document.documentElement): ITheme {
  const isDark = root.classList.contains('dark')
  const defaults = isDark ? darkDefaults : lightDefaults
  const styles = getComputedStyle(root)
  const background = readToken(styles, '--app-bg', defaults.background)
  const foreground = readToken(styles, '--app-fg', defaults.foreground)
  const muted = readToken(styles, '--app-muted', defaults.muted)

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: muted,
    selectionForeground: foreground,
    black: isDark ? '#020617' : '#0f172a',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#c026d3',
    cyan: '#0891b2',
    white: isDark ? '#e5e7eb' : '#cbd5e1',
    brightBlack: muted,
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#d946ef',
    brightCyan: '#06b6d4',
    brightWhite: isDark ? '#f8fafc' : '#334155',
  }
}

function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return value || fallback
}
