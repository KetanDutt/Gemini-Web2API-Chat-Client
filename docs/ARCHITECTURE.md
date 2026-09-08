# GlassGem Architecture

GlassGem is a local-first chat client for the **Gemini Web2API** OpenAI-compatible
server. This document explains how the pieces fit together and why.

## Big picture

```
┌─────────────────────────────┐        ┌────────────────────────────────┐
│  GlassGem UI                │        │  Gemini Web2API (external)     │
│  React 19 + Vite 7 PWA      │        │  OpenAI-compatible server on   │
│  or Electron shell          │        │  your machine (default :8081)  │
│                             │        │                                │
│  browser fetch              │        │  performs Gemini auth with     │
│    │                        │        │  cookies GlassGem never sees   │
│    ├─ direct ───────────────┼────────┤► /v1/chat/completions          │
│    │                        │        │  /v1/models                    │
│    └─ local proxy (default) │        │                                │
│       /web2api/*  ──────────┼────────┤►                               │
└─────────────────────────────┘        └────────────────────────────────┘
```

GlassGem never talks to Google. It only talks to the Web2API server you
configure, either directly or through the built-in local proxy.

## The three ways GlassGem runs

| Mode | Entry point | How API requests travel |
| --- | --- | --- |
| Dev server (web) | `npm run dev` / `run.bat` | Browser → Vite dev server `/web2api/*` proxy → Web2API |
| Production web / PWA | `npm run preview` / `build.bat` | Browser → Vite preview server `/web2api/*` proxy → Web2API |
| Native Windows app | `run-desktop.bat` / `desktop.bat` | Renderer → embedded loopback server `/web2api/*` proxy → Web2API |

Only the native row needs the Electron runtime (`electron.exe`). The shared
environment checker (`scripts/check-env.bat`) runs in `web` mode for the first
two rows — skipping the Electron binary download entirely — and in `desktop`
mode for the third, where it fetches/repairs the runtime from GitHub releases.

The proxy exists to sidestep browser CORS restrictions without any cloud
backend. It is implemented twice on purpose:

- `scripts/web2api-proxy.ts` — a Vite plugin used by the dev **and** preview
  servers (TypeScript, lives in the web tooling).
- `electron/main.cjs` — the same forwarding logic embedded in the desktop
  shell (plain CJS so the packaged app needs no extra runtime).

Both proxies enforce the same security rule: the upstream target (from the
`x-glassgem-target` header or the default) must be a **loopback or
private-network** address. The proxy can never be used to reach the public
internet.

## Frontend layers

```
src/
  components/
    background/   ambient animated backdrop
    chat/         composer, message list, message item, markdown, code blocks,
                  model selector, welcome screen
    dialogs/      settings, search (Ctrl+K), shortcuts, prompt library,
                  onboarding, debug, delete confirm
    layout/       top bar, logo, connection status, PWA prompt
    sidebar/      conversation list + items
    ui/           glass primitives (dialog, menu, switch, segmented, tooltip,
                  fields, empty state…)
  hooks/          theme, media queries, shortcuts, connection monitor,
                  search, toast
  layouts/        AppLayout (sidebar + chat + mobile drawer)
  lib/            utils + image attachment helpers
  services/       API client, capability model, errors, db, export/import
  stores/         zustand stores: conversations, settings, connection,
                  prompts, ui, streaming
  types/          shared TypeScript types
```

### State management

- **`conversationStore`** owns conversations, the active conversation's
  messages, and the whole send/regenerate/edit lifecycle. Every mutation is
  persisted to IndexedDB (Dexie) immediately, then mirrored into the store.
- **`streamingStore`** is a deliberate micro-optimisation: streamed tokens are
  written into a `Map` outside React state. Only the single message component
  subscribing via `useStreamingText()` re-renders per frame — the message list
  and sidebar never re-render on token updates. Notifications are coalesced to
  one per animation frame.
- **`connectionStore`** tracks connection state, discovered models, request
  traces (debug panel) and **capabilities** (below).
- **`settingsStore`** / **`uiStore`** / **`promptStore`** are straightforward;
  settings persist to `localStorage` via zustand `persist`.

### Capability detection

GlassGem targets many Web2API builds of varying completeness, so it assumes
**nothing**. Every capability (`streaming`, `systemMessages`, `imageInput`,
`samplingParams`, `usageInfo`, `modelListing`) starts as `unknown` and only
becomes `supported` after an observed success. If the server rejects a feature
(HTTP 400/404), the capability flips to `unsupported` and GlassGem stops
sending it — e.g. a rejected `stream: true` permanently falls back to plain
completions for that server. Users can reset detection in Settings → API.

### Request lifecycle

```
Composer.submit()
  → conversationStore.sendMessage()
      → persist user message (IndexedDB)
      → runAssistantTurn()
          → build API messages (system prompt + history + image attachments)
          → try streamMessage()  ──falls back──► sendMessage()
          → per-token callbacks write to streamingStore
          → finalize(): persist assistant message, update preview/count,
            record capability + trace
```

Stopping generation aborts an `AbortController` tracked per request id inside
the API client; the abort propagates through the proxy, which destroys the
upstream connection.

### Error handling

`services/errors.ts` normalises every failure (HTTP status, network, proxy,
timeout, abort, malformed JSON) into an `ApiError` with a human title, message
and actionable hint. Message bubbles show the error with **Retry** and
**Open Settings** actions; nothing is ever a dead end.

### Persistence

- **IndexedDB** (database `glassgem`, via Dexie): conversations, messages,
  prompts. Message ordering uses a `[conversationId+order]` compound index.
- **localStorage**: settings, sidebar state, onboarding flag, detected
  capabilities (versioned zustand persist keys, all prefixed `glassgem.`).
- Image attachments are stored as downscaled `data:` URLs inside the message
  record (max 1568px on the longest side) — see `src/lib/images.ts`.

### Electron shell

`electron/main.cjs` serves the production `dist/` from a **127.0.0.1-only**
static server on a stable port (default 17384, so IndexedDB/localStorage
origins survive restarts), hosts the window with `contextIsolation: true`,
`sandbox: true`, no `nodeIntegration`, a navigation allow-list, and a minimal
preload bridge (`openExternal` + platform info). Single-instance lock and a
native menu are included.

### PWA

`vite-plugin-pwa` generates a service worker that precaches the app shell and
explicitly never intercepts `/web2api/*` or `/v1/*`. Updates use
`registerType: 'prompt'`; `PwaPrompt` shows the reload banner and the install
offer. The PWA is not mounted inside the Electron shell.

## Design system

All visual decisions live as tokens in `src/index.css` (`@theme` block +
`:root` / `.dark` palettes): radii, blur, durations, easings, z-layers, and
semantic colours. Components consume tokens — they never invent values.
Density modes (compact/comfortable/spacious) and reduced-motion are token
driven too.
