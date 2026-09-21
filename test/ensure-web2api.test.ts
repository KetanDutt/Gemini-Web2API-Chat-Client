import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain ESM helper module without type declarations
import {
  isServerResponding,
  findWeb2ApiDir,
  resolveLauncher,
  projectRoot,
  resolvePort,
  parsePortFromUrl,
  releaseAssetName,
  web2apiBinaryName,
  ensureWeb2Api,
  ensureWeb2ApiConfig,
  ensurePrebuiltBinary,
  vendoredWeb2ApiDir,
  VENDORED_DIR_NAME,
  EXTERNAL_DIR_NAME,
} from '../scripts/ensure-web2api.mjs'

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

test('web2apiBinaryName: uses .exe on Windows only', () => {
  assert.equal(web2apiBinaryName('win32'), 'gemini-web2api.exe')
  assert.equal(web2apiBinaryName('linux'), 'gemini-web2api')
  assert.equal(web2apiBinaryName('darwin'), 'gemini-web2api')
})

test('parsePortFromUrl: extracts valid ports, rejects the rest', () => {
  assert.equal(parsePortFromUrl('http://127.0.0.1:8081'), 8081)
  assert.equal(parsePortFromUrl('http://localhost:9090/v1'), 9090)
  assert.equal(parsePortFromUrl('http://127.0.0.1:8081/v1'), 8081)
  assert.equal(parsePortFromUrl('http://127.0.0.1/'), null)
  assert.equal(parsePortFromUrl('not a url'), null)
  assert.equal(parsePortFromUrl(''), null)
  assert.equal(parsePortFromUrl(undefined), null)
})

test('resolvePort: explicit > GLASSGEM_WEB2API_PORT > URL port > PORT > 8081', () => {
  assert.equal(resolvePort({ port: 1111, env: { GLASSGEM_WEB2API_PORT: '2222', GLASSGEM_WEB2API_URL: 'http://127.0.0.1:3333', PORT: '4444' } }), 1111)
  assert.equal(resolvePort({ env: { GLASSGEM_WEB2API_PORT: '2222', GLASSGEM_WEB2API_URL: 'http://127.0.0.1:3333', PORT: '4444' } }), 2222)
  assert.equal(resolvePort({ env: { GLASSGEM_WEB2API_URL: 'http://127.0.0.1:3333', PORT: '4444' } }), 3333)
  assert.equal(resolvePort({ env: { PORT: '4444' } }), 4444)
  assert.equal(resolvePort({ env: {} }), 8081)
  assert.equal(resolvePort({ env: { GLASSGEM_WEB2API_PORT: 'bogus' } }), 8081)
})

test('releaseAssetName: maps platform/arch/tag to goreleaser assets', () => {
  assert.equal(releaseAssetName('win32', 'x64', 'v1.1.0'), 'gemini-web2api_1.1.0_windows_amd64.zip')
  assert.equal(releaseAssetName('win32', 'arm64', 'v1.1.0'), 'gemini-web2api_1.1.0_windows_arm64.zip')
  assert.equal(releaseAssetName('linux', 'x64', 'v1.1.0'), 'gemini-web2api_1.1.0_linux_amd64.tar.gz')
  assert.equal(releaseAssetName('linux', 'arm64', 'v1.1.0'), 'gemini-web2api_1.1.0_linux_arm64.tar.gz')
  assert.equal(releaseAssetName('darwin', 'arm64', 'v1.1.0'), 'gemini-web2api_1.1.0_darwin_arm64.tar.gz')
  assert.equal(releaseAssetName('sunos', 'x64', 'v1.1.0'), null)
  assert.equal(releaseAssetName('linux', 'mips', 'v1.1.0'), null)
})

