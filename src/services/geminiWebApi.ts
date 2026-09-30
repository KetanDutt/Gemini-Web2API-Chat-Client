/**
 * Gemini Web2API client.
 *
 * Talks to the OpenAI-compatible endpoints exposed by the locally running
 * Gemini Web2API server. Only conservative, confirmed-working fields are sent
 * unless the capability layer has verified support for more.
 */
import type { ChatParams, ModelInfo, Usage } from '@/types'
import { modelLabel } from '@/lib/utils'
import { ApiError, errorFromStatus, normalizeError } from './errors'

export interface ApiConfig {
  baseUrl: string
  apiKey: string
  /** Route through the local dev proxy to avoid CORS. */
  useProxy: boolean
  /** Request timeout in ms (0 = none). */
  timeoutMs?: number
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

export interface ChatRequestOptions {
  model: string
  messages: ChatMessageInput[]
  params?: ChatParams
  signal?: AbortSignal
}

export interface ChatResult {
  id?: string
  content: string
  model?: string
  usage?: Usage
  finishReason?: string
  latencyMs: number
  status: number
  streamed: boolean
}

export interface StreamCallbacks {
  onToken?: (delta: string, full: string) => void
  onStart?: () => void
}

export interface RequestTrace {
  id: string
  at: number
  method: string
  endpoint: string
  status?: number
  durationMs?: number
  model?: string
  usage?: Usage
  streamed?: boolean
  error?: string
  ok: boolean
}

type TraceListener = (trace: RequestTrace) => void

const traceListeners = new Set<TraceListener>()
export function onRequestTrace(listener: TraceListener) {
  traceListeners.add(listener)
  return () => traceListeners.delete(listener)
}
function emitTrace(trace: RequestTrace) {
  traceListeners.forEach((l) => l(trace))
}

export const PROXY_PREFIX = '/web2api'

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** Resolves the URL to fetch, optionally routing through the local proxy. */
export function resolveEndpoint(config: ApiConfig, path: string): { url: string; headers: Record<string, string> } {
  const base = normalizeBase(config.baseUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  if (config.useProxy) {
    let origin = ''
    let pathname = ''
    try {
      const u = new URL(base)
      origin = u.origin
      pathname = u.pathname.replace(/\/+$/, '')
    } catch {
      pathname = base
    }
    if (origin) headers['x-glassgem-target'] = origin
    return { url: `${PROXY_PREFIX}${pathname}${path}`, headers }
  }
  return { url: `${base}${path}`, headers }
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number | undefined): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(new ApiError('timeout', 'Request timed out', `No response after ${Math.round(timeoutMs / 1000)}s.`)), timeoutMs)
  }
  return {
    signal: controller.signal,
    // Only the timeout is cleared once headers arrive; the abort link must stay
    // alive for the whole body stream so "Stop" can cancel mid-response.
    clear: () => {
      if (timer) clearTimeout(timer)
    },
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractUsage(u: unknown): Usage | undefined {
  if (!u || typeof u !== 'object') return undefined
  const o = u as Record<string, unknown>
  const usage: Usage = {}
  if (typeof o.prompt_tokens === 'number') usage.prompt_tokens = o.prompt_tokens
  if (typeof o.completion_tokens === 'number') usage.completion_tokens = o.completion_tokens
  if (typeof o.total_tokens === 'number') usage.total_tokens = o.total_tokens
  return Object.keys(usage).length ? usage : undefined
}

function contentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .join('')
  }
  return ''
}

export class GeminiWebApi {
  private config: ApiConfig
  private controllers = new Map<string, AbortController>()

  constructor(config: ApiConfig) {
    this.config = config
  }

  setConfig(config: ApiConfig) {
    this.config = config
  }

  getConfig() {
    return this.config
  }

  /** Aborts a specific in-flight request, or all of them. */
  abortRequest(requestId?: string) {
    if (requestId) {
      this.controllers.get(requestId)?.abort()
      this.controllers.delete(requestId)
      return
    }
    this.controllers.forEach((c) => c.abort())
    this.controllers.clear()
  }

  private track(requestId: string | undefined, signal?: AbortSignal): AbortController {
    const controller = new AbortController()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    if (requestId) this.controllers.set(requestId, controller)
    return controller
  }

