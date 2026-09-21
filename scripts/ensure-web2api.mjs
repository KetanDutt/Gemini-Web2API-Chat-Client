#!/usr/bin/env node
/**
 * GlassGem - Gemini Web2API auto-checker, installer & runner.
 *
 * Ensures Gemini Web2API is present, installed/built, and actively running on
 * the target port before or when GlassGem starts.
 *
 * Behavior:
 *   1. Checks if Web2API is already answering on http://127.0.0.1:<port>
 *   2. If not running, prefers the vendored backend sources bundled with this
 *      repository at gemini-web2api-ikhsan3adi/ (a copy of
 *      https://github.com/ikhsan3adi/gemini-web2api), then reuses an existing
 *      gemini-web2api checkout from the usual locations.
 *   3. If nothing is found, automatically checks the sources out from GitHub
 *      (needs git)
 *   4. Uses an existing Go binary, builds one with Go, or downloads a
 *      prebuilt release binary (so neither git nor Go is strictly required)
 *   5. Writes a default config.json (API key sk-gemini) when none exists
 *   6. Starts the server as a detached background daemon (default) and waits
 *      until it answers before returning
 *   7. Falls back to the built-in mock server only when no real server can
 *      be provided (the mock returns sample answers, clearly labelled)
 *
 * Direct usage:
 *   node scripts/ensure-web2api.mjs [port] [options]
 *
 * Options:
 *   --port N           port to run/check (default: 8081, see resolvePort)
 *   --foreground       run the server in the foreground (blocks; for
 *                      debugging/systemd-style use). Default is a detached
 *                      background daemon so launchers (run.bat, run.sh,
 *                      run-desktop.bat) continue starting GlassGem.
 *   --timeout SEC      how long to wait for the server (default: 20)
 *   --no-clone         do not git-clone a missing checkout
 *   --no-download      do not download a prebuilt release binary
 *   --mock             start the built-in mock server instead of the real one
 *   --install-only     prepare checkout/config/binary, but do not start
 *   -h, --help         show this help
 *
 * Environment:
 *   GLASSGEM_WEB2API_URL        origin of Web2API (its port is honored)
 *   GLASSGEM_WEB2API_PORT       explicit port (wins over the URL port)
 *   PORT                        fallback port
 *   WEB2API_DIR                 explicit checkout directory
 *   WEB2API_RELEASE_TAG         pin a release tag (default: latest via API)
 *   WEB2API_NO_DOWNLOAD=1       same as --no-download
 *   WEB2API_NO_CLONE=1          same as --no-clone
 *   GLASSGEM_SKIP_AUTO_WEB2API=1  only check status, never start anything
 */
import {
  existsSync,
  chmodSync,
  writeFileSync,
  writeSync,
  readFileSync,
  readSync,
  copyFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  openSync,
  closeSync,
  statSync,
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const GIT_REPO = 'https://github.com/ikhsan3adi/gemini-web2api'
const GITHUB_API_LATEST = 'https://api.github.com/repos/ikhsan3adi/gemini-web2api/releases/latest'
const RELEASE_DOWNLOAD_BASE = 'https://github.com/ikhsan3adi/gemini-web2api/releases/download'
// Last-known-good tag, used only when the GitHub API cannot be reached
// (release assets are immutable, so this URL keeps working).
const FALLBACK_RELEASE_TAG = 'v1.1.0'
const SKIP_ENV = 'GLASSGEM_SKIP_AUTO_WEB2API'
const DEFAULT_API_KEY = 'sk-gemini'
// Name of the backend sources vendored inside this repository. GlassGem uses
// these out of the box instead of requiring a separate checkout.
export const VENDORED_DIR_NAME = 'gemini-web2api-ikhsan3adi'
// Legacy name used by earlier releases and by the GitHub clone fallback.
export const EXTERNAL_DIR_NAME = 'gemini-web2api'

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

/** The vendored backend directory inside this repository (may not exist). */
export function vendoredWeb2ApiDir(root = projectRoot()) {
  return path.join(root, VENDORED_DIR_NAME)
}

/** Binary file name for a platform (defaults to the current one). */
export function web2apiBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'gemini-web2api.exe' : 'gemini-web2api'
}

/** Extracts a port number from a URL string, or null when absent/invalid. */
export function parsePortFromUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const url = new URL(raw.trim())
    const port = Number(url.port)
    if (Number.isInteger(port) && port > 0 && port < 65536) return port
  } catch {
    /* not a URL */
  }
  return null
}

function validPort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
}

/**
 * Resolves the Web2API port. Precedence: explicit option >
 * GLASSGEM_WEB2API_PORT > port in GLASSGEM_WEB2API_URL > PORT > 8081.
 */
export function resolvePort({ port, env = process.env } = {}) {
  return (
    validPort(port) ??
    validPort(env.GLASSGEM_WEB2API_PORT) ??
    parsePortFromUrl(env.GLASSGEM_WEB2API_URL) ??
    validPort(env.PORT) ??
    8081
  )
}

export const DEFAULT_PORT = resolvePort()

export function resolvePidFile(stateDir = projectRoot()) {
  return path.join(stateDir, '.web2api.pid')
}

export function resolveLogFile(stateDir = projectRoot()) {
  return path.join(stateDir, '.web2api.log')
}

