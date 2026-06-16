import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'nir-theme'
const DEFAULT_THEME = 'dark'

export type NirTheme = 'dark' | 'soft'

function getStoredTheme(): NirTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'soft') return stored
  } catch {
    /* localStorage not available */
  }
  return DEFAULT_THEME
}

function applyTheme(theme: NirTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme(): {
  theme: NirTheme
  setTheme: (t: NirTheme) => void
  toggleTheme: () => void
} {
  const [theme, setThemeState] = useState<NirTheme>(getStoredTheme)

  const setTheme = useCallback((t: NirTheme) => {
    setThemeState(t)
    applyTheme(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* noop */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'soft' : 'dark')
  }, [theme, setTheme])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return { theme, setTheme, toggleTheme }
}
