import { useEffect, useSyncExternalStore } from 'react'
import { useSettings } from '@/stores/settingsStore'

export function useTheme() {
  const theme = useSettings((s) => s.theme)
  const density = useSettings((s) => s.density)
  const reduceMotion = useSettings((s) => s.reduceMotion)

  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      root.classList.toggle('dark', dark)
      root.style.colorScheme = dark ? 'dark' : 'light'
      const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null
      if (meta) meta.content = dark ? '#0b0d14' : '#eef1f8'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('density-compact', 'density-comfortable', 'density-spacious')
    root.classList.add(`density-${density}`)
  }, [density])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion)
  }, [reduceMotion])
}

/** Subscribes to the OS colour scheme so callers re-render when it flips. */
function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  )
}

export function useIsDark(): boolean {
  const theme = useSettings((s) => s.theme)
  const prefersDark = usePrefersDark()
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return prefersDark
}