/**
 * Checks if an HTTP endpoint responds within timeoutMs (any response code proves server is alive).
 */
export function isServerResponding(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false
    try {
      const parsed = new URL(url)
      const client = parsed.protocol === 'https:' ? https : http
      const req = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
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

function hasCommand(command, args = ['version']) {
  try {
    const result = spawnSync(command, args, { stdio: 'pipe', shell: false })
    return result.status === 0
  } catch {
    return false
  }
}

export function hasGit() {
  return hasCommand('git', ['--version'])
}

export function hasGo() {
  return hasCommand('go', ['version'])
}

/** A directory counts only when it holds sources or a binary. */
function isValidWeb2ApiDir(dir) {
  if (!dir || !existsSync(dir)) return false
  try {
    if (!statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  return (
    existsSync(path.join(dir, 'main.go')) ||
    existsSync(path.join(dir, 'gemini-web2api')) ||
    existsSync(path.join(dir, 'gemini-web2api.exe'))
  )
}

/**
 * Finds an existing gemini-web2api directory.
 * Priority: WEB2API_DIR (strict) > vendored gemini-web2api-ikhsan3adi inside
 * this repo > legacy gemini-web2api checkouts (project, parent, home).
 * An explicit WEB2API_DIR wins strictly: when set but invalid, null is
 * returned (with a warning) instead of silently using another checkout.
 */
export function findWeb2ApiDir(root = projectRoot()) {
  const explicit = (process.env.WEB2API_DIR || '').trim()
  if (explicit) {
    if (isValidWeb2ApiDir(explicit)) return explicit
    console.warn(`[WARN]  WEB2API_DIR=${explicit} holds no gemini-web2api sources or binary - ignoring it.`)
    return null
  }

  let homeDir = null
  try {
    homeDir = os.homedir()
  } catch {
    /* ignore */
  }
  const candidates = [
    vendoredWeb2ApiDir(root),
    path.join(root, EXTERNAL_DIR_NAME),
    path.join(root, '..', EXTERNAL_DIR_NAME),
    homeDir ? path.join(homeDir, EXTERNAL_DIR_NAME) : null,
  ].filter(Boolean)

  for (const dir of candidates) {
    if (isValidWeb2ApiDir(dir)) return dir
  }
  return null
}

/**
 * Clones the repository if not found locally.
 * Returns true when a usable checkout exists afterwards.
 */
export function ensureWeb2ApiCheckout(targetDir, { clone = true } = {}) {
  if (isValidWeb2ApiDir(targetDir)) return true

  if (existsSync(targetDir)) {
    console.warn(`[WARN]  ${targetDir} exists but holds no gemini-web2api sources or binary - ignoring it.`)
    return false
  }

  if (!clone || process.env.WEB2API_NO_CLONE === '1') {
    console.log('[INFO]  Checkout disabled (--no-clone); skipping git clone.')
    return false
  }

  if (!hasGit()) {
    console.warn('[WARN]  git is not installed, so the sources cannot be checked out. Trying a prebuilt binary instead...')
    return false
  }

  console.log(`[INFO]  gemini-web2api not found. Checking out ${GIT_REPO}...`)
  const result = spawnSync('git', ['clone', '--depth', '1', GIT_REPO, targetDir], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.status === 0 && isValidWeb2ApiDir(targetDir)) {
    console.log(`[OK]    Checked out gemini-web2api into ${targetDir}`)
    return true
  }

  // A failed clone may leave a partial directory behind - remove it so the
  // next run (or the prebuilt download below) starts clean.
  try {
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  console.warn('[WARN]  git clone failed. Trying a prebuilt binary instead...')
  return false
}

/**
 * Writes a default config.json (API key sk-gemini) when none exists.
 * An existing config is never touched.
 */
export function ensureWeb2ApiConfig(web2ApiDir, port = DEFAULT_PORT) {
  if (!web2ApiDir) return null
  const configPath = path.join(web2ApiDir, 'config.json')
  if (existsSync(configPath)) return configPath

  let config = null
  const examplePath = path.join(web2ApiDir, 'config.example.json')
  if (existsSync(examplePath)) {
    try {
      config = JSON.parse(readFileSync(examplePath, 'utf8'))
    } catch {
      config = null
    }
  }
  if (!config || typeof config !== 'object') {
    config = {
      port,
      host: '0.0.0.0',
      retry_attempts: 3,
      retry_delay_sec: 2,
      request_timeout_sec: 180,
      default_model: 'gemini-3.6-flash',
      api_keys: [DEFAULT_API_KEY],
      log_requests: true,
      temporary_chats: false,
    }
  }

  config.port = port
  if (!Array.isArray(config.api_keys) || config.api_keys.length === 0) {
    config.api_keys = [DEFAULT_API_KEY]
  }

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
    console.log(`[OK]    Created default config at ${configPath} (API key: ${config.api_keys[0]})`)
    return configPath
  } catch (err) {
    console.warn(`[WARN]  Could not write ${configPath}: ${err.message}`)
    return null
  }
}

/**
 * Goreleaser asset name for a platform/arch/tag, or null when unsupported.
 * Examples: gemini-web2api_1.1.0_windows_amd64.zip
 *           gemini-web2api_1.1.0_linux_arm64.tar.gz
 */
export function releaseAssetName(
  platform = process.platform,
  arch = process.arch,
  tag = FALLBACK_RELEASE_TAG,
) {
  const osMap = { win32: 'windows', darwin: 'darwin', linux: 'linux' }
  const archMap = { x64: 'amd64', arm64: 'arm64' }
  const osName = osMap[platform]
  const archName = archMap[arch]
  if (!osName || !archName) return null
  const version = String(tag).replace(/^v/, '')
  const ext = osName === 'windows' ? 'zip' : 'tar.gz'
  return `gemini-web2api_${version}_${osName}_${archName}.${ext}`
}

function hasCurl() {
  try {
    const result = spawnSync('curl', ['--version'], { stdio: 'pipe', shell: false })
    return result.status === 0
  } catch {
    return false
  }
}

/** Extracts the meaningful `curl: (N) ...` line from curl's stderr. */
function curlErrorMessage(result) {
  const lines = (result.stderr || '').toString().split('\n').map((l) => l.trim()).filter(Boolean)
  const meaningful = lines.filter((l) => !l.startsWith('%') && !/^Dload|^ +0 /.test(l))
  const tail = meaningful.length > 0 ? meaningful[meaningful.length - 1] : ''
  return tail || `curl exited with code ${result.status}`
}

/**
 * Runs curl asynchronously (never spawnSync: a blocking wait would freeze
 * this process's event loop, deadlocking downloads from servers - such as
 * test mirrors or localhost proxies - that share it).
 */
function spawnCurl(args, { maxBuffer = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutLen = 0
    let stderrLen = 0
    let finished = false
    const finish = (fn, value) => {
      if (finished) return
      finished = true
      fn(value)
    }
    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk)
      stdoutLen += chunk.length
      if (stdoutLen > maxBuffer) {
        try {
          child.kill('SIGKILL')
        } catch {}
        finish(rejectPromise, new Error('curl output exceeded the size limit'))
      }
    })
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk)
      stderrLen += chunk.length
      if (stderrLen > maxBuffer) {
        try {
          child.kill('SIGKILL')
        } catch {}
        finish(rejectPromise, new Error('curl error output exceeded the size limit'))
      }
    })
    child.on('error', (err) => finish(rejectPromise, err))
    child.on('close', (code) => {
      finish(resolvePromise, { status: code, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks) })
    })
  })
}

