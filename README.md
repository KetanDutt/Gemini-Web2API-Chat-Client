<p align="center">
  <img src="public/icons/icon-192.png" width="96" alt="GlassGem icon" />
</p>

<h1 align="center">GlassGem</h1>
<p align="center"><em>Your personal Gemini workspace.</em></p>

GlassGem is a polished, local-only chat client for the **Gemini Web2API** OpenAI-compatible server. It runs entirely in your browser on your own machine, stores every conversation in IndexedDB, and never talks to any cloud service — only to the Web2API server you point it at.

Design language: Apple-inspired *Liquid Glass* — translucent layered surfaces, soft blur, subtle ambient lighting, calm typography.

---

## Contents

1. [Requirements](#1-requirements)
2. [Installation](#2-installation)
3. [Starting Web2API](#3-starting-web2api)
4. [Starting GlassGem](#4-starting-glassgem)
5. [API configuration](#5-api-configuration)
6. [Troubleshooting](#6-troubleshooting)
7. [CORS troubleshooting](#7-cors-troubleshooting)
8. [Model configuration](#8-model-configuration)
9. [Data storage](#9-data-storage)
10. [Export / import](#10-export--import)
11. [Security](#11-security)
12. [Development](#12-development)
13. [Production build](#13-production-build)
14. [Features](#14-features)
15. [Keyboard shortcuts](#15-keyboard-shortcuts)
16. [Known limitations](#16-known-limitations)

---

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| **Windows 11** (or macOS / Linux) | The browser client runs anywhere Node.js works; the native desktop build targets Windows 10/11. |
| **Node.js 20 or newer** | Needed to develop or build GlassGem. The finished Windows installer includes its own runtime. Download the LTS installer from <https://nodejs.org>. |
| **Gemini Web2API** | Running locally, e.g. at `http://127.0.0.1:8081`. GlassGem does not bundle the API server. |
| A modern browser | Needed for the web/PWA client. A browser is not needed after installing the native Windows app. |

## 2. Installation

Open **PowerShell** or **Command Prompt** in the project folder and run:

```bat
npm install
```

This downloads the dependencies into `node_modules` (only needed once, or after updating).

## 3. Starting Web2API

GlassGem does not include Web2API — start it the way you normally do (for example `python main.py` or its own launcher). When it is running you should be able to open this in a browser:

```
http://127.0.0.1:8081/v1/models
```

(…or get a `401` if your key is required — that still proves the server is alive.)

Defaults GlassGem expects:

| Setting | Default |
| --- | --- |
| Base URL | `http://127.0.0.1:8081/v1` |
| API key | `sk-gemini` |
| Model | `gemini-3.6-flash` |

> Don't have Web2API handy and just want to see the UI? Run `npm run mock` in a second terminal — it starts a tiny mock server on port 8081 that mimics the API (including streaming). Never use it for real work.

## 4. Starting GlassGem

### Easiest (Windows)

Double-click **`run.bat`**. It checks Node.js (offers to install it via winget if missing), installs or refreshes dependencies when needed, warns if Web2API isn't reachable, starts the dev server and opens <http://localhost:5173>. This is the **browser/PWA version** — it needs only the npm packages and works even on networks that block `github.com` (no Electron download required).

| Command | Purpose |
| --- | --- |
| `run.bat` | Start GlassGem in the browser (web version) |
| `run.bat clean` | Delete `node_modules`, reinstall, then start |
| `run.bat mock` | Also start the mock Web2API server (sample answers only) |
| `run-desktop.bat` | Start the native Windows app (Electron) with hot reload |
| `run-desktop.bat clean` | Reinstall dependencies (including the Electron runtime), then start |
| `build.bat` | Type-check + production web build into `dist/` |
| `build.bat preview` | Build, then serve it on <http://localhost:4173> |
| `build.bat clean` | Reinstall dependencies before building |
| `build.bat desktop` | Build the native Windows installer and portable app |

### Linux / macOS

Run **`./run.sh`** from your terminal. It verifies the environment, handles dependencies, checks Web2API, and starts the dev server:

| Command | Purpose |
| --- | --- |
| `./run.sh` | Start GlassGem in the browser |
| `./run.sh clean` | Reinstall dependencies, then start |
| `./run.sh mock` | Start mock Web2API server (port 8081) and GlassGem |
| `./build.sh` | Type-check + production build into `dist/` |
| `./build.sh preview` | Build, then start local preview server |

Every script stops with a plain-language explanation and suggested fix when something goes wrong (missing/old Node.js, failed `npm install`, type errors, port conflicts…). Add `/?` or `--help` to see the options.

### Linux Services (Auto-Start on System Restart)

To register both **Gemini Web2API** and **GlassGem** as system services that start automatically when your Linux machine boots or restarts:

```bash
sudo ./setup-linux.sh
```

This setup script:
- Verifies system requirements (systemd, Node.js 20+, npm).
- Locates or clones `gemini-web2api` and builds the Go binary or configures graceful mock/Python fallback.
- Detects and clears any existing port conflicts on ports `5173` and `8081`.
- Creates `/etc/systemd/system/gemini-web2api.service` and `/etc/systemd/system/glassgem.service`.
- Enables both services so they start automatically on boot/restart (`multi-user.target`).
- Verifies health via HTTP checks and automatically diagnoses logs if any service fails.

Service management:
```bash
sudo ./setup-linux.sh --status     # View health and running status
sudo ./setup-linux.sh --restart    # Restart both services
sudo ./setup-linux.sh --logs       # View live logs
sudo ./setup-linux.sh --stop       # Stop services
sudo ./setup-linux.sh --uninstall  # Remove services from systemd
```

### Manual

```bat
npm run dev
```

Then open <http://localhost:5173>.

On first launch you'll see **Connect to Gemini Web2API**. Click **Test Connection** → you should see **● Connected** → click **Start Chatting**.

### Native Windows desktop app

GlassGem can also run as a real Windows desktop app, packaged with Electron. The installed app has a native Windows window, application menu, isolated renderer, stable local storage, and an embedded loopback proxy. It does **not** require Node.js or a browser after installation. The Gemini Web2API server remains a separate local process.

The easiest way is the dedicated launcher:

```bat
run-desktop.bat
```

It checks dependencies (downloading the Electron runtime on first use) and starts Vite + Electron together with hot reload — the same as `npm run desktop:dev`, which also works on macOS/Linux:

```bat
npm install
npm run desktop:dev
```

To create distributable Windows artifacts:

```bat
desktop.bat build
```

The output is written to `release/` and includes an NSIS installer for x64 and arm64 Windows plus a portable x64 executable. Other useful commands are:

| Command | Purpose |
| --- | --- |
| `desktop.bat dev` | Run the native shell against the Vite development server |
| `desktop.bat build` | Build the web bundle and Windows installer artifacts |
| `desktop.bat portable` | Build only the portable x64 executable |
| `desktop.bat pack` | Build an unpacked Windows app directory for testing |
| `npm run desktop:build` | Equivalent scripted Windows build |
| `npm run desktop:build:portable` | Equivalent portable build |

The desktop shell serves the production bundle on a fixed loopback origin (`127.0.0.1:17384`) so conversations, prompts, settings, and the IndexedDB database persist across restarts. If that port is occupied, close the other GlassGem instance or set `GLASSGEM_DESKTOP_PORT` before launching. Its proxy applies the same local/private-network restriction as the Vite proxy; public Internet targets are rejected.

## 5. API configuration

Open **Settings → API** (gear icon, or `Ctrl+Shift+S`).

| Field | Description |
| --- | --- |
| **API Base URL** | Where Web2API listens. Must end with `/v1`. |
| **API Key** | Sent as `Authorization: Bearer <key>`. Default `sk-gemini`. |
| **Default model** | Used for new conversations. Pick from the discovered list or type any model ID. |
| **Use local proxy** | On by default. Routes requests through the GlassGem dev server to avoid CORS problems (see §7). |
| **Test Connection** | Calls `GET /v1/models` (falls back to a tiny chat completion if the server has no `/models`). Shows **● Connected** with latency, or **● Connection failed** with a plain-language explanation. |

The connection status pill in the top bar is always visible. Click it for the API URL, current model, last successful request and latency. GlassGem re-tests automatically on startup, whenever the API settings change, and every 20 s while offline.

### Detected capabilities

GlassGem never assumes an OpenAI feature exists. **Settings → API → Detected capabilities** shows what the connected server has demonstrated:

- Chat completions · Model listing · Streaming · System messages · Image input · Usage information · Sampling parameters

Each starts as *Unknown*, becomes *Supported* after a successful observed request, or *Unsupported* after the server rejects it — at which point the corresponding UI is disabled or the feature is silently omitted from requests.

## 6. Troubleshooting

| Symptom | What it means | Fix |
| --- | --- | --- |
| **Unable to connect to Gemini Web2API** / *Web2API offline* | Nothing is listening at the Base URL. | Start Web2API. Check its console window. Confirm the port (8081 by default). |
| **API key rejected (401)** | The key doesn't match the server. | Settings → API → enter the key configured in Web2API (default `sk-gemini`). |
| **Access denied (403)** | The server refused the request. | Gemini session/cookies on the Web2API side may have expired — re-login there. |
| **Endpoint or model not found (404)** | Wrong Base URL (missing `/v1`) or unknown model ID. | Fix the URL; pick a model from the list. |
| **Rate limited (429)** | Gemini is throttling. | Wait a moment; retry. |
| **Web2API server error (500/502/503)** | Web2API crashed handling the request. | Read the stack trace in the Web2API window. |
| **Invalid response** | The URL points at an HTML page instead of the API. | Make sure the URL ends with `/v1`. |
| Response stops midway | You pressed **Stop**, or the connection dropped. | Click **Regenerate**. |
| Everything looks stuck | Browser tab lost IndexedDB access (private mode etc.). | Use a normal window. |
| `run-desktop.bat` says **Electron runtime is missing** | Only the native app needs `electron.exe`; it is downloaded separately from GitHub releases, and `npm install` alone reports *up to date* without retrying it. The web version (`run.bat`) works without it. | Run `run-desktop.bat` again — it retries the download in several ways automatically (npm's installer, then a direct, checksum-verified zip download, falling back to the npmmirror.com mirror if GitHub is unreachable). If GitHub is blocked: `set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/` in the same window (or make it permanent with `npm config set electron_mirror …`). Behind a proxy: `set HTTPS_PROXY=http://proxy:port` first — npm's own `https-proxy` config is picked up automatically but does not cover the Electron download by itself. If the download succeeds but `electron.exe` keeps vanishing, an antivirus is quarantining it — allow the project folder, then `run-desktop.bat clean`. Or just use the web version: `run.bat`. |

Every error in the chat has **Retry** and **Open Settings** buttons. Turn on **Settings → General → Debug panel** to see recent requests, HTTP status codes, durations and token usage (never the API key).

## 7. CORS troubleshooting

Browsers block requests from `http://localhost:5173` to `http://127.0.0.1:8081` unless the server sends CORS headers. GlassGem sidesteps this with a **local proxy**:

```
Browser  →  GlassGem (localhost:5173)/web2api/…  →  http://127.0.0.1:8081/v1/…
```

- The proxy is part of the Vite dev/preview server (`scripts/web2api-proxy.ts`). It **only** forwards to loopback / private-network addresses (`127.x`, `localhost`, `10.x`, `172.16–31.x`, `192.168.x`). It can't be used to reach the public internet.
- The Base URL you enter in Settings is sent to the proxy in a header, so you can point GlassGem at a Web2API on another machine in your LAN.
- Streaming (SSE) passes through untouched; pressing **Stop** aborts the upstream request too.

If you'd rather call Web2API directly, turn off **Use local proxy** — this only works if Web2API sends `Access-Control-Allow-Origin` headers (some builds do). If you then see *Unable to connect* even though the server is running, CORS is the reason — switch the proxy back on.

## 8. Model configuration

- If the server supports `GET /v1/models`, the model dropdown (chat header and composer) is populated automatically. Use the ↻ button to refresh.
- If not, type any model ID in the *Custom model ID* box at the bottom of the dropdown. Custom IDs are remembered.
- Each conversation keeps its own model; changing the model in a chat only affects that chat. The default for new chats lives in Settings → API.
- Model IDs are displayed prettified ("Gemini 3.6 Flash") with the raw ID underneath.

## 9. Data storage

Everything is stored **in your browser profile on this machine**:

| What | Where |
| --- | --- |
| Conversations, messages, prompt library | IndexedDB database `glassgem` (via Dexie) |
| Settings, API key, detected capabilities | `localStorage` (`glassgem.*` keys) |

Nothing is uploaded anywhere. Clearing site data in the browser erases it — export a backup first (§10). **Settings → Privacy** shows usage, and offers *Clear API credentials* and *Delete all conversations*. **Settings → Data** offers a full reset.

## 10. Export / import

**Per conversation** (sidebar ⋯ menu or chat header ⋯ → Export):

- **Markdown** (`.md`) — `# Title`, `## User` / `## Gemini` sections, plus model, date and token usage at the bottom.
- **JSON** — the GlassGem interchange format (re-importable).
- **Plain text** (`.txt`).

**Everything** (Settings → Data): *Export all data* writes `glassgem-backup-YYYY-MM-DD.json` containing all conversations and prompts.

**Import** (Settings → Data → Import) accepts single-conversation or full-backup GlassGem JSON. Files are validated field by field; malformed files produce a clear error toast and never crash the app. Imported conversations get new IDs, so importing twice creates duplicates rather than overwriting. Image attachments round-trip through the JSON format (Markdown / text exports show `[image: name]` markers instead).

## 11. Security

- GlassGem is a **local frontend**. Gemini authentication (Google cookies) happens exclusively on the Web2API server; GlassGem never sees, stores, or logs those cookies.
- The API key is stored in `localStorage` so it survives reloads. Anyone with access to your browser profile could read it — that's the trade-off, and it's spelled out in Settings → Privacy. Use *Clear API credentials* on shared machines.
- The key is only ever sent to the Base URL you configure. It is never logged, never shown in the debug panel, and never included in exports.
- The dev server binds to all interfaces so you can open GlassGem from a phone on your LAN, but the proxy refuses to forward anywhere except private/loopback addresses.
- Default API host stays `127.0.0.1`. GlassGem never exposes Web2API publicly.

## 12. Development

Deeper documentation lives in [`docs/`](./docs): [architecture](./docs/ARCHITECTURE.md) · [development guide](./docs/DEVELOPMENT.md) · [security & privacy](./docs/SECURITY.md).

```
docs/             architecture, development guide, security notes
src/
  components/
    background/   ambient animated background
    chat/         header, message list, message item, markdown, code blocks, composer, model selector, welcome
    dialogs/      settings, search (Ctrl+K), shortcuts, prompt library, onboarding, debug, delete confirm
    layout/       top bar, logo, connection status, PWA prompt
    sidebar/      conversation list + items
    ui/           glass primitives (dialog, menu, switch, segmented, tooltip, fields, empty state…)
  hooks/          theme, media queries, shortcuts, connection monitor, search, toast
  layouts/        AppLayout (sidebar + chat + mobile drawer)
  lib/            utils (title generation, formatting, clipboard, download…)
  services/
    geminiWebApi.ts   API client: sendMessage / streamMessage / getModels / testConnection / abortRequest
    capabilities.ts   capability model + decision helpers
    errors.ts         HTTP/network → human-friendly ApiError
    db.ts             Dexie schema
    exportImport.ts   serializers + strict import validation
  stores/         zustand stores: conversations, settings, connection, prompts, ui, streaming
  types/          shared TypeScript types
electron/
  main.cjs        native Windows window, menu, static server, and local API proxy
  preload.cjs     minimal isolated renderer bridge
scripts/
  web2api-proxy.ts  local CORS proxy (Vite plugin)
  desktop-dev.mjs   cross-platform Vite + Electron development launcher
  mock-web2api.mjs  mock server for UI development
  check-env.bat     shared Windows environment/dependency check used by the launchers
resources/
  icon.ico        Windows installer and executable icon
run.bat           starts the web (browser/PWA) version - no Electron needed
run-desktop.bat   starts the native Windows app (Electron) with hot reload
desktop.bat       Windows desktop dev/build/portable commands
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on <http://localhost:5173> |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (Node's built-in runner — zero extra dependencies) |
| `npm run mock` | Mock Web2API on port 8081 |
| `npm run build` | Production web build into `dist/` |
| `npm run preview` | Serve `dist/` on <http://localhost:4173> (proxy included) |
| `npm run desktop:dev` | Run the native Electron shell with Vite HMR |
| `npm run desktop:build` | Build Windows NSIS + portable artifacts via electron-builder |
| `npm run desktop:pack` | Build an unpacked Windows app directory |

Stack: React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Radix UI primitives · Zustand · Dexie · react-markdown + remark-gfm + highlight.js · Motion · Sonner · Lucide.

Performance notes: streamed tokens are written to a dedicated store that only re-renders the single message being streamed (rAF-throttled); message components are memoised; search is debounced and scans IndexedDB in the background; the sidebar list and message list never re-render on token updates.

## 13. Production build

```bat
npm run build
npm run preview
```

or double-click **`build.bat`** (add `preview` to serve it right away). The preview server includes the same local proxy, so the API configuration is unchanged. The build is a PWA — in Edge/Chrome use *Install GlassGem* (an install banner is shown when available). The app shell works offline; requests still need the local Web2API server.

For the native Windows build, use **`desktop.bat build`**. It runs the web build first, then electron-builder packages `dist/` and the isolated Electron shell into `release/`. The default build produces signed-ready (not code-signed) NSIS installers for x64 and arm64 plus a portable x64 executable. Code signing can be added in a Windows CI environment by configuring electron-builder's standard certificate variables; unsigned artifacts will show the normal Windows SmartScreen warning until signed.

A repeatable GitHub Actions workflow is included at `.github/workflows/windows-desktop.yml`. It can be started manually or runs for version tags, and uploads every file in `release/` as a build artifact.

## 14. Features

- Gemini chat with **streaming** (automatic fallback to non-streaming if the server rejects `stream: true`)
- Multiple conversations, grouped Today / Yesterday / Previous 7 days / Older, with **pin** and **favorite**
- Instant local **search** across titles and message content, with highlighted matches (`Ctrl+K`)
- Rename (double-click or menu), delete (confirmed), clear, export per conversation
- Automatic local title from the first message (no extra API call)
- Full **Markdown** rendering: headings, lists, tables, blockquotes, links, task lists, images
- **Code blocks** with language label, syntax highlighting and Copy / *Copied ✓*
- Message actions: copy, copy as Markdown/plain text, regenerate, export, report error, delete; **edit & resend** for user messages
- **Regenerate** keeps previous answers: *Response 1 / 3* with ◀ ▶ controls
- **Follow-up suggestions** — `<ElicitationsGroup>` / `<Elicitation>` markup appended by some servers is parsed, stripped from the text, and rendered as clickable chips that send the suggested prompt
- **Stop** generation (AbortController → proxy → upstream)
- Timestamps, per-message model, **token usage** (click for prompt/completion/total), optional response time
- **Image attachments** — attach up to 4 images per message with thumbnails and drag-free picking; large images are downscaled locally before they are stored or sent (opt-in, see Known limitations)
- Per-conversation **system instructions** and optional default system prompt
- Optional `temperature` / `top_p` / `max_tokens` — off by default, auto-disabled if the server rejects them
- **Prompt library** with categories, favorites, create/edit/delete, one-click insert
- **Settings**: General (theme, density, reduced motion, debug panel) · API · Chat · Prompts · Privacy · Data · About
- System / Light / Dark themes, each designed on its own terms; `prefers-reduced-motion` respected
- Elegant error handling for 400/401/403/404/429/5xx, network, proxy, invalid JSON, timeout, abort
- Responsive: full sidebar on desktop, collapsible on tablet, slide-over drawer on mobile
- Accessible: semantic roles, ARIA labels, focus rings, keyboard navigation everywhere
- Installable **PWA**
- Native Windows desktop app with an embedded local/private-network proxy
- Debug panel with request traces

## 15. Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` | Search / command palette |
| `Ctrl+N` | New chat |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+S` | Settings |
| `Ctrl+Shift+P` | Prompt library |
| `Ctrl+/` | Focus composer |
| `Ctrl+Shift+/` | Shortcut help |
| `Enter` | Send (`Shift+Enter` = newline; `Ctrl+Enter` always sends) |
| `Esc` | Close dialog / drawer / cancel edit |

On macOS use `⌘` instead of `Ctrl`.

## 16. Known limitations

These come from the Web2API side, and GlassGem is deliberately conservative about them:

- **Image attachments** — fully implemented in the UI (picking, downscaling, previews, sending OpenAI-style `image_url` parts) but **disabled by default**: enable *Image input* in Settings → Chat once you have verified your Web2API build accepts multimodal messages. File (non-image) attachments are still out of scope — GlassGem will not fake file support.
- **System messages & sampling parameters** — sent only when enabled; if the server returns 400, GlassGem marks them unsupported and stops sending them.
- **Streaming** — attempted first; if refused, GlassGem falls back and remembers.
- **Token usage / latency** — shown only when the server reports `usage`.
- **AI-generated titles** — not implemented on purpose (titles are derived locally to avoid extra Gemini requests).
- **Model list** — depends on `GET /v1/models`; otherwise type model IDs manually.

---

## License

GlassGem is released under the [MIT License](./LICENSE).

Built as a local companion for Gemini Web2API. GlassGem is not affiliated with Google.
