const mediaQuery = '(prefers-color-scheme: dark)'

function setThemeClass(isDark: boolean): void {
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.dataset.theme = isDark ? 'dark' : 'light'
}

export function applySystemTheme(): void {
  if (typeof window === 'undefined') {
    return
  }

  const media = window.matchMedia(mediaQuery)
  setThemeClass(media.matches)

  media.addEventListener('change', (event) => {
    setThemeClass(event.matches)
  })
}
