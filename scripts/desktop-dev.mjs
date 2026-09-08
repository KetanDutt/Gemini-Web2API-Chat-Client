#!/usr/bin/env node
/**
 * Starts Vite and Electron together for desktop development without adding a
 * platform-specific process manager dependency. It works from PowerShell,
 * Command Prompt, macOS, and Linux.
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import process from 'node:process'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const viteUrl = 'http://127.0.0.1:5173'
const env = { ...process.env, GLASSGEM_DEV_SERVER_URL: viteUrl }

let viteProcess
let electronProcess
let shuttingDown = false

async function start() {
  viteProcess = spawn(npmCommand, ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'], {
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

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  shutdown(1)
})
