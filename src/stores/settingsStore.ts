import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatParams, Density, ThemeMode } from '@/types'
import { DEFAULT_API_CONFIG, DEFAULT_MODEL } from '@/services/geminiWebApi'

export interface SettingsState {
  // API
  baseUrl: string
  apiKey: string
  defaultModel: string
  useProxy: boolean
  customModels: string[]
  /** Non-streaming request timeout in seconds (30–600, clamped). */
  requestTimeoutSec: number
  // General
  theme: ThemeMode
  density: Density
  reduceMotion: boolean
  // Chat
  enterToSend: boolean
  showTimestamps: boolean
  showUsage: boolean
  showLatency: boolean
  autoTitle: boolean
  streaming: boolean
  defaultSystemPrompt: string
  sendSystemPrompt: boolean
  enableSamplingParams: boolean
  chatParams: ChatParams
  enableImageInput: boolean
  // Misc
  onboarded: boolean
  debugPanel: boolean
  hasSeenShortcuts: boolean

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
  update: (patch: Partial<SettingsState>) => void
  clearCredentials: () => void
  reset: () => void
}

const DEFAULTS: Omit<SettingsState, 'set' | 'update' | 'clearCredentials' | 'reset'> = {
  baseUrl: DEFAULT_API_CONFIG.baseUrl,
  apiKey: DEFAULT_API_CONFIG.apiKey,
  defaultModel: DEFAULT_MODEL,
  useProxy: true,
  customModels: [],
  requestTimeoutSec: 120,
  theme: 'system',
  density: 'comfortable',
  reduceMotion: false,
  enterToSend: true,
  showTimestamps: true,
  showUsage: true,
  showLatency: false,
  autoTitle: true,
  streaming: true,
  defaultSystemPrompt: '',
  sendSystemPrompt: false,
  enableSamplingParams: false,
  chatParams: { temperature: 1, top_p: 0.95, max_tokens: undefined },
  enableImageInput: false,
  onboarded: false,
  debugPanel: false,
  hasSeenShortcuts: false,
}

export const SETTINGS_STORAGE_KEY = 'glassgem.settings'

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      update: (patch) => set(patch),
      clearCredentials: () => set({ apiKey: '' }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => {
        // Never persist functions; everything else is safe local config.
        const { set: _s, update: _u, clearCredentials: _c, reset: _r, ...rest } = s
        return rest
      },
    },
  ),
)

export const MIN_REQUEST_TIMEOUT_SEC = 30
export const MAX_REQUEST_TIMEOUT_SEC = 600
export const DEFAULT_REQUEST_TIMEOUT_SEC = 120

/**
 * Clamps a user-provided timeout (seconds) into the allowed range. Streaming
 * responses never use this value — it only bounds non-streaming requests and
 * the connection test, so slow models can be given up to 10 minutes.
 */
export function requestTimeoutMs(sec: unknown): number {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : DEFAULT_REQUEST_TIMEOUT_SEC
  const clamped = Math.min(MAX_REQUEST_TIMEOUT_SEC, Math.max(MIN_REQUEST_TIMEOUT_SEC, Math.round(n)))
  return clamped * 1000
}

export function selectApiConfig(s: Pick<SettingsState, 'baseUrl' | 'apiKey' | 'useProxy' | 'requestTimeoutSec'>) {
  return {
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    useProxy: s.useProxy,
    timeoutMs: requestTimeoutMs(s.requestTimeoutSec),
  }
}
