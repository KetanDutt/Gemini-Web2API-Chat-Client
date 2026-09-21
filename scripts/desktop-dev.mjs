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

const require = createRequire(import.meta.url)
const viteUrl = 'http://127.0.0.1:5173'

let viteProcess
let electronProcess
let shuttingDown = false

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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

  // Ensure Gemini Web2API is present, installed, and running
  try {
    await ensureWeb2Api({ background: true })
  } catch (err) {
    console.warn(`[WARN] Could not auto-start Gemini Web2API: ${err.message}`)
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

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (electronProcess && !electronProcess.killed) electronProcess.kill()
  if (viteProcess && !viteProcess.killed) viteProcess.kill()
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