  private async request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ res: Response; durationMs: number }> {
    const { url, headers } = resolveEndpoint(this.config, path)
    const { signal, clear } = withTimeout(init.signal ?? undefined, init.timeoutMs ?? this.config.timeoutMs)
    const started = performance.now()
    try {
      const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal })
      return { res, durationMs: performance.now() - started }
    } catch (err) {
      if (signal.aborted && signal.reason instanceof ApiError) throw signal.reason
      throw normalizeError(err, this.config.baseUrl)
    } finally {
      clear()
    }
  }

  /** GET /v1/models */
  async getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const trace: RequestTrace = { id: crypto.randomUUID(), at: Date.now(), method: 'GET', endpoint: '/models', ok: false }
    try {
      const { res, durationMs } = await this.request('/models', { method: 'GET', signal, timeoutMs: 15000 })
      trace.status = res.status
      trace.durationMs = durationMs
      const body = await readBody(res)
      if (!res.ok) throw errorFromStatus(res.status, body, this.config.baseUrl)
      const data = (body as { data?: unknown })?.data ?? (Array.isArray(body) ? body : undefined)
      if (!Array.isArray(data)) {
        throw new ApiError('invalid_response', 'Unexpected model list', 'The /models endpoint returned an unexpected shape.', { raw: body })
      }
      const models = data
        .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
        .filter((m): m is Record<string, unknown> => !!m && typeof m.id === 'string')
        .map<ModelInfo>((m) => ({
          id: m.id as string,
          label: modelLabel(m.id as string),
          ownedBy: typeof m.owned_by === 'string' ? m.owned_by : undefined,
          created: typeof m.created === 'number' ? m.created : undefined,
        }))
      trace.ok = true
      return models
    } catch (err) {
      const e = normalizeError(err, this.config.baseUrl)
      trace.error = e.message
      trace.status ??= e.status
      throw e
    } finally {
      emitTrace(trace)
    }
  }

  /**
   * Lightweight connectivity check. Prefers /models (cheap); if the server does
   * not implement it, falls back to a tiny chat completion.
   */
  async testConnection(model: string, signal?: AbortSignal): Promise<{ ok: true; latencyMs: number; via: 'models' | 'chat'; models?: ModelInfo[] }> {
    const started = performance.now()
    try {
      const models = await this.getModels(signal)
      return { ok: true, latencyMs: performance.now() - started, via: 'models', models }
    } catch (err) {
      const e = normalizeError(err, this.config.baseUrl)
      // Only fall back when the endpoint is missing; auth/network errors are conclusive.
      if (e.kind !== 'not_found' && e.kind !== 'invalid_response' && e.kind !== 'bad_request') throw e
    }
    const result = await this.sendMessage({ model, messages: [{ role: 'user', content: 'ping' }], signal })
    return { ok: true, latencyMs: result.latencyMs, via: 'chat' }
  }

  private buildBody(opts: ChatRequestOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
    }
    if (stream) body.stream = true
    const p = opts.params
    if (p) {
      if (typeof p.temperature === 'number') body.temperature = p.temperature
      if (typeof p.top_p === 'number') body.top_p = p.top_p
      if (typeof p.max_tokens === 'number' && p.max_tokens > 0) body.max_tokens = p.max_tokens
    }
    return body
  }

  /** POST /v1/chat/completions (non-streaming) */
  async sendMessage(opts: ChatRequestOptions, requestId?: string): Promise<ChatResult> {
    const controller = this.track(requestId, opts.signal)
    const trace: RequestTrace = { id: requestId ?? crypto.randomUUID(), at: Date.now(), method: 'POST', endpoint: '/chat/completions', model: opts.model, ok: false, streamed: false }
    try {
      const { res, durationMs } = await this.request('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(this.buildBody(opts, false)),
        signal: controller.signal,
      })
      trace.status = res.status
      trace.durationMs = durationMs
      const body = await readBody(res)
      if (!res.ok) throw errorFromStatus(res.status, body, this.config.baseUrl)
      if (!body || typeof body !== 'object') {
        throw new ApiError('invalid_response', 'Invalid response', 'The server returned an empty or non-JSON response.', { raw: body })
      }
      const b = body as Record<string, unknown>
      const choice = Array.isArray(b.choices) ? (b.choices[0] as Record<string, unknown> | undefined) : undefined
      const message = choice?.message as Record<string, unknown> | undefined
      const content = contentToString(message?.content)
      if (!choice || (message === undefined && content === '')) {
        throw new ApiError('invalid_response', 'Invalid response', 'The response did not contain any choices.', { raw: body })
      }
      const usage = extractUsage(b.usage)
      trace.usage = usage
      trace.ok = true
      return {
        id: typeof b.id === 'string' ? b.id : undefined,
        content,
        model: typeof b.model === 'string' ? b.model : opts.model,
        usage,
        finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
        latencyMs: durationMs,
        status: res.status,
        streamed: false,
      }
    } catch (err) {
      const e = normalizeError(err, this.config.baseUrl)
      trace.error = e.message
      trace.status ??= e.status
      throw e
    } finally {
      if (requestId) this.controllers.delete(requestId)
      emitTrace(trace)
    }
  }

  /**
   * POST /v1/chat/completions with `stream: true`.
   *
   * Throws `ApiError('not_supported')`-like errors (kind bad_request / not_found)
   * when the server doesn't support streaming so callers can fall back.
   */
  async streamMessage(opts: ChatRequestOptions, callbacks: StreamCallbacks, requestId?: string): Promise<ChatResult> {
    const controller = this.track(requestId, opts.signal)
    const trace: RequestTrace = { id: requestId ?? crypto.randomUUID(), at: Date.now(), method: 'POST', endpoint: '/chat/completions', model: opts.model, ok: false, streamed: true }
    const started = performance.now()
    try {
      const { res, durationMs } = await this.request('/chat/completions', {
        method: 'POST',
        headers: { Accept: 'text/event-stream, application/json' },
        body: JSON.stringify(this.buildBody(opts, true)),
        signal: controller.signal,
        timeoutMs: 0,
      })
      trace.status = res.status
      if (!res.ok) {
        const body = await readBody(res)
        throw errorFromStatus(res.status, body, this.config.baseUrl)
      }
      const ctype = res.headers.get('content-type') ?? ''
      // Server ignored `stream` and answered with plain JSON → treat as non-stream.
      if (ctype.includes('application/json')) {
        const body = (await readBody(res)) as Record<string, unknown>
        const choice = Array.isArray(body?.choices) ? (body.choices[0] as Record<string, unknown>) : undefined
        const content = contentToString((choice?.message as Record<string, unknown> | undefined)?.content)
        if (!choice) throw new ApiError('invalid_response', 'Invalid response', 'The response did not contain any choices.', { raw: body })
        callbacks.onStart?.()
        callbacks.onToken?.(content, content)
        const usage = extractUsage(body.usage)
        trace.usage = usage
        trace.ok = true
        trace.streamed = false
        trace.durationMs = performance.now() - started
        return { id: body.id as string | undefined, content, model: (body.model as string) ?? opts.model, usage, finishReason: choice.finish_reason as string | undefined, latencyMs: durationMs, status: res.status, streamed: false }
      }
      if (!res.body) throw new ApiError('invalid_response', 'Streaming unavailable', 'The server response had no body.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // Some servers delimit SSE events with CRLF; normalise once per chunk.
      let full = ''
      let usage: Usage | undefined
      let model: string | undefined
      let id: string | undefined
      let finishReason: string | undefined
      let startedEmitting = false
      let sawData = false
      // A chunk may end with a bare "\r" whose "\n" arrives in the next chunk.
      // Hold that byte back so CRLF is normalised correctly across boundaries.
      let pendingCr = false

      const handleEvent = (data: string) => {
        if (data === '[DONE]') return
        let json: Record<string, unknown>
        try {
          json = JSON.parse(data)
        } catch {
          return // ignore malformed keep-alive chunks
        }
        sawData = true
        if (json.error) {
          throw new ApiError('server', 'Web2API stream error', extractError(json.error), { raw: json })
        }
        if (typeof json.id === 'string') id = json.id
        if (typeof json.model === 'string') model = json.model
        const u = extractUsage(json.usage)
        if (u) usage = u
        const choice = Array.isArray(json.choices) ? (json.choices[0] as Record<string, unknown> | undefined) : undefined
        if (!choice) return
        const delta = (choice.delta ?? choice.message) as Record<string, unknown> | undefined
        const piece = contentToString(delta?.content)
        if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason
        if (piece) {
          if (!startedEmitting) {
            startedEmitting = true
            callbacks.onStart?.()
          }
          full += piece
          callbacks.onToken?.(piece, full)
        }
      }

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          let text = decoder.decode(value, { stream: true })
          if (pendingCr) {
            text = `\r${text}`
            pendingCr = false
          }
          if (text.endsWith('\r')) {
            pendingCr = true
            text = text.slice(0, -1)
          }
          buffer = `${buffer}${text.replace(/\r\n/g, '\n')}`
          let idx: number
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            const lines = rawEvent.split('\n')
            const data = lines
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n')
            if (data) handleEvent(data)
          }
        }
        // flush trailing event without terminating blank line
        const rest = buffer.trim()
        if (rest.startsWith('data:')) handleEvent(rest.slice(5).trim())
      } finally {
        // Always release the stream: on success we are done reading, and on a
        // mid-stream error (upstream error chunk, abort, network drop) this
        // cancels the reader so the underlying connection is torn down instead
        // of leaking until GC.
        try {
          await reader.cancel()
        } catch {
          /* the reader may already be closed or errored */
        }
      }

      if (!sawData && !full) {
        throw new ApiError('invalid_response', 'Empty stream', 'The server closed the stream without sending any data.')
      }
      trace.ok = true
      trace.usage = usage
      trace.durationMs = performance.now() - started
      return { id, content: full, model: model ?? opts.model, usage, finishReason, latencyMs: performance.now() - started, status: res.status, streamed: true }
    } catch (err) {
      const e = normalizeError(err, this.config.baseUrl)
      trace.error = e.message
      trace.status ??= e.status
      trace.durationMs = performance.now() - started
      throw e
    } finally {
      if (requestId) this.controllers.delete(requestId)
      emitTrace(trace)
    }
  }
}

function extractError(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message
  return 'Unknown streaming error'
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: 'http://127.0.0.1:8081/v1',
  apiKey: 'sk-gemini',
  useProxy: true,
  timeoutMs: 120000,
}

/** The model preselected for new conversations and imports (matches the bundled server's default list). */
export const DEFAULT_MODEL = 'gemini-3.6-flash'

/** Singleton client used by the stores. */
export const geminiWebApi = new GeminiWebApi(DEFAULT_API_CONFIG)
