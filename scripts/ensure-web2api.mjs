#!/usr/bin/env node
/**
 * GlassGem - Gemini Web2API auto-checker, checkout, installer & runner.
 *
 * Ensures Gemini Web2API is present, installed/built, and actively running on
 * the target port before or when GlassGem starts.
 *
 * Behavior:
 *   1. Checks if Web2API is already answering on http://127.0.0.1:<port>
 *   2. If not running, checks if the gemini-web2api directory exists locally
 *   3. If missing, automatically clones https://github.com/ikhsan3adi/gemini-web2api
 *   4. Builds the Go binary if a Go compiler is installed
 *   5. Starts the server (Go binary, Python script, or built-in mock fallback)
 *   6. Waits until the server is ready before returning
 */
import { existsSync, chmodSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = Number(process.env.GLASSGEM_WEB2API_PORT || process.env.PORT || 8081)
const GIT_REPO = 'https://github.com/ikhsan3adi/gemini-web2api'

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

/**
 * Checks if an HTTP endpoint responds within timeoutMs (any response code proves server is alive).
 */
export function isServerResponding(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false
    try {
      const parsed = new URL(url)
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname + (parsed.search || ''),
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          if (!settled) {
            settled = true
            resolve(true)
          }
          res.resume()
        },
      )
      req.on('timeout', () => {
        req.destroy()
        if (!settled) {
          settled = true
          resolve(false)
        }
      })
      req.on('error', () => {
        if (!settled) {
          settled = true
          resolve(false)
        }
      })
      req.end()
    } catch {
      resolve(false)
    }
  })
}

/**
 * Finds or detects existing gemini-web2api directory.
 */
export function findWeb2ApiDir(root = projectRoot()) {
  const candidates = [
    process.env.WEB2API_DIR,
    path.join(root, 'gemini-web2api'),
    path.join(root, '..', 'gemini-web2api'),
    '/home/user/gemini-web2api',
  ].filter(Boolean)

  for (const dir of candidates) {
    if (existsSync(dir) && (existsSync(path.join(dir, 'main.go')) || existsSync(path.join(dir, 'gemini-web2api')) || existsSync(path.join(dir, 'gemini-web2api.exe')))) {
      return dir
    }
  }
  return null
}

/**
 * Clones the repository if not found locally.
 */
export function ensureWeb2ApiCheckout(targetDir) {
  if (existsSync(targetDir)) return true

  console.log(`[INFO]  gemini-web2api not found. Checking out ${GIT_REPO}...`)
  const result = spawnSync('git', ['clone', GIT_REPO, targetDir], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.status === 0 && existsSync(targetDir)) {
    console.log(`[OK]    Checked out gemini-web2api into ${targetDir}`)
    return true
  }

  console.warn(`[WARN]  git clone failed with code ${result.status}. Checking local fallbacks...`)
  return false
}

/**
 * Determines launcher spec: compiled Go binary, source build, Python, or mock server.
 */
export function resolveLauncher(web2ApiDir, port = DEFAULT_PORT) {
  const root = projectRoot()
  const isWin = process.platform === 'win32'
  const binaryName = isWin ? 'gemini-web2api.exe' : 'gemini-web2api'

  // 1. Existing binary
  if (web2ApiDir) {
    const binPath = path.join(web2ApiDir, binaryName)
    if (existsSync(binPath)) {
      try {
        if (!isWin) chmodSync(binPath, 0o755)
      } catch {}
      return {
        type: 'binary',
        command: binPath,
        args: ['--port', String(port)],
        cwd: web2ApiDir,
      }
    }

    // 2. Try compiling if Go compiler is available
    const goCheck = spawnSync('go', ['version'], { stdio: 'pipe' })
    if (goCheck.status === 0 && existsSync(path.join(web2ApiDir, 'main.go'))) {
      console.log(`[INFO]  Go compiler detected. Building ${binaryName}...`)
      const build = spawnSync('go', ['build', '-o', binaryName, '.'], {
        cwd: web2ApiDir,
        stdio: 'inherit',
      })
      if (build.status === 0 && existsSync(binPath)) {
        console.log(`[OK]    Built ${binPath}`)
        try {
          if (!isWin) chmodSync(binPath, 0o755)
        } catch {}
        return {
          type: 'binary',
          command: binPath,
          args: ['--port', String(port)],
          cwd: web2ApiDir,
        }
      } else {
        console.warn(`[WARN]  Go build failed. Using fallback launcher.`)
      }
    }

    // 3. Python script if present
    const pyScript = path.join(web2ApiDir, 'gemini_web2api.py')
    if (existsSync(pyScript)) {
      const pyCmd = isWin ? 'python' : 'python3'
      return {
        type: 'python',
        command: pyCmd,
        args: [pyScript, '--port', String(port)],
        cwd: web2ApiDir,
      }
    }
  }

  // 4. Built-in mock server fallback
  const mockScript = path.join(root, 'scripts', 'mock-web2api.mjs')
  return {
    type: 'mock',
    command: process.execPath,
    args: [mockScript, String(port)],
    cwd: root,
  }
}

/**
 * Ensures Gemini Web2API is present, installed, and running.
 */
export async function ensureWeb2Api({ port = DEFAULT_PORT, background = true, timeoutSec = 10 } = {}) {
  const checkUrl = `http://127.0.0.1:${port}/v1/models`

  // 1. Check if already responding
  if (await isServerResponding(checkUrl, 1000)) {
    console.log(`[OK]    Gemini Web2API is already running at http://127.0.0.1:${port}`)
    return { running: true, alreadyRunning: true }
  }

  // 2. Ensure checkout directory
  const root = projectRoot()
  let web2ApiDir = findWeb2ApiDir(root)
  if (!web2ApiDir) {
    const defaultTarget = path.join(root, 'gemini-web2api')
    if (ensureWeb2ApiCheckout(defaultTarget)) {
      web2ApiDir = defaultTarget
    }
  }

  // 3. Resolve launcher
  const launcher = resolveLauncher(web2ApiDir, port)
  console.log(`[INFO]  Starting Gemini Web2API (${launcher.type}) on port ${port}...`)

  const child = spawn(launcher.command, launcher.args, {
    cwd: launcher.cwd,
    stdio: background ? 'ignore' : 'inherit',
    detached: background && process.platform !== 'win32',
    env: { ...process.env, PORT: String(port) },
  })

  if (background && process.platform !== 'win32') {
    child.unref()
  }

  if (child.pid) {
    try {
      writeFileSync(path.join(root, '.web2api.pid'), String(child.pid))
    } catch {}
  }

  child.on('error', (err) => {
    console.error(`[ERROR] Failed to spawn Gemini Web2API (${launcher.type}): ${err.message}`)
  })

  // 4. Wait for server to become responsive
  const start = Date.now()
  const maxWaitMs = timeoutSec * 1000
  while (Date.now() - start < maxWaitMs) {
    if (await isServerResponding(checkUrl, 500)) {
      console.log(`[OK]    Gemini Web2API is online at http://127.0.0.1:${port}`)
      return { running: true, alreadyRunning: false, child, launcher }
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  console.warn(`[WARN]  Gemini Web2API did not respond on port ${port} after ${timeoutSec}s, continuing anyway.`)
  return { running: false, alreadyRunning: false, child, launcher }
}

// Execute directly if run as a script
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  ensureWeb2Api({ port: DEFAULT_PORT, background: false })
    .then((res) => {
      if (!res.running && !res.alreadyRunning) {
        process.exitCode = 1
      }
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
