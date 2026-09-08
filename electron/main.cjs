'use strict'

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')

const APP_NAME = 'GlassGem'
const PROXY_PREFIX = '/web2api'
const DEFAULT_TARGET = process.env.GLASSGEM_WEB2API_URL || 'http://127.0.0.1:8081'
// Keep the production origin stable so IndexedDB and localStorage survive restarts.
const DESKTOP_PORT = readPort(process.env.GLASSGEM_DESKTOP_PORT || '17384')
const DEV_SERVER_URL = app.isPackaged ? undefined : process.env.GLASSGEM_DEV_SERVER_URL

let mainWindow = null
let localServer = null
let localServerUrl = null
let trustedOrigin = null
let nativeHandlersRegistered = false

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(startApplication).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(`${APP_NAME} could not start`, message)
    app.quit()
  })
}

function readPort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 17384
}

function applicationRoot() {
  return path.resolve(__dirname, '..')
}

function distRoot() {
  return path.join(applicationRoot(), 'dist')
}

function assetPath(relativePath) {
  const candidates = [
    path.join(distRoot(), relativePath),
    path.join(applicationRoot(), 'public', relativePath),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

async function startApplication() {
  app.setAppUserModelId('com.ketandutt.glassgem')
  app.setName(APP_NAME)
  installApplicationMenu()
  registerNativeHandlers()

  let startUrl
  if (DEV_SERVER_URL) {
    const devUrl = new URL(DEV_SERVER_URL)
    if (devUrl.protocol !== 'http:' || !isLocalHost(devUrl.hostname)) {
      throw new Error('GLASSGEM_DEV_SERVER_URL must point to a local HTTP development server.')
    }
    startUrl = devUrl.toString()
    trustedOrigin = devUrl.origin
  } else {
    const index = path.join(distRoot(), 'index.html')
    if (!fs.existsSync(index)) {
      throw new Error('The production web bundle is missing. Run "npm run desktop:build" or "npm run build" first.')
    }
    localServer = await startLocalServer()
    localServerUrl = `http://127.0.0.1:${DESKTOP_PORT}`
    trustedOrigin = localServerUrl
    startUrl = `${localServerUrl}/`
  }

  createMainWindow(startUrl)
}

function createMainWindow(startUrl) {
  const icon = assetPath(path.join('icons', 'icon-512.png'))
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0d14',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return
    event.preventDefault()
    openExternalUrl(url)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadURL(startUrl).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(`${APP_NAME} could not load`, message)
  })
}

function isTrustedUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin === trustedOrigin
  } catch {
    return false
  }
}

function openExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      void shell.openExternal(url.toString())
    }
  } catch {
    // Ignore malformed links rather than handing arbitrary values to the OS.
  }
}

function registerNativeHandlers() {
  if (nativeHandlersRegistered) return
  nativeHandlersRegistered = true
  ipcMain.handle('glassgem:open-external', (_event, rawUrl) => {
    if (typeof rawUrl !== 'string') return false
    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
      void shell.openExternal(url.toString())
      return true
    } catch {
      return false
    }
  })
}

function installApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'close' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', visible: Boolean(DEV_SERVER_URL) },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: APP_NAME,
              detail: `A local Gemini workspace for Windows.\nVersion ${app.getVersion()}`,
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function isLocalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '0.0.0.0' || host === 'host.docker.internal') return true

  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!match) return false
  const first = Number(match[1])
  const second = Number(match[2])
  return first === 127 || first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function resolveProxyTarget(request) {
  const raw = request.headers['x-glassgem-target']
  const header = Array.isArray(raw) ? raw[0] : raw
  const candidate = header || DEFAULT_TARGET

  try {
    const target = new URL(candidate)
    if (
      (target.protocol === 'http:' || target.protocol === 'https:') &&
      !target.username &&
      !target.password &&
      isLocalHost(target.hostname)
    ) {
      return target
    }
  } catch {
    // An invalid target is treated like any other rejected target.
  }
  return null
}

