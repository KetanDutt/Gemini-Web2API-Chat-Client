/**
 * Human-friendly error normalisation for Web2API failures.
 */
export type ApiErrorKind =
  | 'network'
  | 'proxy'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'server'
  | 'invalid_response'
  | 'timeout'
  | 'aborted'
  | 'bad_request'
  | 'unknown'

export class ApiError extends Error {
  kind: ApiErrorKind
  status?: number
  title: string
  hint?: string
  raw?: unknown

  constructor(kind: ApiErrorKind, title: string, message: string, opts: { status?: number; hint?: string; raw?: unknown } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.title = title
    this.status = opts.status
    this.hint = opts.hint
    this.raw = opts.raw
  }

  get retryable() {
    return ['network', 'proxy', 'rate_limited', 'server', 'timeout', 'unknown', 'invalid_response'].includes(this.kind)
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError') ||
    (err instanceof ApiError && err.kind === 'aborted')
  )
}

function serverHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin
  } catch {
    return baseUrl
  }
}

export function extractServerMessage(body: unknown): string | undefined {
  if (!body) return undefined
  if (typeof body === 'string') return body.slice(0, 300)
  if (typeof body === 'object') {
    const b = body as Record<string, unknown>
    const err = b.error
    if (typeof err === 'string') return err
    if (err && typeof err === 'object') {
      const m = (err as Record<string, unknown>).message
      if (typeof m === 'string') return m
    }
    if (typeof b.message === 'string') return b.message
    if (typeof b.detail === 'string') return b.detail
  }
  return undefined
}

function isProxyError(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { error?: { type?: string } }).error?.type === 'glassgem_proxy_error'
}

export function networkError(baseUrl: string, raw?: unknown): ApiError {
  const host = serverHost(baseUrl)
  return new ApiError('network', 'Unable to connect to Gemini Web2API', `Make sure the Web2API server is running at ${host}.`, {
    hint: `Check your server window for errors. If Web2API runs on a different port, update the Base URL in Settings → API.`,
    raw,
  })
}

export function errorFromStatus(status: number, body: unknown, baseUrl: string): ApiError {
  const serverMsg = extractServerMessage(body)
  const host = serverHost(baseUrl)
  const detail = serverMsg ? `Server said: "${serverMsg}"` : undefined

  // The local GlassGem proxy could not reach Web2API → same as a network failure.
  if (isProxyError(body)) {
    const e = networkError(baseUrl, body)
    e.status = status
    e.kind = 'proxy'
    if (serverMsg) e.hint = `${e.hint}\n\nProxy said: ${serverMsg}`
    return e
  }

  switch (status) {
    case 400:
    case 422:
      return new ApiError('bad_request', 'The request was rejected', `Gemini Web2API rejected the request as invalid.`, {
        status,
        hint: detail ?? 'The selected model or parameters may not be supported by this server version.',
        raw: body,
      })
    case 401:
      return new ApiError('unauthorized', 'API key rejected', 'Gemini Web2API rejected the API key.', {
        status,
        hint: `Open Settings → API and make sure the key matches the one configured on the Web2API server (default: sk-gemini). ${detail ?? ''}`.trim(),
        raw: body,
      })
    case 403:
      return new ApiError('forbidden', 'Access denied', 'Gemini Web2API refused access to this endpoint.', {
        status,
        hint: detail ?? 'Check the server logs — the Gemini session on the server may have expired.',
        raw: body,
      })
    case 404:
      return new ApiError('not_found', 'Endpoint or model not found', `The server at ${host} did not recognise the request.`, {
        status,
        hint: detail ?? 'Verify the Base URL ends with /v1 and that the selected model exists on the server.',
        raw: body,
      })
    case 408:
      return new ApiError('timeout', 'Request timed out', 'The Web2API server took too long to respond.', { status, hint: detail, raw: body })
    case 429:
      return new ApiError('rate_limited', 'Rate limited', 'Gemini is rate-limiting requests right now.', {
        status,
        hint: detail ?? 'Wait a moment and try again. Web2API retries automatically, but heavy usage can still be throttled.',
        raw: body,
      })
    case 500:
    case 502:
    case 503:
    case 504:
      return new ApiError('server', 'Web2API server error', `The Web2API server at ${host} returned an error (HTTP ${status}).`, {
        status,
        hint: detail ?? 'Check the Web2API server window for a stack trace. Gemini cookies may need to be refreshed.',
        raw: body,
      })
    default:
      return new ApiError('unknown', `Unexpected response (HTTP ${status})`, `Gemini Web2API responded with HTTP ${status}.`, {
        status,
        hint: detail,
        raw: body,
      })
  }
}

export function normalizeError(err: unknown, baseUrl: string): ApiError {
  if (err instanceof ApiError) return err
  if (isAbortError(err)) return new ApiError('aborted', 'Stopped', 'The request was cancelled.')

  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    const e = networkError(baseUrl, err)
    e.hint = `${e.hint} If you are calling the server directly (proxy off), the browser may also be blocking the request because of CORS — enable "Use local proxy" in Settings → API.`
    return e
  }
  if (err instanceof SyntaxError) {
    return new ApiError('invalid_response', 'Invalid response', 'The server returned data that is not valid JSON.', {
      hint: 'The Base URL may be pointing at a web page instead of the API. It should end with /v1.',
      raw: err,
    })
  }
  if (err instanceof Error && /timeout/i.test(err.message)) {
    return new ApiError('timeout', 'Request timed out', 'The Web2API server did not answer in time.', { raw: err })
  }
  const message = err instanceof Error ? err.message : String(err)
  return new ApiError('unknown', 'Something went wrong', message || 'An unknown error occurred.', { raw: err })
}