/** Last-resort fetch via the curl binary (uses system CA store + proxy env). */
async function curlGetJson(url, { timeoutSec = 20 } = {}) {
  const result = await spawnCurl([
    '-fsSL',
    '--connect-timeout',
    String(timeoutSec),
    '--max-time',
    String(timeoutSec * 3),
    '-H',
    'User-Agent: GlassGem-Web2API-Setup',
    '-H',
    'Accept: application/vnd.github+json',
    url,
  ])
  if (result.status !== 0) {
    throw new Error(curlErrorMessage(result))
  }
  return JSON.parse((result.stdout || '').toString())
}

async function curlDownload(url, destPath, { timeoutSec = 30 } = {}) {
  const result = await spawnCurl([
    '-sfL',
    '--connect-timeout',
    String(timeoutSec),
    '--max-time',
    '300',
    '--retry',
    '2',
    '-o',
    destPath,
    '-A',
    'GlassGem-Web2API-Setup',
    url,
  ])
  if (result.status !== 0) {
    throw new Error(curlErrorMessage(result))
  }
  return destPath
}

function httpGetJson(url, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const succeed = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const fail = (primaryError) => {
      if (settled) return
      settled = true
      // Node ships its own CA list and ignores system/proxy CAs; curl uses
      // the OS store and honors (HTTPS_)PROXY, so retry through it.
      if (!hasCurl()) {
        reject(primaryError)
        return
      }
      curlGetJson(url).then(resolve, (curlError) => {
        reject(new Error(`${primaryError.message} (curl fallback: ${curlError.message})`))
      })
    }
    const get = (current, redirectsLeft) => {
      let parsed
      try {
        parsed = new URL(current)
      } catch (err) {
        fail(err)
        return
      }
      const client = parsed.protocol === 'https:' ? https : http
      const req = client.get(
        current,
        {
          timeout: timeoutMs,
          headers: {
            'User-Agent': 'GlassGem-Web2API-Setup',
            Accept: 'application/vnd.github+json',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
            res.resume()
            get(new URL(res.headers.location, current).toString(), redirectsLeft - 1)
            return
          }
          if (status < 200 || status >= 300) {
            res.resume()
            fail(new Error(`HTTP ${status} for ${current}`))
            return
          }
          let data = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              succeed(JSON.parse(data))
            } catch (err) {
              fail(err)
            }
          })
        },
      )
      req.on('timeout', () => {
        req.destroy(new Error(`Timed out fetching ${current}`))
      })
      req.on('error', fail)
    }
    get(url, 5)
  })
}