function sendJson(response, status, body) {
  if (response.destroyed) return
  if (response.headersSent) {
    response.end()
    return
  }
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function proxyRequest(request, response) {
  const target = resolveProxyTarget(request)
  if (!target) {
    sendJson(response, 400, {
      error: {
        message: 'GlassGem only forwards to local or private-network Web2API servers.',
        type: 'glassgem_proxy_error',
      },
    })
    return true
  }

  const pathAndQuery = request.url.slice(PROXY_PREFIX.length) || '/'
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'x-glassgem-target',
  ])
  const headers = {}
  for (const [key, value] of Object.entries(request.headers)) {
    if (value == null || hopByHop.has(key.toLowerCase())) continue
    headers[key] = value
  }
  headers.host = target.host

  const client = target.protocol === 'https:' ? https : http
  let responseFinished = false
  const upstream = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: pathAndQuery,
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      const outputHeaders = {}
      for (const [key, value] of Object.entries(upstreamResponse.headers)) {
        if (value == null) continue
        const lower = key.toLowerCase()
        if (lower === 'transfer-encoding' || lower === 'connection' || lower.startsWith('access-control-')) continue
        outputHeaders[key] = value
      }
      outputHeaders['cache-control'] = 'no-cache'
      outputHeaders['x-accel-buffering'] = 'no'
      response.writeHead(upstreamResponse.statusCode || 502, outputHeaders)
      upstreamResponse.pipe(response)
      upstreamResponse.on('end', () => {
        responseFinished = true
      })
      upstreamResponse.on('error', () => {
        responseFinished = true
        if (!response.destroyed) response.end()
      })
    },
  )

  upstream.on('error', (error) => {
    responseFinished = true
    const reason = error.code === 'ECONNREFUSED' ? `nothing is listening at ${target.origin}` : error.message
    sendJson(response, 502, {
      error: {
        message: `GlassGem could not reach the Web2API server (${reason}).`,
        type: 'glassgem_proxy_error',
        code: error.code,
      },
    })
  })

  const abort = () => {
    if (!responseFinished) upstream.destroy()
  }
  response.on('close', abort)
  request.on('aborted', abort)
  request.pipe(upstream)
  return true
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  return types[extension] || 'application/octet-stream'
}

function safeStaticPath(requestUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://glassgem.local').pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const root = path.resolve(distRoot())
  const candidate = path.resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null
  return { candidate, pathname }
}

async function serveStatic(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  const resolved = safeStaticPath(request.url)
  if (!resolved) {
    sendJson(response, 400, { error: 'Invalid path' })
    return
  }

  let filePath = resolved.candidate
  let stats
  try {
    stats = await fs.promises.stat(filePath)
    if (!stats.isFile()) throw new Error('not a file')
  } catch {
    // Let client-side routes resolve to the app shell, but do not hide missing assets.
    if (path.posix.extname(resolved.pathname)) {
      sendJson(response, 404, { error: 'Not found' })
      return
    }
    filePath = path.join(distRoot(), 'index.html')
    try {
      stats = await fs.promises.stat(filePath)
    } catch {
      sendJson(response, 404, { error: 'App bundle not found' })
      return
    }
  }

  const isAppShell = path.basename(filePath) === 'index.html'
  response.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Content-Length': stats.size,
    'Cache-Control': isAppShell ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  fs.createReadStream(filePath).pipe(response)
}

async function startLocalServer() {
  const server = http.createServer((request, response) => {
    if (request.url && request.url.startsWith(PROXY_PREFIX)) {
      proxyRequest(request, response)
      return
    }
    void serveStatic(request, response)
  })

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening)
      reject(new Error(
        error.code === 'EADDRINUSE'
          ? `Port ${DESKTOP_PORT} is already in use. Close the other GlassGem instance or set GLASSGEM_DESKTOP_PORT to another local port.`
          : `Could not start the local GlassGem server: ${error.message}`,
      ))
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(DESKTOP_PORT, '127.0.0.1')
  })

  return server
}

function closeLocalServer() {
  if (!localServer) return
  localServer.close()
  localServer = null
  localServerUrl = null
}

app.on('before-quit', closeLocalServer)
app.on('window-all-closed', () => {
  // GlassGem is a Windows desktop app; closing the window exits the process.
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (mainWindow !== null || process.platform !== 'darwin') return
  if (localServerUrl) {
    createMainWindow(`${localServerUrl}/`)
  } else {
    void startApplication()
  }
})
