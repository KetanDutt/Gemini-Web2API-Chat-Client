#!/usr/bin/env node
/**
 * GlassGem - stops the background Gemini Web2API server.
 *
 * Reads the pid file written by scripts/ensure-web2api.mjs and terminates
 * that process (SIGTERM, then SIGKILL after a grace period). Refuses to kill
 * when the pid clearly belongs to another program, unless --force is given.
 *
 * Usage:
 *   node scripts/stop-web2api.mjs [--force] [--status]
 *
 *   --status   only report whether the managed server is running
 *   --force    kill even when the process cannot be verified as Web2API
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function pidFile() {
  return path.join(projectRoot(), '.web2api.pid')
}

function readPidFile() {
  const file = pidFile()
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8').trim()
    if (!raw) return null
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw)
      if (Number.isInteger(data.pid) && data.pid > 0) return data
      return null
    }
    const pid = Number(raw)
    if (Number.isInteger(pid) && pid > 0) return { pid, legacy: true }
    return null
  } catch {
    return null
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Best-effort command line of a process (null when unavailable). */
function describeProcess(pid) {
  // Linux: /proc
  try {
    const cmdline = path.join('/proc', String(pid), 'cmdline')
    if (existsSync(cmdline)) {
      return readFileSync(cmdline, 'utf8').replace(/\0/g, ' ').trim() || null
    }
  } catch {
    /* ignore */
  }
  // macOS / Unix with ps
  if (process.platform !== 'win32') {
    try {
      const ps = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
        stdio: 'pipe',
        shell: false,
        timeout: 5000,
      })
      const out = (ps.stdout || '').toString().trim()
      if (ps.status === 0 && out) return out
    } catch {
      /* ignore */
    }
    return null
  }
  // Windows: query the command line via PowerShell/CIM.
  try {
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty CommandLine)`,
      ],
      { stdio: 'pipe', shell: false, timeout: 10000 },
    )
    const out = (ps.stdout || '').toString().trim()
    if (ps.status === 0 && out) return out
  } catch {
    /* ignore */
  }
  try {
    const tl = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      stdio: 'pipe',
      shell: false,
      timeout: 10000,
    })
    const out = (tl.stdout || '').toString().trim()
    if (tl.status === 0 && out) return out
  } catch {
    /* ignore */
  }
  return null
}

function looksLikeWeb2Api(commandLine) {
  if (!commandLine) return null // unknown
  const lower = commandLine.toLowerCase()
  if (lower.includes('web2api')) return true
  // node running our mock script
  if (lower.includes('mock-web2api')) return true
  return false
}

async function stop({ force = false } = {}) {
  const entry = readPidFile()
  if (!entry) {
    console.log('[INFO]  No managed Web2API server found (no pid file). Nothing to stop.')
    return 0
  }

  const { pid } = entry

  // Ancient pid files (e.g. from before a reboot) must never kill an
  // unrelated process that reused the pid.
  if (!force && entry.started && Date.now() - entry.started > 7 * 24 * 3600 * 1000) {
    console.error(`[ERROR] Refusing to kill PID ${pid}: the pid file is older than 7 days (likely stale).`)
    console.error('        Remove .web2api.pid manually, or re-run with --force.')
    return 1
  }

  if (!isAlive(pid)) {
    console.log(`[INFO]  Process ${pid} is not running. Removing the stale pid file.`)
    try {
      rmSync(pidFile(), { force: true })
    } catch {}
    return 0
  }

  const commandLine = describeProcess(pid)
  const verified = looksLikeWeb2Api(commandLine)
  if (verified === false && !force) {
    console.error(`[ERROR] Refusing to kill PID ${pid}: it does not look like a Web2API server.`)
    console.error(`        Command: ${commandLine}`)
    console.error('        Remove .web2api.pid manually, or re-run with --force.')
    return 1
  }
  if (verified === null) {
    console.warn(`[WARN]  Could not verify PID ${pid} (process inspection unavailable).`)
    if (!force) {
      console.warn('[WARN]  Proceeding anyway - the pid file was written by ensure-web2api.mjs.')
    }
  } else {
    console.log(`[INFO]  Stopping Web2API (PID ${pid})...`)
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    console.error(`[ERROR] Could not signal PID ${pid}: ${err.message}`)
    return 1
  }

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (!isAlive(pid)) break
    await new Promise((r) => setTimeout(r, 200))
  }
  if (isAlive(pid)) {
    console.warn('[WARN]  Process did not exit on SIGTERM - forcing termination.')
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
    const hardDeadline = Date.now() + 3000
    while (Date.now() < hardDeadline) {
      if (!isAlive(pid)) break
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  if (isAlive(pid)) {
    console.error(`[ERROR] PID ${pid} is still running. Stop it manually and delete .web2api.pid.`)
    return 1
  }

  try {
    rmSync(pidFile(), { force: true })
  } catch {}
  console.log('[OK]    Web2API stopped.')
  return 0
}

function status() {
  const entry = readPidFile()
  if (!entry) {
    console.log('[INFO]  Web2API: not running (no pid file).')
    return 0
  }
  if (!isAlive(entry.pid)) {
    console.log(`[INFO]  Web2API: not running (stale pid file for PID ${entry.pid}).`)
    try {
      rmSync(pidFile(), { force: true })
    } catch {}
    return 1
  }
  const commandLine = describeProcess(entry.pid)
  console.log(`[INFO]  Web2API: running as PID ${entry.pid}${commandLine ? ` (${commandLine.slice(0, 120)})` : ''}.`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help') || args.includes('/?')) {
    console.log(`
GlassGem - stop the background Gemini Web2API server

Usage:  node scripts/stop-web2api.mjs [--force] [--status]

  --status   only report whether the managed server is running
  --force    kill even when the process cannot be verified as Web2API
`)
    process.exit(0)
  }
  if (args.includes('--status')) {
    process.exit(status())
  }
  stop({ force: args.includes('--force') }).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err)
      process.exit(1)
    },
  )
}
