# GlassGem Architecture

GlassGem is a local-first chat client for the **Gemini Web2API** OpenAI-compatible
server. This document explains how the pieces fit together and why.

## Big picture

```
┌─────────────────────────────┐        ┌────────────────────────────────┐
│  GlassGem UI                │        │  Gemini Web2API                │
│  React 19 + Vite 7 PWA      │        │  OpenAI-compatible server on   │
│  or Electron shell          │        │  your machine (default :8081)  │
│                             │        │  sources vendored in this repo │
│  browser fetch              │        │  at gemini-web2api-ikhsan3adi/ │
│    │                        │        │  and started automatically     │
│    ├─ direct ───────────────┼────────┤► /v1/chat/completions          │
│    │                        │        │  /v1/models                    │
│    └─ local proxy (default) │        │                                │
│       /web2api/*  ──────────┼────────┤►                               │
└─────────────────────────────┘        └────────────────────────────────┘
```

GlassGem never talks to Google. It only talks to the Web2API server you
configure, either directly or through the built-in local proxy. The Go source
code of a compatible server ships inside this repository
(`gemini-web2api-ikhsan3adi/`); the launcher scripts build a binary from it
(or download a verified prebuilt one) and keep it running as a local daemon —
see [BACKEND.md](./BACKEND.md).

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

The two flows also differ in backend lifecycle: the browser/PWA flow starts
the Web2API daemon fully detached (it survives GlassGem restarts and the next
start reuses it), while the desktop flow (`scripts/desktop-dev.mjs`) starts a
**session-scoped** daemon that is stopped automatically when the Electron
window closes — and dies with the terminal on Ctrl+C or window close, since
it shares the session's console/process group. A daemon that was already
running beforehand is adopted, not owned, and therefore left running.

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
    background/     ambient animated backdrop
    chat/           composer, message list, message item, markdown, code blocks,
                    model selector, welcome screen
    dialogs/        settings, search (Ctrl+K), shortcuts, prompt library,
                    onboarding, debug, delete confirm — plus DialogHost, which
                    lazy-loads every dialog on first open
    layout/         top bar, logo, connection status, PWA prompt
    sidebar/        conversation list + items
    ui/             glass primitives (dialog, menu, switch, segmented, tooltip,
                    fields, empty state…)
    ErrorBoundary   last-resort crash screen with copyable diagnostics
  hooks/            theme, media queries, shortcuts, connection monitor,
                    search, toast
  layouts/          AppLayout (sidebar + chat + mobile drawer)
  lib/              utils + image attachment helpers
  services/         API client, capability model, errors, db, export/import,
                    composer drafts
  stores/           zustand stores: conversations, settings, connection,
                    prompts, ui, streaming
  types/            shared TypeScript types
