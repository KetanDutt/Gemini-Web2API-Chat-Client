import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ConnectionState, ModelInfo } from '@/types'
import { geminiWebApi, onRequestTrace, type RequestTrace } from '@/services/geminiWebApi'
import { DEFAULT_CAPABILITIES, type Capabilities, type CapabilityState } from '@/services/capabilities'
import { normalizeError } from '@/services/errors'
import { useSettings, selectApiConfig } from './settingsStore'

interface ConnectionStore {
  state: ConnectionState
  models: ModelInfo[]
  modelsError?: string
  lastError?: { title: string; message: string; hint?: string; kind: string; status?: number; at: number }
  lastSuccessAt?: number
  lastLatencyMs?: number
  lastCheckAt?: number
  capabilities: Capabilities
  traces: RequestTrace[]
  isStreamingNow: boolean

  test: (opts?: { silent?: boolean }) => Promise<boolean>
  refreshModels: () => Promise<void>
  setCapability: (key: keyof Capabilities, value: CapabilityState) => void
  noteSuccess: (latencyMs?: number) => void
  noteFailure: (err: unknown) => void
  setStreamingNow: (v: boolean) => void
  resetCapabilities: () => void
}

const MAX_TRACES = 40

export const useConnection = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      state: 'idle',
      models: [],
      capabilities: { ...DEFAULT_CAPABILITIES },
      traces: [],
      isStreamingNow: false,

      setCapability: (key, value) =>
        set((s) => (s.capabilities[key] === value ? s : { capabilities: { ...s.capabilities, [key]: value, detectedAt: Date.now() } })),

      resetCapabilities: () => set({ capabilities: { ...DEFAULT_CAPABILITIES } }),

      noteSuccess: (latencyMs) => set({ state: 'connected', lastSuccessAt: Date.now(), lastLatencyMs: latencyMs ?? get().lastLatencyMs, lastError: undefined }),

      noteFailure: (err) => {
        const e = normalizeError(err, useSettings.getState().baseUrl)
        if (e.kind === 'aborted') return
        const offline = e.kind === 'network' || e.kind === 'proxy' || e.kind === 'timeout'
        set({
          state: offline ? 'offline' : 'error',
          lastError: { title: e.title, message: e.message, hint: e.hint, kind: e.kind, status: e.status, at: Date.now() },
        })
      },

      setStreamingNow: (v) => set({ isStreamingNow: v }),

      refreshModels: async () => {
        geminiWebApi.setConfig(selectApiConfig(useSettings.getState()))
        try {
          const models = await geminiWebApi.getModels()
          set({ models, modelsError: undefined })
          get().setCapability('modelListing', 'supported')
        } catch (err) {
          const e = normalizeError(err, useSettings.getState().baseUrl)
          set({ modelsError: e.message })
          if (e.kind === 'not_found' || e.kind === 'invalid_response') get().setCapability('modelListing', 'unsupported')
          throw e
        }
      },

      test: async () => {
        const settings = useSettings.getState()
        geminiWebApi.setConfig(selectApiConfig(settings))
        set({ state: 'checking', lastCheckAt: Date.now() })
        const started = performance.now()
        try {
          const result = await geminiWebApi.testConnection(settings.defaultModel)
          const latency = performance.now() - started
          const patch: Partial<ConnectionStore> = { state: 'connected', lastSuccessAt: Date.now(), lastLatencyMs: latency, lastError: undefined }
          if (result.via === 'models') {
            patch.models = result.models ?? []
            patch.modelsError = undefined
            get().setCapability('modelListing', 'supported')
          } else {
            get().setCapability('modelListing', 'unsupported')
            get().setCapability('chatCompletions', 'supported')
          }
          set({ ...patch, capabilities: { ...get().capabilities, serverOrigin: safeOrigin(settings.baseUrl) } })
          return true
        } catch (err) {
          get().noteFailure(err)
          return false
        }
      },
    }),
    {
      name: 'glassgem.connection',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ capabilities: s.capabilities, models: s.models, lastSuccessAt: s.lastSuccessAt, lastLatencyMs: s.lastLatencyMs }),
    },
  ),
)

function safeOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

// Collect request traces for the debug panel and infer capabilities from real traffic.
onRequestTrace((trace) => {
  useConnection.setState((s) => {
    const traces = [trace, ...s.traces].slice(0, MAX_TRACES)
    const patch: Partial<ConnectionStore> = { traces }
    if (trace.ok) {
      patch.state = 'connected'
      patch.lastSuccessAt = Date.now()
      if (trace.durationMs != null) patch.lastLatencyMs = trace.durationMs
      patch.lastError = undefined
      const caps = { ...s.capabilities }
      if (trace.endpoint === '/chat/completions') {
        caps.chatCompletions = 'supported'
        if (trace.streamed) caps.streaming = 'supported'
        if (trace.usage && (trace.usage.total_tokens ?? 0) > 0) caps.usageInfo = 'supported'
      }
      patch.capabilities = caps
    }
    return patch
  })
})