test('findWeb2ApiDir: an explicit WEB2API_DIR wins strictly', () => {
  const previous = process.env.WEB2API_DIR
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-strict-'))
  try {
    // Set but invalid -> null (never a silent fallback to another checkout).
    process.env.WEB2API_DIR = path.join(scratch, 'does-not-exist')
    assert.equal(findWeb2ApiDir(), null)

    // Set and valid -> honored.
    const valid = path.join(scratch, 'custom')
    mkdirSync(valid, { recursive: true })
    writeFileSync(path.join(valid, 'main.go'), 'package main\n')
    process.env.WEB2API_DIR = valid
    assert.equal(findWeb2ApiDir(), valid)
  } finally {
    if (previous === undefined) delete process.env.WEB2API_DIR
    else process.env.WEB2API_DIR = previous
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('findWeb2ApiDir: prefers the vendored backend over legacy checkouts', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-vendored-'))
  try {
    // Both trees present -> the vendored gemini-web2api-ikhsan3adi wins.
    const vendored = path.join(scratch, VENDORED_DIR_NAME)
    const legacy = path.join(scratch, EXTERNAL_DIR_NAME)
    mkdirSync(vendored, { recursive: true })
    mkdirSync(legacy, { recursive: true })
    writeFileSync(path.join(vendored, 'main.go'), 'package main\n')
    writeFileSync(path.join(legacy, 'main.go'), 'package main\n')

    assert.equal(vendoredWeb2ApiDir(scratch), path.join(scratch, 'gemini-web2api-ikhsan3adi'))
    assert.equal(findWeb2ApiDir(scratch), vendored)

    // Without the vendored tree, the legacy checkout is still honored.
    rmSync(vendored, { recursive: true, force: true })
    assert.equal(findWeb2ApiDir(scratch), legacy)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('findWeb2ApiDir: discovers the vendored backend bundled with this repo', () => {
  // The repository ships gemini-web2api-ikhsan3adi/ with Go sources: the
  // launcher must pick it up without any cloning or downloads.
  const root = projectRoot()
  const previous = process.env.WEB2API_DIR
  delete process.env.WEB2API_DIR
  try {
    const dir = findWeb2ApiDir(root)
    if (existsSync(path.join(root, VENDORED_DIR_NAME, 'main.go'))) {
      assert.equal(dir, vendoredWeb2ApiDir(root))
    }
  } finally {
    if (previous !== undefined) process.env.WEB2API_DIR = previous
  }
})

test('ensureWeb2ApiConfig: writes a default config, never overwrites', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-cfg-'))
  try {
    const created = ensureWeb2ApiConfig(dir, 18081)
    assert.ok(created)
    assert.ok(existsSync(path.join(dir, 'config.json')))
    const config = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'))
    assert.equal(config.port, 18081)
    assert.ok(config.api_keys.includes('sk-gemini'))

    // Existing configs are left untouched.
    writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ port: 9999, api_keys: ['mine'] }))
    ensureWeb2ApiConfig(dir, 18081)
    const kept = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'))
    assert.equal(kept.port, 9999)
    assert.deepEqual(kept.api_keys, ['mine'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('ensureWeb2Api: honors GLASSGEM_SKIP_AUTO_WEB2API without side effects', async () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-skip-'))
  const previous = process.env.GLASSGEM_SKIP_AUTO_WEB2API
  process.env.GLASSGEM_SKIP_AUTO_WEB2API = '1'
  try {
    const result = await ensureWeb2Api({ port: 59991, stateDir, timeoutSec: 2 })
    assert.equal(result.skipped, true)
    assert.equal(result.running, false)
    assert.ok(!existsSync(path.join(stateDir, '.web2api.pid')))
  } finally {
    if (previous === undefined) delete process.env.GLASSGEM_SKIP_AUTO_WEB2API
    else process.env.GLASSGEM_SKIP_AUTO_WEB2API = previous
    rmSync(stateDir, { recursive: true, force: true })
  }
})

test('ensureWeb2Api: reuses a running server and reconciles the pid file', async () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-reuse-'))
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"object":"list","data":[]}')
  })
  await new Promise<void>((resolve) => server.listen(59992, '127.0.0.1', () => resolve()))
  try {
    // A pid file pointing at a dead process is stale and gets removed...
    writeFileSync(path.join(stateDir, '.web2api.pid'), JSON.stringify({ pid: 999999999, port: 59992, started: Date.now() }))
    const result = await ensureWeb2Api({ port: 59992, stateDir, timeoutSec: 2 })
    assert.equal(result.running, true)
    assert.equal(result.alreadyRunning, true)
    assert.ok(!existsSync(path.join(stateDir, '.web2api.pid')))

    // ...while a file pointing at a live process is kept for stop-web2api.mjs.
    writeFileSync(
      path.join(stateDir, '.web2api.pid'),
      JSON.stringify({ pid: process.pid, port: 59992, started: Date.now(), type: 'mock' }),
    )
    const second = await ensureWeb2Api({ port: 59992, stateDir, timeoutSec: 2 })
    assert.equal(second.running, true)
    assert.ok(existsSync(path.join(stateDir, '.web2api.pid')))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(stateDir, { recursive: true, force: true })
  }
})

test('ensureWeb2Api: background daemon returns (does not hang the caller)', async () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-daemon-'))
  const port = 59993
  try {
    // Regression test for the launcher hang: this call must resolve instead
    // of staying alive until the server exits (missing unref).
    const result = await ensureWeb2Api({ port, stateDir, forceMock: true, timeoutSec: 15 })
    assert.equal(result.running, true)
    assert.equal(result.alreadyRunning, false)
    assert.equal(result.launcher?.type, 'mock')
    assert.ok(existsSync(path.join(stateDir, '.web2api.pid')))
    assert.equal(await isServerResponding(`http://127.0.0.1:${port}/v1/models`, 2000), true)
  } finally {
    // Stop the mock daemon we started.
    try {
      const raw = readFileSync(path.join(stateDir, '.web2api.pid'), 'utf8')
      const pid = JSON.parse(raw).pid ?? Number(raw)
      if (Number.isInteger(pid)) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {}
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
          if (!(await isServerResponding(`http://127.0.0.1:${port}/v1/models`, 300))) break
          await new Promise((r) => setTimeout(r, 200))
        }
      }
    } catch {}
    rmSync(stateDir, { recursive: true, force: true })
  }
})