```

### State management

- **`conversationStore`** owns conversations, the active conversation's
  messages, and the whole send/regenerate/edit lifecycle. Every mutation is
  persisted to IndexedDB (Dexie) immediately, then mirrored into the store.
  The initial load of a conversation's messages is tracked as an in-flight
  promise: anything that needs a consistent view of the conversation (send,
  regenerate, edit & resend) awaits it first, so a quickly-typed message can
  never race the load and end up with a wrong `order` or a truncated request
  history. Deleting or clearing a conversation also drops its composer draft.
- **`streamingStore`** is a deliberate micro-optimisation: streamed tokens are
  written into a `Map` outside React state. Only the single message component
  subscribing via `useStreamingText()` re-renders per frame — the message list
  and sidebar never re-render on token updates. Notifications are coalesced to
  one per animation frame.
- **`connectionStore`** tracks connection state, discovered models, request
  traces (debug panel) and **capabilities** (below). Background connection
  polls run with `{ silent: true }` so they never flicker the status pill
  into *checking* — only user-initiated tests do.
- **`settingsStore`** / **`uiStore`** / **`promptStore`** are straightforward;
  settings persist to `localStorage` via zustand `persist`. The
  **request timeout** (Settings → API, 1–10 minutes) is clamped in
  `requestTimeoutMs()` and threaded into the API client via
  `selectApiConfig`; it bounds non-streaming requests and the connection test
  only — streaming responses never time out.
- **Composer drafts** live in `services/drafts.ts`: text per conversation is
  debounce-persisted to `localStorage` (capped, reload-safe), attachments stay
  in a runtime map (too big for storage quotas).

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
upstream connection. The SSE reader always cancels the response body stream
when the turn ends — including on mid-stream errors — so a failing stream
never leaves a dangling connection. SSE parsing is robust against servers
that delimit events with CRLF, even when a chunk boundary falls between the
`\r` and the `\n`.

A response that ends with `finish_reason: "length"` (token cap) stores the
reason on the message; the UI offers a one-click **Continue generating** that
replays the conversation with the truncated answer as the assistant's own
previous turn plus an explicit continuation instruction, and appends the
continuation as a new response.

### Error handling

`services/errors.ts` normalises every failure (HTTP status, network, proxy,
timeout, abort, malformed JSON) into an `ApiError` with a human title, message
and actionable hint. Message bubbles show the error with **Retry** and
**Open Settings** actions; nothing is ever a dead end. Mid-stream upstream
failures are surfaced too: the bundled backend emits an OpenAI-style error
chunk instead of silently truncating, and the client treats it as a real error
(preserving the partial text for retry). As a final safety net, a top-level
`ErrorBoundary` turns render crashes into a recovery screen with copyable
diagnostics instead of a white page.

### Persistence

- **IndexedDB** (database `glassgem`, via Dexie): conversations, messages,
  prompts. Message ordering uses a `[conversationId+order]` compound index;
  schema v2 adds a `status` index so in-flight messages can be found cheaply.
  Conversations carry lifecycle flags (`favorite`, `pinned`, `archived`);
  archived chats leave the main sidebar list but remain fully searchable and
  restorable from the dedicated *Archived* view.
- **Startup sweep**: messages still `pending`/`streaming` when the app last
  exited (tab closed mid-generation, crash) can never finish, so `load()`
  marks them `stopped` (partial text kept) before the UI renders them — no
  eternal spinners after a reload. To make that partial text real, streaming
  answers are checkpointed to IndexedDB roughly every 1.5 s, so a crash loses
  at most the last second or two of output.
- **localStorage**: settings, sidebar state, onboarding flag, detected
  capabilities, composer drafts (versioned zustand persist keys, all prefixed
  `glassgem.`). The composer re-reads its draft from localStorage on mount,
  so a reload never loses the text being typed — including the first message
  of a brand-new chat.
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

### Bundle strategy

Top-level dialogs (settings, search, shortcuts, prompt library, onboarding,
debug, delete confirm) plus the PWA prompt are **lazy chunks**: `DialogHost`
only requests a dialog's chunk the first time it is opened, then keeps it
mounted so close animations and state survive. The initial bundle therefore
stays lean; markdown/highlight.js and Motion are manual chunks shared by the
rest.

## Design system

All visual decisions live as tokens in `src/index.css` (`@theme` block +
`:root` / `.dark` palettes): radii, blur levels, per-material glass
saturation (`--glass-sat-*`), durations, easings, z-layers, and semantic
colours. Components consume tokens — they never invent values. Density modes
(compact/comfortable/spacious) and reduced-motion are token driven too.

### Material layers

The Liquid Glass system is a strict hierarchy, and every floating surface
picks exactly one strength:

| Class | Layer | Used for | Treatment |
| --- | --- | --- | --- |
| `.glass-sm` | secondary | sidebar, chat surface, light panels | 12px blur, 140% saturation |
| `.glass-md` | primary | composer, drawers, scrolled chat header | 20px blur, 160% saturation |
| `.glass-lg` | elevated | dialogs, onboarding | 32px blur, 170% saturation |
| `.glass-float` | floating | menus, popovers, tooltips, toasts | 48px blur, 180% saturation |

Each material composes a translucent background, `backdrop-filter` blur +
saturation, a hairline outer border, an inset 1px edge highlight, a masked
top-light gradient (the "edge light"), and one ambient shadow token
(`--shadow-sm/md/lg/float`) that stays wide and faint — depth without weight.
Text and controls are never translucent.

### Motion

Durations are tokenised (140/220/320/380 ms — micro, standard, structural,
modal) with four easing curves (standard, out, spring, in). Entrances run
through shared keyframes (`fade-in`, `rise`, `pop`, `dialog-in`,
`palette-in`); exits are the same animations reversed and faster. Radix
state hooks (`motion-pop`, `motion-fade`, `motion-dialog`) apply them
declaratively; `prefers-reduced-motion` and the in-app *Reduce motion*
setting flatten everything to near-zero duration.

### Adaptive & accessible rendering

- `prefers-contrast: more` strengthens hairlines, glass edges and secondary
  text without changing the design for everyone else.
- `prefers-reduced-motion: reduce` (or the in-app setting) stops the ambient
  background drift, status pulses and all transitions.
- Browsers without `backdrop-filter` fall back to opaque surfaces.
