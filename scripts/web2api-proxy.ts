import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * GlassGem local proxy (Vite plugin).
 *
 * The browser calls `/web2api/<path>` on the GlassGem dev/preview server and
 * this middleware forwards it to the Web2API server, streaming the response
 * back untouched (so SSE streaming works). This sidesteps browser CORS
 * restrictions without introducing any cloud backend.
 *
 * The upstream origin comes from the `x-glassgem-target` header, but only
 * loopback / private-network hosts are accepted — the proxy can never be used
 * to reach the public internet.
 */
export const PROXY_PREFIX = '/web2api'
const DEFAULT_TARGET = process.env.GLASSGEM_WEB2API_URL ?? 'http://127.0.0.1:8081'

function isLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h === '::1' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (h === '0.0.0.0' || h === 'host.docker.internal') return true
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function resolveTarget(req: IncomingMessage): URL | null {
  const raw = req.headers['x-glassgem-target']
  const header = Array.isArray(raw) ? raw[0] : raw
  const candidate = header || DEFAULT_TARGET
  try {
    const url = new URL(candidate)
    if ((url.protocol === 'http:' || url.protocol === 'https:') && isLocalHost(url.hostname)) return url
  } catch {
    /* invalid */
  }
  return null
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'x-glassgem-target'])

export function handleProxy(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith(PROXY_PREFIX)) return false
  const target = resolveTarget(req)
  if (!target) {
    sendJson(res, 400, { error: { message: 'GlassGem proxy only forwards to local/private-network Web2API servers.', type: 'glassgem_proxy_error' } })
    return true
  }
  const path = req.url.slice(PROXY_PREFIX.length) || '/'
  const headers: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null || HOP_BY_HOP.has(k.toLowerCase())) continue
    headers[k] = v
  }
  headers.host = target.host

  const client = target.protocol === 'https:' ? https : http
  const upstream = client.request(
    { protocol: target.protocol, hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path, method: req.method, headers },
    (upRes) => {
      const outHeaders: Record<string, string | string[]> = {}
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (v == null) continue
        const key = k.toLowerCase()
        if (key === 'transfer-encoding' || key === 'connection' || key.startsWith('access-control-')) continue
        outHeaders[k] = v
      }
      // Disable buffering for streams.
      outHeaders['cache-control'] = 'no-cache'
      outHeaders['x-accel-buffering'] = 'no'
      res.writeHead(upRes.statusCode ?? 502, outHeaders)
      upRes.pipe(res)
      upRes.on('error', () => res.end())
    },
  )

  upstream.on('error', (err: NodeJS.ErrnoException) => {
    const reason = err.code === 'ECONNREFUSED' ? `nothing is listening at ${target.origin}` : err.message
    sendJson(res, 502, { error: { message: `GlassGem proxy could not reach the Web2API server (${reason}).`, type: 'glassgem_proxy_error', code: err.code } })
  })

  // Abort upstream when the browser cancels (Stop button / AbortController).
  const abort = () => upstream.destroy()
  res.on('close', () => {
    if (!res.writableFinished) abort()
  })
  req.on('aborted', abort)

  req.pipe(upstream)
  return true
}

export function web2apiProxyPlugin(): Plugin {
  return {
    name: 'glassgem-web2api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handleProxy(req, res)) next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handleProxy(req, res)) next()
      })
    },
  }
}
