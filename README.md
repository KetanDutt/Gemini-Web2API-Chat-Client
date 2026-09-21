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
| **Windows 11** (or macOS / Linux / Alpine Linux) | The web client runs anywhere Node.js works — verified on Windows 10/11 (.bat launchers), glibc Linux distros, and musl Alpine Linux (POSIX-`sh` scripts, no bash needed). The native desktop build targets Windows 10/11. |
| **Node.js 20 or newer** | Needed to develop or build GlassGem. The finished Windows installer includes its own runtime. Download the LTS installer from <https://nodejs.org>. |
| **Gemini Web2API** | **Bundled.** The backend sources ship inside this repo (`gemini-web2api-ikhsan3adi/`) and GlassGem builds/downloads and starts the binary automatically — see §3. |
| A modern browser | Needed for the web/PWA client. A browser is not needed after installing the native Windows app. |

## 2. Installation

Open **PowerShell** or **Command Prompt** in the project folder and run:

```bat
npm install
```

This downloads the dependencies into `node_modules` (only needed once, or after updating).

## 3. Starting Web2API

GlassGem **bundles the backend**: the Go sources of
[gemini-web2api](https://github.com/ikhsan3adi/gemini-web2api) (by [@ikhsan3adi](https://github.com/ikhsan3adi)) are vendored in [`gemini-web2api-ikhsan3adi/`](./gemini-web2api-ikhsan3adi) and are used automatically — you never need to clone or install anything separately. Full details live in [docs/BACKEND.md](./docs/BACKEND.md).

Whenever you start GlassGem (via `./run.sh`, `run.bat`, `run-desktop.bat`, or `npm run dev`), it automatically checks if Gemini Web2API is listening on port 8081. If not, GlassGem automatically, in this order:

1. **Uses the bundled sources** at `gemini-web2api-ikhsan3adi/` (or an existing `gemini-web2api` checkout next to the project / in your home folder, or a `WEB2API_DIR` you set). Only if nothing is found does it fall back to checking the sources out from GitHub.
2. Uses an existing `gemini-web2api` binary, builds one with Go when a toolchain is installed (static `CGO_ENABLED=0` build, so the binary also runs on musl/Alpine systems), or downloads the official prebuilt release for your OS/CPU (verified by SHA-256) — so neither git nor Go is strictly required.
3. Creates a default `config.json` (API key `sk-gemini`) inside the backend directory when none exists; your own config is never touched.
4. Starts the server as a background daemon on port `8081` and waits until it answers. Its output goes to `.web2api.log`; only when no real server can be provided does GlassGem clearly warn and start the built-in mock instead (sample answers only, never real Gemini).

The background server keeps running after GlassGem exits, and the next start reuses it. To stop it: `npm run web2api:stop` · `run.bat stop` · `run-desktop.bat stop` · `./run.sh stop`. Handy extras: `npm run web2api` (ensure + start the daemon by hand) and `npm run web2api:foreground` (blocking, for debugging). Set `GLASSGEM_SKIP_AUTO_WEB2API=1` to disable the auto-start entirely (for example when you run Web2API in Docker — see [docs/BACKEND.md](./docs/BACKEND.md#docker-alternative)), or point GlassGem at another machine by setting `GLASSGEM_WEB2API_URL` (its port is honored when GlassGem starts the server itself).

You can also start it manually or as a system service (systemd **and** OpenRC/Alpine) with `sudo sh setup-linux.sh`. When it is running you should be able to open this in a browser:

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
| `run.bat stop` | Stop the background Web2API server |
| `run-desktop.bat` | Start the native Windows app (Electron) with hot reload |
| `run-desktop.bat clean` | Reinstall dependencies (including the Electron runtime), then start |
| `run-desktop.bat stop` | Stop the background Web2API server |
| `build.bat` | Type-check + production web build into `dist/` |
| `build.bat preview` | Build, then serve it on <http://localhost:4173> |
| `build.bat clean` | Reinstall dependencies before building |
| `build.bat desktop` | Build the native Windows installer and portable app |

### Linux / macOS / Alpine

Run **`./run.sh`** from your terminal. It verifies the environment, handles dependencies, checks Web2API, and starts the dev server:

| Command | Purpose |
| --- | --- |
| `./run.sh` | Start GlassGem in the browser |
| `./run.sh clean` | Reinstall dependencies, then start |
| `./run.sh mock` | Start mock Web2API server (port 8081) and GlassGem |
| `./run.sh stop` | Stop the background Web2API server |
| `./build.sh` | Type-check + production build into `dist/` |
| `./build.sh preview` | Build, then start local preview server |

All shell scripts are written in **POSIX sh** and run under bash, dash and BusyBox ash alike — so **Alpine Linux works out of the box, no bash installation needed** (`sh run.sh` just works). Every script stops with a plain-language explanation and suggested fix when something goes wrong (missing/old Node.js, failed `npm install`, type errors, port conflicts…). Add `/?` or `--help` to see the options.

### Linux Services (Auto-Start on System Restart)

To register both **Gemini Web2API** and **GlassGem** as system services that start automatically when your machine boots or restarts:

```bash
sudo sh setup-linux.sh
```

This works on **systemd distros** (Debian/Ubuntu, Fedora, Arch, openSUSE, …) **and on OpenRC systems such as Alpine Linux and Gentoo** — the init system is detected automatically. On Alpine, setup is a true one-liner since the script can install missing tools itself:

```sh
# Alpine: install runs out of the box (apk, BusyBox ash, OpenRC)
sudo sh setup-linux.sh            # offers to `apk add` node/npm/git/curl/go if missing
```

This setup script:
- Verifies requirements and — when tools are missing — offers to install them via the detected package manager (`apk`, `apt`, `dnf`, `yum`, `zypper` or `pacman`).
- Uses the **bundled `gemini-web2api-ikhsan3adi/` backend sources** first (clones from GitHub only when absent) and builds a **static `CGO_ENABLED=0` binary** that runs on glibc and musl (Alpine) alike, or falls back to the prebuilt release / graceful mock/Python fallback.
- Detects and clears any existing port conflicts on ports `5173` and `8081`.
- Creates the service definitions — systemd units (`/etc/systemd/system/`) **or** OpenRC scripts (`/etc/init.d/`) with matching environment files (`/etc/default/` on systemd, `/etc/conf.d/` on OpenRC) — and registers them to start on boot.
- Enables both services so they start automatically on boot/restart.
- Verifies health via HTTP checks and automatically diagnoses logs if any service fails.

Service management (works the same on systemd and OpenRC):
```bash
sudo sh setup-linux.sh --status     # View health and running status
sudo sh setup-linux.sh --restart    # Restart both services
sudo sh setup-linux.sh --logs       # View live logs
sudo sh setup-linux.sh --stop       # Stop services
sudo sh setup-linux.sh --uninstall  # Remove the services
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
| **Request timeout** | How long non-streaming requests may run (1–10 min, default 2 min). Streaming responses never time out — slow models may need 5–10 min. |
| **Test Connection** | Calls `GET /v1/models` (falls back to a tiny chat completion if the server has no `/models`). Shows **● Connected** with latency, or **● Connection failed** with a plain-language explanation. |

The connection status pill in the top bar is always visible. Click it for the API URL, current model, last successful request and latency. GlassGem re-tests automatically on startup, whenever the API settings change, and every 20 s while offline.

### Detected capabilities

GlassGem never assumes an OpenAI feature exists. **Settings → API → Detected capabilities** shows what the connected server has demonstrated:

- Chat completions · Model listing · Streaming · System messages · Image input · Usage information · Sampling parameters

Each starts as *Unknown*, becomes *Supported* after a successful observed request, or *Unsupported* after the server rejects it — at which point the corresponding UI is disabled or the feature is silently omitted from requests.

## 6. Troubleshooting

The table below covers the common cases; the expanded, step-by-step guide
(including a 60-second health check and a pre-release test checklist) lives
in [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

| Symptom | What it means | Fix |
| --- | --- | --- |
| **Unable to connect to Gemini Web2API** / *Web2API offline* | Nothing is listening at the Base URL. | Start Web2API (`run.bat` does this automatically). Check `.web2api.log` in the project folder. Confirm the port (8081 by default). |
| **Mock answers only** (startup warns about the *MOCK server*) | No real server binary, Go toolchain, or release download was available, even though the backend sources are bundled. | Install [Go](https://go.dev) 1.22+ so GlassGem can build the bundled server, or allow the prebuilt download from github.com. See [docs/BACKEND.md](./docs/BACKEND.md). The mock is only for trying the UI. |
| **Web2API keeps running after GlassGem exits** | The server is a background daemon by design. | This is normal — the next start reuses it. Stop it with `run.bat stop` / `./run.sh stop`. |
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

Deeper documentation lives in [`docs/`](./docs): [architecture](./docs/ARCHITECTURE.md) · [development guide](./docs/DEVELOPMENT.md) · [backend integration](./docs/BACKEND.md) · [security & privacy](./docs/SECURITY.md) · [feature guide](./docs/FEATURES.md) · [testing guide](./docs/TESTING.md) · [troubleshooting](./docs/TROUBLESHOOTING.md) · [roadmap](./docs/ROADMAP.md).

```
docs/             architecture, development, backend, security, features,
                  testing, troubleshooting and roadmap guides
gemini-web2api-ikhsan3adi/
                  vendored Go backend (OpenAI-compatible Web2API server,
                  started automatically by the launchers)
src/
  components/
    background/     ambient animated background
    chat/           header, message list, message item, markdown, code blocks, composer, model selector, welcome
    dialogs/        settings, search (Ctrl+K), shortcuts, prompt library, onboarding, debug, delete confirm,
                    DialogHost (lazy-loads each dialog on first open)
    layout/         top bar, logo, connection status, PWA prompt
    sidebar/        conversation list + items (groups, favorites, archived view)
    ui/             glass primitives (dialog, menu, switch, segmented, tooltip, fields, empty state…)
    ErrorBoundary.tsx  crash recovery screen with copyable diagnostics
  hooks/          theme, media queries, shortcuts, connection monitor, search, toast
  layouts/        AppLayout (sidebar + chat + mobile drawer)
  lib/            utils (title generation, formatting, clipboard, download…)
  services/
    geminiWebApi.ts   API client: sendMessage / streamMessage / getModels / testConnection / abortRequest
    capabilities.ts   capability model + decision helpers
    errors.ts         HTTP/network → human-friendly ApiError
    db.ts             Dexie schema
    drafts.ts         per-conversation composer drafts (text persisted, attachments runtime)
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
  ensure-web2api.mjs  Web2API auto-installer: vendored checkout/build/download + daemon runner
  stop-web2api.mjs  stops the background Web2API daemon
  check-env.bat     shared Windows environment/dependency check used by the launchers
  check-env.sh      POSIX-sh environment/dependency check (Linux/macOS/Alpine)
  start-web2api.sh  Web2API service entrypoint used by the systemd/OpenRC services
  start-glassgem.sh GlassGem service entrypoint used by the systemd/OpenRC services
resources/
  icon.ico        Windows installer and executable icon
run.bat           starts the web (browser/PWA) version - no Electron needed
run-desktop.bat   starts the native Windows app (Electron) with hot reload
desktop.bat       Windows desktop dev/build/portable commands
run.sh            starts the web version on Linux/macOS/Alpine (POSIX sh)
build.sh          production build helper (POSIX sh)
setup-linux.sh    one-click systemd/OpenRC service installer (POSIX sh)
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on <http://localhost:5173> |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (Node's built-in runner — zero extra dependencies) |
| `npm run mock` | Mock Web2API on port 8081 |
| `npm run web2api` / `web2api:stop` | Start the Web2API daemon by hand / stop it |
| `npm run web2api:foreground` | Run Web2API blocking in this terminal |
| `npm run build` | Production web build into `dist/` |
| `npm run preview` | Serve `dist/` on <http://localhost:4173> (proxy included) |
| `npm run desktop:dev` | Run the native Electron shell with Vite HMR |
| `npm run desktop:build` | Build Windows NSIS + portable artifacts via electron-builder |
| `npm run desktop:pack` | Build an unpacked Windows app directory |

Stack: React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Radix UI primitives · Zustand · Dexie · react-markdown + remark-gfm + highlight.js · Motion · Sonner · Lucide.

Performance notes: streamed tokens are written to a dedicated store that only re-renders the single message being streamed (rAF-throttled); message components are memoised; search is debounced and scans IndexedDB in the background; the sidebar list and message list never re-render on token updates; every dialog is a lazy chunk fetched only on first open, keeping the initial bundle small.

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
- **Bundled Web2API backend** — the server sources ship in the repo and are built/downloaded and started automatically; works offline once set up
- Multiple conversations, grouped Today / Yesterday / Previous 7 days / Older, with **pin**, **favorite**, **duplicate** and **archive** (archived chats stay searchable and can be restored from the sidebar's Archived view)
- Instant local **search** across titles and message content, with highlighted matches (`Ctrl+K`)
- Rename (double-click or menu), delete (confirmed), clear, export per conversation, copy a whole conversation as Markdown
- Automatic local title from the first message (no extra API call)
- Full **Markdown** rendering: headings, lists, tables, blockquotes, links, task lists, images
- **Code blocks** with language label, syntax highlighting and Copy / *Copied ✓*
- Message actions: copy, copy as Markdown/plain text, regenerate, export, report error, delete; **edit & resend** for user messages
- **Regenerate** keeps previous answers: *Response 1 / 3* with ◀ ▶ controls
- **Follow-up suggestions** — `<ElicitationsGroup>` / `<Elicitation>` markup appended by some servers is parsed, stripped from the text, and rendered as clickable chips that send the suggested prompt
- **Stop** generation (button, `Esc`, AbortController → proxy → upstream)
- Timestamps, per-message model, **token usage** (click for prompt/completion/total), optional response time
- **Image attachments** — attach up to 4 images per message by picking, **pasting from the clipboard**, or **dragging & dropping** onto the composer; large images are downscaled locally before they are stored or sent (opt-in, see Known limitations)
- **Crash-proof composer** — per-conversation drafts survive reloads (text persisted locally, attachments kept in memory)
- Per-conversation **system instructions** and optional default system prompt
- Optional `temperature` / `top_p` / `max_tokens` — off by default, auto-disabled if the server rejects them
- **Configurable request timeout** (1–10 min) for slow, non-streaming generations — streams never time out
- **Prompt library** with categories, favorites, create/edit/delete, one-click insert
- **Settings**: General (theme, density, reduced motion, debug panel) · API · Chat · Prompts · Privacy · Data · About
- System / Light / Dark themes, each designed on its own terms; `prefers-reduced-motion` respected
- Elegant error handling for 400/401/403/404/429/5xx, network, proxy, invalid JSON, timeout, abort, and even silently truncated streams
- A global **error boundary**: unexpected UI errors show a recovery screen with one-click reload and copyable diagnostics — never a white page
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
| `Ctrl+V` / drag & drop | Attach an image from the clipboard / files (when image input is enabled) |
| `Esc` | Close dialog / drawer / cancel edit · otherwise **stop generating** |

On macOS use `⌘` instead of `Ctrl`.

## 16. Known limitations

These come from the Web2API side, and GlassGem is deliberately conservative about them:

- **Image attachments** — fully implemented in the UI (picking, downscaling, previews, sending OpenAI-style `image_url` parts) but **disabled by default**: enable *Image input* in Settings → Chat once you have verified your Web2API build accepts multimodal messages. File (non-image) attachments are still out of scope — GlassGem will not fake file support.
- **System messages & sampling parameters** — sent only when enabled; if the server returns 400, GlassGem marks them unsupported and stops sending them.
- **Streaming** — attempted first; if refused, GlassGem falls back and remembers.
- **Token usage / latency** — shown only when the server reports `usage`.
- **AI-generated titles** — not implemented on purpose (titles are derived locally to avoid extra Gemini requests).
- **Model list** — depends on `GET /v1/models`; otherwise type model IDs manually.
- **`gemini-3.1-pro` routing** — without a Google account cookie the backend answers with Flash instead (this comes from the Web2API side). To get real Pro routing, configure a cookie file for the backend — see [docs/BACKEND.md](./docs/BACKEND.md#the-backend-in-60-seconds).

---

## License

GlassGem is released under the [MIT License](./LICENSE).

The backend sources in [`gemini-web2api-ikhsan3adi/`](./gemini-web2api-ikhsan3adi) are by [@ikhsan3adi](https://github.com/ikhsan3adi) and distributed under their own [MIT License](./gemini-web2api-ikhsan3adi/LICENSE); see [docs/BACKEND.md](./docs/BACKEND.md) for how GlassGem uses and patches them.

Built as a local companion for Gemini Web2API. GlassGem is not affiliated with Google.
