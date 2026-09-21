import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { isServerResponding, findWeb2ApiDir, resolveLauncher, projectRoot } from '../scripts/ensure-web2api.mjs'

test('isServerResponding: returns false for unreachable ports', async () => {
  const result = await isServerResponding('http://127.0.0.1:59998/test', 300)
  assert.equal(result, false)
})

test('isServerResponding: returns true for responding HTTP server', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  await new Promise<void>((resolve) => server.listen(59997, '127.0.0.1', () => resolve()))

  try {
    const result = await isServerResponding('http://127.0.0.1:59997/test', 1000)
    assert.equal(result, true)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('findWeb2ApiDir: returns a string path or null', () => {
  const dir = findWeb2ApiDir()
  if (dir !== null) {
    assert.equal(typeof dir, 'string')
    assert.ok(dir.length > 0)
  }
})

test('resolveLauncher: returns valid launcher structure', () => {
  const root = projectRoot()
  const launcher = resolveLauncher(null, 8081)
  assert.ok(launcher)
  assert.equal(typeof launcher.type, 'string')
  assert.equal(typeof launcher.command, 'string')
  assert.ok(Array.isArray(launcher.args))
  assert.equal(launcher.cwd, root)
})