test(
  'ensurePrebuiltBinary: downloads, checksums, extracts via a local mirror',
  { skip: process.platform === 'win32' ? 'POSIX-only fixture (tar + shell binary)' : false },
  async (t) => {
    const tar = spawnSync('tar', ['--version'], { stdio: 'pipe', shell: false })
    if (tar.status !== 0) {
      t.skip('tar binary not available')
      return
    }

    const tag = 'v9.9.9-test'
    const tamperedTag = 'v9.9.9-tampered'
    const assetName = releaseAssetName(process.platform, process.arch, tag)
    const tamperedAsset = releaseAssetName(process.platform, process.arch, tamperedTag)
    assert.ok(assetName?.endsWith('.tar.gz'))
    assert.ok(tamperedAsset?.endsWith('.tar.gz'))

    // Fixture "binary": a shell script answering --version, padded with
    // incompressible-ish lines so the archive is realistically sized.
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'gg-web2api-dl-'))
    const payloadDir = path.join(scratch, 'payload')
    mkdirSync(payloadDir, { recursive: true })
    const binaryName = web2apiBinaryName(process.platform)
    const scriptPath = path.join(payloadDir, binaryName)
    let script = '#!/bin/sh\necho "gemini-web2api test-fixture"\n'
    for (let i = 0; i < 300; i += 1) {
      script += `# padding-${i}-${Math.sin(i).toFixed(9)}-fixture-filler-line-to-grow-the-archive\n`
    }
    writeFileSync(scriptPath, script)
    chmodSync(scriptPath, 0o755)

    const archivePath = path.join(scratch, assetName)
    const packed = spawnSync('tar', ['-czf', archivePath, '-C', payloadDir, binaryName], { stdio: 'pipe', shell: false })
    assert.equal(packed.status, 0)
    const archiveBytes = readFileSync(archivePath)
    assert.ok(archiveBytes.length > 1024, `fixture archive must exceed the tiny-download tripwire (got ${archiveBytes.length} bytes)`)
    const goodSums = `${createHash('sha256').update(archiveBytes).digest('hex')}  ${assetName}\n`

    const server = http.createServer((req, res) => {
      if (req.url === `/${tag}/${assetName}` || req.url === `/${tamperedTag}/${tamperedAsset}`) {
        res.writeHead(200, { 'Content-Type': 'application/gzip' })
        res.end(archiveBytes)
      } else if (req.url === `/${tag}/checksums.txt`) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(goodSums)
      } else if (req.url === `/${tamperedTag}/checksums.txt`) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`${'0'.repeat(64)}  ${tamperedAsset}\n`)
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('nope')
      }
    })
    await new Promise<void>((resolve) => server.listen(59994, '127.0.0.1', () => resolve()))

    const prevTag = process.env.WEB2API_RELEASE_TAG
    const prevBase = process.env.WEB2API_RELEASE_BASE
    try {
      process.env.WEB2API_RELEASE_BASE = 'http://127.0.0.1:59994'

      // Happy path: pinned tag skips the GitHub API entirely.
      process.env.WEB2API_RELEASE_TAG = tag
      const installDir = path.join(scratch, 'install')
      mkdirSync(installDir, { recursive: true })
      const installed = await ensurePrebuiltBinary(installDir)
      assert.ok(installed)
      assert.equal(installed, path.join(installDir, binaryName))
      assert.ok(existsSync(installed as string))
      const probe = spawnSync(installed as string, ['--version'], { stdio: 'pipe', shell: false, timeout: 10000 })
      assert.equal(probe.status, 0)

      // Tampered download: checksum mismatch must discard the binary.
      process.env.WEB2API_RELEASE_TAG = 'v9.9.9-tampered'
      const tamperedDir = path.join(scratch, 'tampered')
      mkdirSync(tamperedDir, { recursive: true })
      const rejected = await ensurePrebuiltBinary(tamperedDir)
      assert.equal(rejected, null)
      assert.ok(!existsSync(path.join(tamperedDir, binaryName)))
    } finally {
      if (prevTag === undefined) delete process.env.WEB2API_RELEASE_TAG
      else process.env.WEB2API_RELEASE_TAG = prevTag
      if (prevBase === undefined) delete process.env.WEB2API_RELEASE_BASE
      else process.env.WEB2API_RELEASE_BASE = prevBase
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(scratch, { recursive: true, force: true })
    }
  },
)