function downloadFile(url, destPath, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const succeed = () => {
      if (settled) return
      settled = true
      resolve(destPath)
    }
    const fail = (primaryError) => {
      if (settled) return
      settled = true
      if (process.env.GLASSGEM_DEBUG) {
        console.error(`[DEBUG] downloadFile primary failure for ${url}: ${primaryError.message}`)
      }
      try {
        rmSync(destPath, { force: true })
      } catch {}
      // Retry via curl (system CA store + proxy support) before giving up.
      if (!hasCurl()) {
        reject(primaryError)
        return
      }
      curlDownload(url, destPath).then(
        () => resolve(destPath),
        (curlError) => {
          reject(new Error(`${primaryError.message} (curl fallback: ${curlError.message})`))
        },
      )
    }
    const get = (current, redirectsLeft) => {
      let parsed
      try {
        parsed = new URL(current)
      } catch (err) {
        fail(err)
        return
      }
      const client = parsed.protocol === 'https:' ? https : http
      const req = client.get(
        current,
        { timeout: timeoutMs, headers: { 'User-Agent': 'GlassGem-Web2API-Setup' } },
        (res) => {
          const status = res.statusCode ?? 0
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
            res.resume()
            get(new URL(res.headers.location, current).toString(), redirectsLeft - 1)
            return
          }
          if (status < 200 || status >= 300) {
            res.resume()
            fail(new Error(`HTTP ${status} for ${current}`))
            return
          }
          let fd = null
          try {
            fd = openSync(destPath, 'w')
          } catch (err) {
            fail(err)
            return
          }
          res.on('data', (chunk) => {
            if (settled || fd === null) return
            try {
              writeSync(fd, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            } catch (err) {
              try {
                closeSync(fd)
              } catch {}
              fd = null
              fail(err)
            }
          })
          res.on('end', () => {
            if (fd !== null) {
              try {
                closeSync(fd)
              } catch {}
            }
            succeed()
          })
          res.on('error', (err) => {
            if (fd !== null) {
              try {
                closeSync(fd)
              } catch {}
              fd = null
            }
            fail(err)
          })
        },
      )
      req.on('timeout', () => {
        req.destroy(new Error(`Timed out downloading ${current}`))
      })
      req.on('error', fail)
    }
    get(url, 5)
  })
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

function releaseDownloadBase() {
  // Overridable for mirrors and offline tests.
  const custom = (process.env.WEB2API_RELEASE_BASE || '').trim().replace(/\/+$/, '')
  return custom || RELEASE_DOWNLOAD_BASE
}

/** Verifies the archive against checksums.txt when an entry exists. */
async function verifyArchiveChecksum(archivePath, assetName, tag, tempDir) {
  const url = `${releaseDownloadBase()}/${tag}/checksums.txt`
  const sumsPath = path.join(tempDir, 'checksums.txt')
  try {
    await downloadFile(url, sumsPath)
  } catch {
    console.warn('[WARN]  Could not fetch checksums.txt - skipping checksum verification (TLS still protects the download).')
    return true
  }
  let expected = null
  try {
    const lines = readFileSync(sumsPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/)
      if (match && match[2].trim() === assetName) {
        expected = match[1].toLowerCase()
        break
      }
    }
  } catch {
    /* ignore */
  }
  if (!expected) {
    console.warn('[WARN]  No checksum entry for the downloaded asset - skipping verification.')
    return true
  }
  const actual = sha256File(archivePath).toLowerCase()
  if (actual !== expected) {
    console.error('[ERROR] Checksum mismatch for the downloaded Web2API binary - discarding it.')
    return false
  }
  console.log('[OK]    SHA-256 checksum matches the official release.')
  return true
}

