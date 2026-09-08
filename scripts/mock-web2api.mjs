#!/usr/bin/env node
/**
 * Minimal mock of the Gemini Web2API OpenAI-compatible server.
 *
 * Used for local UI development / testing when the real Web2API server is not
 * available. It mimics the exact request/response shapes GlassGem depends on:
 *   - GET  /v1/models
 *   - POST /v1/chat/completions   (streaming + non-streaming)
 *
 * Usage:  node scripts/mock-web2api.mjs [port]     (default 8081)
 */
import http from 'node:http'

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8081)
const API_KEY = process.env.MOCK_API_KEY ?? 'sk-gemini'

const MODELS = ['gemini-3.6-flash', 'gemini-3.6-flash-thinking', 'gemini-3.6-pro', 'gemini-flash-lite']

const SAMPLE = `Here's a quick overview of **Docker networking**.

Docker gives every container its own network namespace and connects containers through *drivers*:

| Driver | Scope | Typical use |
| --- | --- | --- |
| \`bridge\` | single host | default for standalone containers |
| \`host\` | single host | no isolation, max performance |
| \`overlay\` | multi-host | Swarm / cross-node traffic |
| \`none\` | – | fully isolated |

## Creating a user-defined bridge

\`\`\`bash
docker network create --driver bridge app-net
docker run -d --name api --network app-net my-api:latest
docker run -d --name web --network app-net -p 8080:80 nginx
\`\`\`

Containers on the same user-defined bridge can reach each other **by name** thanks to Docker's embedded DNS server:

\`\`\`python
import requests

# "api" resolves to the api container's IP inside app-net
r = requests.get("http://api:3000/health", timeout=2)
print(r.json())
\`\`\`

> Tip: the default \`bridge\` network does **not** provide name resolution — always create your own network for multi-container apps.

1. Publish ports with \`-p host:container\`.
2. Inspect a network with \`docker network inspect app-net\`.
3. Use \`overlay\` when containers span multiple machines.

Want me to go deeper into \`iptables\` rules or the overlay VXLAN encapsulation?`

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

function tokens(text) {
  return text.match(/\S+\s*|\s+/g) ?? []
}

function replyFor(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  const text = typeof last?.content === 'string' ? last.content : ''
  const lower = text.toLowerCase()
  if (lower.includes('error-500')) return { error: 500 }
  if (lower.includes('error-429')) return { error: 429 }
  if (lower.includes('slow')) return { text: SAMPLE, slow: true }
  if (lower.includes('short')) return { text: 'Sure — here is a short answer. ✨' }
  if (lower.includes('docker') || lower.includes('network')) return { text: SAMPLE }
  const sys = messages.find((m) => m.role === 'system')
  const prefix = sys ? `_(System instruction received: "${String(sys.content).slice(0, 60)}")_\n\n` : ''
  return {
    text:
      prefix +
      `You said:\n\n> ${text.replace(/\n/g, '\n> ')}\n\nThis is a **mock** Gemini Web2API response so GlassGem can be developed without the real server. Try asking about *Docker networking* for a richer Markdown sample, or include the word \`slow\` to see a longer stream.\n\n\`\`\`ts\nconst answer: string = "Hello from GlassGem";\nconsole.log(answer);\n\`\`\``,
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    return res.end()
  }

  const auth = req.headers.authorization ?? ''
  if (auth !== `Bearer ${API_KEY}`) {
    return json(res, 401, { error: { message: 'Invalid API key', type: 'invalid_request_error' } })
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return json(res, 200, {
      object: 'list',
      data: MODELS.map((id) => ({ id, object: 'model', created: 1788800000, owned_by: 'google' })),
    })
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return json(res, 400, { error: { message: 'Invalid JSON body', type: 'invalid_request_error' } })
    }
    const model = body.model ?? MODELS[0]
    if (!MODELS.includes(model)) {
      return json(res, 404, { error: { message: `Model '${model}' not found`, type: 'invalid_request_error' } })
    }
    const reply = replyFor(body.messages ?? [])
    if (reply.error === 500) return json(res, 500, { error: { message: 'Gemini upstream failure (mock)', type: 'server_error' } })
    if (reply.error === 429) return json(res, 429, { error: { message: 'Rate limited (mock)', type: 'rate_limit_error' } })

    const id = `chatcmpl-${Math.random().toString(36).slice(2, 12)}`
    const created = Math.floor(Date.now() / 1000)
    const promptTokens = JSON.stringify(body.messages).length >> 2
    const completionTokens = reply.text.length >> 2
    const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }

    if (body.stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
      send({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
      const parts = tokens(reply.text)
      let i = 0
      let closed = false
      req.on('close', () => (closed = true))
      const tick = () => {
        if (closed) return
        if (i >= parts.length) {
          send({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })
          res.write('data: [DONE]\n\n')
          return res.end()
        }
        send({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: parts[i++] }, finish_reason: null }] })
        setTimeout(tick, reply.slow ? 60 : 18)
      }
      setTimeout(tick, 350)
      return
    }

    await new Promise((r) => setTimeout(r, reply.slow ? 4000 : 700))
    return json(res, 200, {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: reply.text }, finish_reason: 'stop' }],
      usage,
    })
  }

  json(res, 404, { error: { message: `No route for ${req.method} ${url.pathname}`, type: 'invalid_request_error' } })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Gemini Web2API listening on http://127.0.0.1:${PORT}/v1  (key: ${API_KEY})`)
})
