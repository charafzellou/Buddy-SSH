import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const defaultFontFamily = `'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace`
const defaultFontSize = 14
const defaultScrollback = 5000
const mediaQuery = '(prefers-color-scheme: dark)'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemePreference>('system')
  const resolvedTheme = ref<ResolvedTheme>(resolveTheme(theme.value))
  const fontFamily = ref(defaultFontFamily)
  const fontSize = ref(defaultFontSize)
  const scrollback = ref(defaultScrollback)

  const isDark = computed(() => resolvedTheme.value === 'dark')

  applyTheme(resolvedTheme.value)
  bindSystemThemeListener(() => {
    if (theme.value !== 'system') {
      return
    }

    resolvedTheme.value = resolveTheme('system')
    applyTheme(resolvedTheme.value)
  })

  function setTheme(nextTheme: ThemePreference): void {
    theme.value = nextTheme
    resolvedTheme.value = resolveTheme(nextTheme)
    applyTheme(resolvedTheme.value)
  }

  function toggleTheme(): void {
    setTheme(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    fontFamily,
    fontSize,
    isDark,
    resolvedTheme,
    scrollback,
    setTheme,
    theme,
    toggleTheme,
    // TODO: persist settings to IndexedDB in M5.
  }
})

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark' || preference === 'light') {
    return preference
  }

  if (typeof window !== 'undefined' && window.matchMedia(mediaQuery).matches) {
    return 'dark'
  }

  return 'light'
}

function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
}

let hasBoundSystemThemeListener = false

function bindSystemThemeListener(onChange: () => void): void {
  if (hasBoundSystemThemeListener || typeof window === 'undefined') {
    return
  }

  hasBoundSystemThemeListener = true
  window.matchMedia(mediaQuery).addEventListener('change', onChange)
}
