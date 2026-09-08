import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatParams, Density, ThemeMode } from '@/types'
import { DEFAULT_API_CONFIG } from '@/services/geminiWebApi'

export interface SettingsState {
  // API
  baseUrl: string
  apiKey: string
  defaultModel: string
  useProxy: boolean
  customModels: string[]
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
  defaultModel: 'gemini-3.6-flash',
  useProxy: true,
  customModels: [],
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

export const selectApiConfig = (s: SettingsState) => ({
  baseUrl: s.baseUrl,
  apiKey: s.apiKey,
  useProxy: s.useProxy,
  timeoutMs: DEFAULT_API_CONFIG.timeoutMs,
})
