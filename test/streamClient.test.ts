/**
 * Integration-style tests for the streaming client. A tiny local SSE server
 * exercises the exact chunking/pathologies that broke before:
 *   - CRLF event delimiters split across TCP chunk boundaries
 *   - an OpenAI-style error chunk in the middle of a stream
 * The GeminiWebApi client runs on Node's fetch (same web streams as the
 * browser), pointed directly at the test server.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { GeminiWebApi, type ChatResult } from '@/services/geminiWebApi'

function startSseServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; url: string; done: () => Promise<void> }> {
  const server = http.createServer(handler)
  let clientClosed = false
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        server,
        url: `http://127.0.0.1:${port}/v1`,
        done: () =>
          new Promise((res) => {
            // Give the client a moment to cancel, then assert-free close.
            const wait = () => (clientClosed ? res() : setTimeout(wait, 10))
            setTimeout(() => {
              clientClosed = true
              res()
            }, 50)
            wait()
          }),
      })
    })
  })
}

const CHUNKS = [
  'data: {"id":"1","choices":[{"delta":{"role":"assistant"}}]}',
  'data: {"id":"1","choices":[{"delta":{"content":"Hello "}}]}',
  'data: {"id":"1","choices":[{"delta":{"content":"world"}}]}',
  'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}',
  'data: [DONE]',
]

test('streamMessage handles CRLF delimiters split across chunk boundaries', async () => {
  const s = await startSseServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    // Join with CRLF and split the byte stream at awkward boundaries so that
    // "\r\n" pairs and "\n\n" event gaps land in different chunks.
    const body = CHUNKS.map((c) => `data:${c.slice(5)}\r\n\r\n`).join('')
    void body
    const parts = [body.slice(0, 61), body.slice(61, 122), body.slice(122)]
    for (const p of parts) res.write(p)
    res.end()
  })
  const api = new GeminiWebApi({ baseUrl: s.url, apiKey: 'k', useProxy: false })
  const tokens: string[] = []
  let result: ChatResult | undefined
  try {
    result = await api.streamMessage({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, { onToken: (_d, full) => tokens.push(full) })
  } finally {
    s.server.close()
  }
  assert.equal(result?.content, 'Hello world')
  assert.equal(result?.streamed, true)
  assert.equal(result?.usage?.total_tokens, 4)
  assert.equal(result?.finishReason, 'stop')
})

test('streamMessage surfaces a mid-stream error chunk and releases the connection', async () => {
  let sawResponse = false
  let clientAborted = false
  const s = await startSseServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: {"id":"1","choices":[{"delta":{"content":"partial answer "}}]}\n\n')
    res.write('data: {"error":{"message":"upstream exploded","type":"server_error"}}\n\n')
    res.on('close', () => {
      clientAborted = true
    })
    // Hold the socket open; a client that leaks the connection never closes
    // it, a client that cancels the reader tears it down right away.
    setTimeout(() => {
      sawResponse = true
      res.end()
    }, 300)
  })
  const api = new GeminiWebApi({ baseUrl: s.url, apiKey: 'k', useProxy: false })
  const tokens: string[] = []
  await assert.rejects(
    api.streamMessage({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, { onToken: (_d, full) => tokens.push(full) }),
    /upstream exploded/,
  )
  // Give the runtime a moment to observe the client-side teardown.
  await new Promise((r) => setTimeout(r, 300))
  await s.done()
  s.server.close()
  assert.equal(tokens.length, 1) // partial text was delivered before the failure
  assert.equal(sawResponse, true)
  assert.equal(clientAborted, true) // the client cancelled the body reader
})

test('streamMessage reports finish_reason length (token cap → Continue chip)', async () => {
  const s = await startSseServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: {"id":"1","choices":[{"delta":{"content":"Part one…"}}]}\n\n')
    res.write('data: {"id":"1","choices":[{"delta":{},"finish_reason":"length"}]}\n\n')
    res.end()
  })
  const api = new GeminiWebApi({ baseUrl: s.url, apiKey: 'k', useProxy: false })
  let result: ChatResult | undefined
  try {
    result = await api.streamMessage({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, {})
  } finally {
    s.server.close()
  }
  assert.equal(result?.finishReason, 'length')
  assert.equal(result?.content, 'Part one…')
})
