#!/usr/bin/env node
/**
 * Starts Vite and Electron together for desktop development without adding a
 * platform-specific process manager dependency. It works from PowerShell,
 * Command Prompt, macOS, and Linux.
 *
 * Vite is started directly through node.exe (node_modules/vite/bin/vite.js)
 * instead of `npm run dev`. Since Node's April 2024 security fix
 * (CVE-2024-27980, shipped in 18.20.2 / 20.12.2 / 21.7.3 and later),
 * Windows refuses to spawn .cmd shims such as npm.cmd with shell:false and
 * throws "spawn EINVAL". Spawning Vite directly sidesteps that entirely and,
 * as a bonus, makes Vite a first-class child process: killing it here cannot
 * leave an orphaned dev server behind (killing npm only kills its shim).
 */
import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { ensureWeb2Api } from './ensure-web2api.mjs'
import { stopManagedServer } from './stop-web2api.mjs'

const require = createRequire(import.meta.url)
const viteUrl = 'http://127.0.0.1:5173'

let viteProcess
let electronProcess
let shuttingDown = false
let web2ApiOwned = false

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

/**
 * True when the Web2API daemon was started by THIS desktop session and must
 * therefore be stopped again when the session ends. A server that was already
 * running beforehand (npm run web2api, a system service, a previous session)
 * reports alreadyRunning / skipped and is deliberately left untouched.
 */
export function ownsWeb2Api(result) {
  return !!result && !result.alreadyRunning && !result.skipped && Number.isInteger(result.pid) && result.pid > 0
}

/**
 * The command used to start the Vite dev server. Always node itself plus the
 * vite.js entrypoint - never npm / npm.cmd - so Windows never sees a batch
 * file in spawn().
 */
export function viteLaunchSpec(root = projectRoot()) {
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  return {
    command: process.execPath,
    args: [viteBin, '--host', '127.0.0.1', '--strictPort'],
    viteBin,
  }
}

async function start() {
  const { command, args, viteBin } = viteLaunchSpec()
  if (!existsSync(viteBin)) {
    throw new Error(
      `Vite was not found at ${viteBin}. Reinstall the dependencies first:  run-desktop.bat clean`,
    )
  }

  // Ensure Gemini Web2API is present, installed, and running. The daemon is
  // session-scoped: it shares this terminal, so Ctrl+C or closing the window
  // stops it with the session - and when the app closes normally, shutdown()
  // below stops it explicitly. GLASSGEM_DESKTOP_MOCK=1 (set by
  // "run-desktop.bat mock") starts the mock server through the same lifecycle
  // instead of a separate window that outlives the app.
  const forceMock = process.env.GLASSGEM_DESKTOP_MOCK === '1'
  const prevSkip = process.env.GLASSGEM_SKIP_AUTO_WEB2API
  if (forceMock) {
    // An explicit mock request ("run-desktop.bat mock") beats the skip flag:
    // without this, SKIP_AUTO_WEB2API would silently leave the app backendless.
    delete process.env.GLASSGEM_SKIP_AUTO_WEB2API
  }
  try {
    const result = await ensureWeb2Api({
      background: true,
      sessionScoped: true,
      forceMock,
    })
    web2ApiOwned = ownsWeb2Api(result)
  } catch (err) {
    console.warn(`[WARN] Could not auto-start Gemini Web2API: ${err.message}`)
  } finally {
    if (forceMock) {
      if (prevSkip === undefined) delete process.env.GLASSGEM_SKIP_AUTO_WEB2API
      else process.env.GLASSGEM_SKIP_AUTO_WEB2API = prevSkip
    }
  }

  viteProcess = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })

  viteProcess.on('exit', (code, signal) => {
    if (!shuttingDown && (code ?? 0) !== 0) {
      console.error(`Vite exited before Electron finished (code ${code ?? 'unknown'}, signal ${signal ?? 'none'}).`)
      shutdown(1)
    }
  })

  viteProcess.on('error', (error) => {
    console.error(`Could not start Vite: ${error.message}`)
    shutdown(1)
  })

  await waitForVite()
  if (shuttingDown) return

  // Resolved lazily so importing this module (tests) does not require the
  // Electron runtime to be present.
  const electronPath = require('electron')
  const env = { ...process.env, GLASSGEM_DEV_SERVER_URL: viteUrl }

  electronProcess = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env,
    shell: false,
  })

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0)
  })

  electronProcess.on('error', (error) => {
    console.error(`Could not start Electron: ${error.message}`)
    shutdown(1)
  })
}

async function waitForVite() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (shuttingDown) return
    if (viteProcess?.exitCode !== null) {
      throw new Error('Vite stopped before its development server became ready.')
    }
    try {
      const response = await fetch(viteUrl, { signal: AbortSignal.timeout(1000) })
      if (response.ok || response.status === 404) return
    } catch {
      // Vite can take a few seconds to start on the first run.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Vite did not become ready at ${viteUrl}.`)
}

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (electronProcess && !electronProcess.killed) electronProcess.kill()
  if (viteProcess && !viteProcess.killed) viteProcess.kill()
  if (web2ApiOwned) {
    // The desktop session started the Web2API server - stop it again so no
    // orphaned backend keeps running after the app window closes. (Closing
    // the whole terminal also stops it: the session-scoped daemon shares
    // this console and receives the same OS console event.)
    try {
      console.log('[INFO]  Stopping the Web2API server started by this desktop session...')
      await stopManagedServer()
    } catch (err) {
      console.warn(`[WARN] Could not stop the Web2API server: ${err instanceof Error ? err.message : String(err)}`)
      console.warn('       Stop it manually with:  npm run web2api:stop')
    }
  }
  process.exitCode = code
}

function isEntryPoint() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    const invoked = realpathSync(entry)
    const self = realpathSync(fileURLToPath(import.meta.url))
    // Windows paths differ in casing between process.argv and import.meta.url.
    return process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  start().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    shutdown(1)
  })
}
