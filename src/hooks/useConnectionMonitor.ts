import { useEffect, useRef } from 'react'
import { useConnection } from '@/stores/connectionStore'
import { useSettings } from '@/stores/settingsStore'
import { geminiWebApi } from '@/services/geminiWebApi'
import { selectApiConfig } from '@/stores/settingsStore'

/**
 * Tests the connection on startup, when API settings change (debounced), and
 * periodically while offline so the status indicator recovers automatically.
 */
export function useConnectionMonitor() {
  const baseUrl = useSettings((s) => s.baseUrl)
  const apiKey = useSettings((s) => s.apiKey)
  const useProxy = useSettings((s) => s.useProxy)
  const onboarded = useSettings((s) => s.onboarded)
  const state = useConnection((s) => s.state)
  const first = useRef(true)

  useEffect(() => {
    geminiWebApi.setConfig(selectApiConfig(useSettings.getState()))
    if (!onboarded) return
    const delay = first.current ? 300 : 900
    first.current = false
    const t = setTimeout(() => {
      void useConnection.getState().test({ silent: true })
    }, delay)
    return () => clearTimeout(t)
  }, [baseUrl, apiKey, useProxy, onboarded])

  useEffect(() => {
    if (!onboarded) return
    if (state !== 'offline' && state !== 'error') return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void useConnection.getState().test({ silent: true })
    }, 20000)
    return () => clearInterval(t)
  }, [state, onboarded])

  useEffect(() => {
    if (!onboarded) return
    const onVisible = () => {
      const s = useConnection.getState()
      const stale = !s.lastCheckAt || Date.now() - s.lastCheckAt > 60000
      if (document.visibilityState === 'visible' && stale) void s.test({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [onboarded])
}