function extractArchive(archivePath, destDir) {
  if (archivePath.endsWith('.zip')) {
    // Windows bsdtar handles zip; GNU tar does not - but zip assets are only
    // ever used on Windows, with PowerShell as a fallback.
    const tar = spawnSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'pipe', shell: false })
    if (tar.status === 0) return true
    if (process.platform === 'win32') {
      const ps = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`,
        ],
        { stdio: 'pipe', shell: false },
      )
      return ps.status === 0
    }
    return false
  }
  const tar = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'pipe', shell: false })
  return tar.status === 0
}

function findExtractedBinary(dir, binaryName) {
  const direct = path.join(dir, binaryName)
  if (existsSync(direct)) return direct
  // Some archives nest the binary one level deep.
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const nested = path.join(dir, entry.name, binaryName)
        if (existsSync(nested)) return nested
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Downloads the latest prebuilt gemini-web2api release binary into web2ApiDir.
 * Returns the binary path on success, null otherwise.
 */
export async function ensurePrebuiltBinary(web2ApiDir) {
  if (!web2ApiDir) return null
  const binaryName = web2apiBinaryName()
  const binPath = path.join(web2ApiDir, binaryName)
  if (existsSync(binPath)) return binPath

  const pinnedTag = (process.env.WEB2API_RELEASE_TAG || '').trim()
  let tag = pinnedTag || null
  let assetUrl = null

  if (!tag) {
    try {
      const release = await httpGetJson(GITHUB_API_LATEST)
      tag = release.tag_name
      const assetName = releaseAssetName(process.platform, process.arch, tag)
      const asset = (release.assets || []).find((a) => a.name === assetName)
      if (asset?.browser_download_url) assetUrl = asset.browser_download_url
    } catch (err) {
      console.warn(`[WARN]  Could not query the latest Web2API release (${err.message}).`)
    }
  }

  if (!tag) {
    tag = FALLBACK_RELEASE_TAG
    console.log(`[INFO]  Falling back to the known release ${tag}.`)
  }
  const assetName = releaseAssetName(process.platform, process.arch, tag)
  if (!assetName) {
    console.warn(`[WARN]  No prebuilt Web2API binary for ${process.platform}/${process.arch}.`)
    return null
  }
  if (!assetUrl) assetUrl = `${releaseDownloadBase()}/${tag}/${assetName}`

  console.log(`[INFO]  Downloading prebuilt gemini-web2api ${tag} (${assetName})...`)
  const tempDir = path.join(os.tmpdir(), `glassgem-web2api-dl-${process.pid}-${Date.now()}`)
  try {
    mkdirSync(tempDir, { recursive: true })
  } catch (err) {
    console.warn(`[WARN]  Could not create a temp folder: ${err.message}`)
    return null
  }

  try {
    const archivePath = path.join(tempDir, assetName)
    await downloadFile(assetUrl, archivePath)
    const stat = statSync(archivePath)
    if (!stat.isFile() || stat.size < 1024) {
      console.warn('[WARN]  The downloaded file is suspiciously small - discarding it.')
      return null
    }
    if (!(await verifyArchiveChecksum(archivePath, assetName, tag, tempDir))) return null

    const extractDir = path.join(tempDir, 'extracted')
    mkdirSync(extractDir, { recursive: true })
    if (!extractArchive(archivePath, extractDir)) {
      console.warn('[WARN]  Could not extract the downloaded archive.')
      return null
    }
    const extracted = findExtractedBinary(extractDir, binaryName)
    if (!extracted) {
      console.warn('[WARN]  The archive did not contain the expected binary.')
      return null
    }

    mkdirSync(web2ApiDir, { recursive: true })
    try {
      copyFileSync(extracted, binPath)
    } catch (err) {
      console.warn(`[WARN]  Could not install the downloaded binary: ${err.message}`)
      return null
    }
    if (process.platform !== 'win32') {
      try {
        chmodSync(binPath, 0o755)
      } catch {}
    }

    // Sanity check: the binary must at least answer --version.
    const probe = spawnSync(binPath, ['--version'], { stdio: 'pipe', shell: false, timeout: 15000 })
    if (probe.status !== 0) {
      console.warn('[WARN]  The downloaded binary does not run on this machine - discarding it.')
      try {
        rmSync(binPath, { force: true })
      } catch {}
      return null
    }

    console.log(`[OK]    Installed prebuilt gemini-web2api ${tag} at ${binPath}`)
    return binPath
  } catch (err) {
    console.warn(`[WARN]  Prebuilt binary download failed (${err.message}).`)
    return null
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * Builds the Go binary inside web2ApiDir when a Go toolchain is available.
 * Returns the binary path on success, null otherwise.
 */
export function tryGoBuild(web2ApiDir) {
  if (!web2ApiDir) return null
  const isWin = process.platform === 'win32'
  const binaryName = web2apiBinaryName()
  const binPath = path.join(web2ApiDir, binaryName)
  if (existsSync(binPath)) return binPath
  if (!existsSync(path.join(web2ApiDir, 'main.go'))) return null
  if (!hasGo()) return null

  console.log(`[INFO]  Go toolchain detected. Building ${binaryName} (static, CGO_ENABLED=0)...`)
  // CGO_ENABLED=0: the module is pure Go, so a static build removes any libc
  // dependency — the same binary then runs on glibc and musl (Alpine) alike.
  const build = spawnSync('go', ['build', '-o', binaryName, '.'], {
    cwd: web2ApiDir,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, CGO_ENABLED: process.env.CGO_ENABLED ?? '0' },
  })
  if (build.status === 0 && existsSync(binPath)) {
    console.log(`[OK]    Built ${binPath}`)
    try {
      if (!isWin) chmodSync(binPath, 0o755)
    } catch {}
    return binPath
  }
  console.warn('[WARN]  Go build failed.')
  return null
}

/**
 * Determines launcher spec: compiled Go binary, source build, Python, or mock server.
 * (Synchronous - the async prebuilt download happens in ensureWeb2Api.)
 */
export function resolveLauncher(web2ApiDir, port = DEFAULT_PORT) {
  const root = projectRoot()
  const isWin = process.platform === 'win32'
  const binaryName = web2apiBinaryName()

  if (web2ApiDir) {
    let binPath = path.join(web2ApiDir, binaryName)
    if (!existsSync(binPath)) {
      const built = tryGoBuild(web2ApiDir)
      if (built) binPath = built
    }
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

    // Legacy Python implementation (kept for older checkouts).
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

  // Built-in mock server fallback (sample answers only).
  const mockScript = path.join(root, 'scripts', 'mock-web2api.mjs')
  return {
    type: 'mock',
    command: process.execPath,
    args: [mockScript, String(port)],
    cwd: root,
  }
}

/** Removes a stale pid file left by an earlier run (best effort). */
export function clearStalePid(stateDir = projectRoot()) {
  try {
    rmSync(resolvePidFile(stateDir), { force: true })
  } catch {
    /* ignore */
  }
}

/**
 * Reconciles the pid file with a server that is already answering: a file
 * pointing at a dead process is removed as stale, while a file pointing at
 * a live process is kept so `stop-web2api.mjs` can still stop the server
 * later (it re-verifies the process before killing).
 */
export function reconcilePidFile(stateDir = projectRoot()) {
  const pidFile = resolvePidFile(stateDir)
  if (!existsSync(pidFile)) return
  let pid = null
  try {
    const raw = readFileSync(pidFile, 'utf8').trim()
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw)
      if (Number.isInteger(data.pid) && data.pid > 0) pid = data.pid
    } else if (/^\d+$/.test(raw)) {
      pid = Number(raw)
    }
  } catch {
    pid = null
  }
  if (pid === null) {
    clearStalePid(stateDir)
    return
  }
  let alive = false
  try {
    process.kill(pid, 0)
    alive = true
  } catch {
    alive = false
  }
  if (!alive) {
    console.log(`[INFO]  Removing stale pid file (process ${pid} is not running).`)
    clearStalePid(stateDir)
  }
}

function readLogTail(logFile, maxBytes = 4000) {
  try {
    const stat = statSync(logFile)
    if (!stat.isFile() || stat.size === 0) return ''
    const start = Math.max(0, stat.size - maxBytes)
    const fd = openSync(logFile, 'r')
    const buffer = Buffer.alloc(Math.min(maxBytes, stat.size))
    readSync(fd, buffer, 0, buffer.length, start)
    closeSync(fd)
    return buffer.toString('utf8').trim()
  } catch {
    return ''
  }
}

function describeLauncher(launcher) {
  if (launcher.type === 'mock') {
    return 'built-in MOCK server (sample answers only - not real Gemini)'
  }
  if (launcher.type === 'python') return 'legacy Python server'
  return 'Gemini Web2API server'
}

/**
 * Ensures Gemini Web2API is present, installed, and running.
 *
 * In background mode (default) the server is started as a detached daemon:
 * this function waits until it answers (or the timeout expires) and then
 * RETURNS, so launchers can continue starting GlassGem.
 */
export async function ensureWeb2Api({
  port = resolvePort(),
  background = true,
  timeoutSec = 20,
  clone = true,
  download = true,
  forceMock = false,
  installOnly = false,
  stateDir = projectRoot(),
} = {}) {
  port = validPort(port) ?? resolvePort()
  const checkUrl = `http://127.0.0.1:${port}/v1/models`

  if (process.env[SKIP_ENV] === '1') {
    const running = await isServerResponding(checkUrl, 1000)
    console.log(
      running
        ? `[OK]    Gemini Web2API is already running at http://127.0.0.1:${port} (auto-start skipped)`
        : `[INFO]  Web2API auto-start is disabled (${SKIP_ENV}=1). Start your own server on port ${port}.`,
    )
    return { running, alreadyRunning: running, skipped: true }
  }

  // 1. Check if already responding
  if (await isServerResponding(checkUrl, 1000)) {
    console.log(`[OK]    Gemini Web2API is already running at http://127.0.0.1:${port}`)
    // The daemon persists across GlassGem restarts by design; keep a live
    // pid file so it stays stoppable, drop a stale one.
    reconcilePidFile(stateDir)
    return { running: true, alreadyRunning: true }
  }

  // 2. Ensure checkout directory (the mock server needs none).
  const root = projectRoot()
  const defaultTarget = path.join(root, EXTERNAL_DIR_NAME)
  let web2ApiDir = forceMock ? null : findWeb2ApiDir(root)
  if (web2ApiDir === vendoredWeb2ApiDir(root)) {
    console.log(`[OK]    Using the bundled Web2API sources at ${VENDORED_DIR_NAME}/`)
  }
  if (!forceMock && !web2ApiDir) {
    // Honor an explicit WEB2API_DIR as the checkout target when it does not
    // exist yet; an existing-but-invalid folder is left alone and the
    // default target next to the project is used instead.
    const explicitDir = (process.env.WEB2API_DIR || '').trim()
    const checkoutTarget = explicitDir && !existsSync(explicitDir) ? explicitDir : defaultTarget
    if (ensureWeb2ApiCheckout(checkoutTarget, { clone })) {
      web2ApiDir = checkoutTarget
    } else {
      web2ApiDir = findWeb2ApiDir(root)
    }
  }

  // 3. Make sure a usable binary exists: existing > Go build > prebuilt
  //    download. The download also covers machines without git/Go (typical
  //    Windows desktops) by creating the target folder itself. It is
  //    attempted at most once per run.
  const allowDownload = download && process.env.WEB2API_NO_DOWNLOAD !== '1' && !forceMock
  let downloadTried = false
  const tryDownloadOnce = async (dir) => {
    if (!allowDownload || !dir || downloadTried) return null
    downloadTried = true
    const downloaded = await ensurePrebuiltBinary(dir)
    if (downloaded) ensureWeb2ApiConfig(dir, port)
    return downloaded
  }
  if (!forceMock && web2ApiDir && !existsSync(path.join(web2ApiDir, web2apiBinaryName())) && !hasGo()) {
    await tryDownloadOnce(web2ApiDir)
  }
  if (!forceMock && !web2ApiDir && allowDownload) {
    // Honor an explicit WEB2API_DIR as the download target; otherwise use
    // the folder next to this project.
    const explicitDir = (process.env.WEB2API_DIR || '').trim()
    const downloadTarget = explicitDir || defaultTarget
    try {
      mkdirSync(downloadTarget, { recursive: true })
    } catch {}
    const downloaded = await tryDownloadOnce(downloadTarget)
    if (downloaded) {
      web2ApiDir = downloadTarget
    } else if (!explicitDir) {
      // Do not leave an empty folder behind on failure.
      try {
        rmSync(downloadTarget, { recursive: true, force: true })
      } catch {}
    }
  }

  // 4. Resolve launcher (binary > Go build > Python > mock)
  let launcher = forceMock
    ? { type: 'mock', command: process.execPath, args: [path.join(root, 'scripts', 'mock-web2api.mjs'), String(port)], cwd: root }
    : resolveLauncher(web2ApiDir, port)

  // A failed Go build still deserves the prebuilt fallback (once).
  if (!forceMock && launcher.type !== 'binary' && web2ApiDir) {
    const downloaded = await tryDownloadOnce(web2ApiDir)
    if (downloaded) launcher = resolveLauncher(web2ApiDir, port)
  }

  if (web2ApiDir) ensureWeb2ApiConfig(web2ApiDir, port)

  if (installOnly) {
    if (launcher.type === 'binary') {
      console.log(`[OK]    Web2API binary ready: ${launcher.command}`)
      return { running: false, alreadyRunning: false, installOnly: true, launcher }
    }
    console.log(`[INFO]  No real Web2API binary available (would use: ${launcher.type}).`)
    return { running: false, alreadyRunning: false, installOnly: true, launcher }
  }

  if (launcher.type === 'mock' && !forceMock) {
    console.warn('[WARN]  No real Gemini Web2API available (no binary, Go toolchain, or download).')
    console.warn('[WARN]  Starting the built-in MOCK server instead: it returns SAMPLE answers only,')
    console.warn('[WARN]  not real Gemini responses. Install Go or allow the prebuilt download for real AI.')
  }
  console.log(`[INFO]  Starting ${describeLauncher(launcher)} on port ${port}...`)

  const logFile = resolveLogFile(stateDir)
  const pidFile = resolvePidFile(stateDir)

  if (!background) {
    return runForeground(launcher, { port, checkUrl, timeoutSec })
  }

  // Detached daemon: stdout/stderr go to the log file, the parent unrefs the
  // child so THIS process can exit and the launcher continues to GlassGem.
  let logFd = null
  try {
    logFd = openSync(logFile, 'a')
  } catch (err) {
    console.warn(`[WARN]  Could not open log file ${logFile}: ${err.message}`)
  }

  let child
  try {
    child = spawn(launcher.command, launcher.args, {
      cwd: launcher.cwd,
      stdio: logFd === null ? 'ignore' : ['ignore', logFd, logFd],
      detached: true,
      windowsHide: true,
      env: { ...process.env, PORT: String(port) },
    })
  } catch (err) {
    if (logFd !== null) {
      try {
        closeSync(logFd)
      } catch {}
    }
    console.error(`[ERROR] Failed to start ${describeLauncher(launcher)}: ${err.message}`)
    return { running: false, alreadyRunning: false, launcher }
  } finally {
    // The child holds its own copy of the fd; the parent copy can close.
    if (logFd !== null) {
      try {
        closeSync(logFd)
      } catch {}
    }
  }

  let spawnError = null
  let childExit = null
  child.on('error', (err) => {
    spawnError = err
  })
  child.on('exit', (code, signal) => {
    childExit = { code, signal }
  })
  // Critical: without unref() the parent would stay alive until the server
  // exits, hanging every launcher that calls this script.
  child.unref()

  if (child.pid) {
    try {
      writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port, started: Date.now(), type: launcher.type }))
    } catch {}
  }

  // Wait for the server to become responsive (with early-exit detection).
  const start = Date.now()
  const maxWaitMs = Math.max(1, timeoutSec) * 1000
  while (Date.now() - start < maxWaitMs) {
    if (await isServerResponding(checkUrl, 500)) {
      console.log(`[OK]    Gemini Web2API is online at http://127.0.0.1:${port}`)
      if (launcher.type === 'mock') {
        console.log('[INFO]  (mock mode: answers are samples; start the real server for Gemini.)')
      }
      return { running: true, alreadyRunning: false, launcher, pid: child.pid ?? null }
    }
    if (spawnError) {
      console.error(`[ERROR] Failed to spawn ${describeLauncher(launcher)}: ${spawnError.message}`)
      clearStalePid(stateDir)
      return { running: false, alreadyRunning: false, launcher }
    }
    if (childExit) {
      console.error(
        `[ERROR] ${describeLauncher(launcher)} exited immediately (code ${childExit.code ?? 'unknown'}${childExit.signal ? `, signal ${childExit.signal}` : ''}).`,
      )
      const tail = readLogTail(logFile)
      if (tail) {
        console.error('--- server log ---')
        console.error(tail)
        console.error('------------------')
      }
      console.error(`Full log: ${logFile}`)
      if (/address already in use|EADDRINUSE|bind/i.test(tail)) {
        console.error(`Port ${port} is already in use by another program. Stop it (or run: node scripts/stop-web2api.mjs) and try again.`)
      }
      clearStalePid(stateDir)
      return { running: false, alreadyRunning: false, launcher }
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  console.warn(`[WARN]  Gemini Web2API did not respond on port ${port} after ${timeoutSec}s.`)
  console.warn(`[WARN]  The server process was started - check its log at ${logFile}.`)
  console.warn('[WARN]  GlassGem will start anyway and reconnect automatically once Web2API answers.')
  return { running: false, alreadyRunning: false, launcher, pid: child.pid ?? null }
}

/** Foreground mode: inherit stdio and stay alive until the server exits. */
async function runForeground(launcher, { port, checkUrl, timeoutSec }) {
  console.log('[INFO]  Foreground mode: this process stays alive until the server stops (Ctrl+C to stop).')
  const child = spawn(launcher.command, launcher.args, {
    cwd: launcher.cwd,
    stdio: 'inherit',
    detached: false,
    env: { ...process.env, PORT: String(port) },
  })

  let childExit = null
  child.on('error', (err) => {
    console.error(`[ERROR] Failed to spawn ${describeLauncher(launcher)}: ${err.message}`)
  })
  child.on('exit', (code, signal) => {
    childExit = { code, signal }
  })

  const forward = (signal) => {
    try {
      child.kill(signal)
    } catch {}
  }
  process.on('SIGINT', forward)
  process.on('SIGTERM', forward)

  const start = Date.now()
  const maxWaitMs = Math.max(1, timeoutSec) * 1000
  let online = false
  while (Date.now() - start < maxWaitMs) {
    if (childExit) break
    if (await isServerResponding(checkUrl, 500)) {
      online = true
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  if (!online) {
    if (childExit) {
      console.error(`[ERROR] ${describeLauncher(launcher)} exited before becoming ready.`)
    } else {
      console.warn(`[WARN]  Server did not respond within ${timeoutSec}s - still waiting (Ctrl+C to stop)...`)
    }
  } else {
    console.log(`[OK]    Gemini Web2API is online at http://127.0.0.1:${port}`)
  }

  const exitCode = await new Promise((resolve) => {
    if (childExit) resolve(childExit.code ?? 1)
    else child.on('exit', (code) => resolve(code ?? 0))
  })
  return { running: online, alreadyRunning: false, launcher, exitCode }
}

function printHelp() {
  console.log(`
GlassGem - Gemini Web2API auto-installer & runner

Usage:  node scripts/ensure-web2api.mjs [port] [options]

  port                 port to run/check (default 8081)

Options:
  --port N             same as the positional port argument
  --foreground         run in the foreground (blocks until stopped);
                       default is a detached background daemon
  --timeout SEC        wait up to SEC seconds for the server (default 20)
  --no-clone           do not git-clone a missing checkout
  --no-download        do not download a prebuilt release binary
  --mock               start the built-in mock server (sample answers only)
  --install-only       prepare checkout/config/binary, but do not start
  -h, --help           show this help

Environment:
  GLASSGEM_WEB2API_URL   origin whose port is used when no port is given
  GLASSGEM_WEB2API_PORT  explicit port (wins over the URL port)
  WEB2API_DIR            explicit checkout directory
  WEB2API_RELEASE_TAG    pin a release tag instead of "latest"
  WEB2API_RELEASE_BASE   mirror base URL for release downloads
  GLASSGEM_SKIP_AUTO_WEB2API=1  only check status, never start anything
`)
}

function parseCliArgs(argv) {
  const opts = {
    port: null,
    background: true,
    timeoutSec: 20,
    clone: true,
    download: true,
    forceMock: false,
    installOnly: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help' || arg === '/?') {
      printHelp()
      process.exit(0)
    } else if (arg === '--foreground' || arg === '--fg') {
      opts.background = false
    } else if (arg === '--background' || arg === '--daemon') {
      opts.background = true
    } else if (arg === '--timeout' && argv[i + 1]) {
      opts.timeoutSec = Number(argv[++i]) || 20
    } else if (arg.startsWith('--timeout=')) {
      opts.timeoutSec = Number(arg.split('=')[1]) || 20
    } else if (arg === '--port' && argv[i + 1]) {
      opts.port = Number(argv[++i])
    } else if (arg.startsWith('--port=')) {
      opts.port = Number(arg.split('=')[1])
    } else if (arg === '--no-clone') {
      opts.clone = false
    } else if (arg === '--no-download') {
      opts.download = false
    } else if (arg === '--mock') {
      opts.forceMock = true
    } else if (arg === '--install-only') {
      opts.installOnly = true
    } else if (/^\d+$/.test(arg) && opts.port === null) {
      opts.port = Number(arg)
    } else {
      console.warn(`[WARN]  Ignoring unknown argument: ${arg}`)
    }
  }
  return opts
}

// Execute directly if run as a script. Defaults to a detached background
// daemon that RETURNS, so launchers continue on to GlassGem.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opts = parseCliArgs(process.argv.slice(2))
  ensureWeb2Api({ ...opts, port: opts.port ?? resolvePort() })
    .then((res) => {
      if (res.installOnly) {
        process.exitCode = res.launcher?.type === 'binary' ? 0 : 1
      } else if (!opts.background) {
        process.exitCode = res.exitCode ?? (res.running ? 0 : 1)
      } else if (!res.running && !res.alreadyRunning && !res.skipped) {
        // The launchers treat this as informational and start GlassGem
        // anyway, but a non-zero code signals automation.
        process.exitCode = 1
      }
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
