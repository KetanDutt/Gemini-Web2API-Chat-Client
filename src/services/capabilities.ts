/**
 * Capability detection for the connected Web2API server.
 *
 * Nothing here is assumed: every capability starts as `unknown` and is only
 * flipped to `true` after a successful, observed interaction. Features in the
 * UI are enabled/disabled based on this record.
 */
export type CapabilityState = 'unknown' | 'supported' | 'unsupported'

export interface Capabilities {
  chatCompletions: CapabilityState
  modelListing: CapabilityState
  streaming: CapabilityState
  systemMessages: CapabilityState
  imageInput: CapabilityState
  usageInfo: CapabilityState
  /** Optional OpenAI sampling params (temperature/top_p/max_tokens) */
  samplingParams: CapabilityState
  detectedAt?: number
  serverOrigin?: string
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  chatCompletions: 'unknown',
  modelListing: 'unknown',
  streaming: 'unknown',
  systemMessages: 'unknown',
  imageInput: 'unsupported', // never claimed unless the user enables it after verifying their server
  usageInfo: 'unknown',
  samplingParams: 'unknown',
}

export const CAPABILITY_LABELS: Record<keyof Omit<Capabilities, 'detectedAt' | 'serverOrigin'>, { label: string; description: string }> = {
  chatCompletions: { label: 'Chat completions', description: 'POST /v1/chat/completions' },
  modelListing: { label: 'Model listing', description: 'GET /v1/models' },
  streaming: { label: 'Streaming', description: 'Server-sent events with stream: true' },
  systemMessages: { label: 'System messages', description: 'Messages with role "system"' },
  imageInput: { label: 'Image input', description: 'Multimodal image_url message parts' },
  usageInfo: { label: 'Usage information', description: 'prompt/completion/total token counts' },
  samplingParams: { label: 'Sampling parameters', description: 'temperature, top_p, max_tokens' },
}

export function isSupported(state: CapabilityState) {
  return state === 'supported'
}

export function isKnownUnsupported(state: CapabilityState) {
  return state === 'unsupported'
}

/**
 * Decide whether to try streaming for the next request.
 * We attempt it when unknown (and fall back on failure) or when supported.
 */
export function shouldTryStreaming(caps: Capabilities, userPreference: boolean): boolean {
  if (!userPreference) return false
  return caps.streaming !== 'unsupported'
}

export function shouldSendSystemMessage(caps: Capabilities): boolean {
  return caps.systemMessages !== 'unsupported'
}

export function shouldSendSamplingParams(caps: Capabilities, userEnabled: boolean): boolean {
  return userEnabled && caps.samplingParams !== 'unsupported'
}
