# Security & Privacy

GlassGem is designed around one rule: **nothing leaves your machine except
requests to the Web2API server you configured.** This document states exactly
what that means and the hardening behind it.

## Data inventory

| Data | Where it lives | Notes |
| --- | --- | --- |
| Conversations, messages, attachments | IndexedDB (`glassgem`) in your browser profile | Never synced anywhere |
| Settings (incl. API key) | `localStorage` (`glassgem.*` keys) | Anyone with OS access to the profile can read it; *Settings → Privacy → Clear key* removes the key |
| Composer drafts (unsent text) | `localStorage` (`glassgem.drafts`) | Text only — attachments are runtime-only by design |
| Gemini auth cookies | **Only** inside the Web2API server process | GlassGem never requests, sees or stores them |
| Request traces (debug panel) | Memory only | Never include API keys or cookies |

The API key is sent exclusively to the configured Base URL as an
`Authorization: Bearer` header (or its `/web2api` proxy equivalent).

## Network guarantees

- **The local proxies are private-network only.** Both the Vite plugin
  (`scripts/web2api-proxy.ts`) and the Electron embedded proxy
  (`electron/main.cjs`) validate the upstream from `x-glassgem-target`
  against loopback/RFC-1918 ranges before forwarding. Requests to public
  hosts are rejected with HTTP 400, so the proxy cannot be abused as an
  open relay.
- **Credentials never enter the target header.** The proxy strips its own
  control header and hop-by-hop headers before forwarding.
- **Service worker deny-list.** The PWA service worker never intercepts
  `/web2api/*` or `/v1/*` — API traffic is never cached or replayed.
- **No third-party requests.** The UI loads no external fonts, CDNs or
  analytics. (The app used to hot-link the Inter font; it was removed so the
  "local only" claim holds even offline.)

## Renderer hardening (Electron)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- The preload bridge exposes exactly one action (`openExternal`, restricted
  to http/https) and read-only platform info.
- Navigation is confined to the app's own origin; `window.open` and
  non-trusted navigations are intercepted and offered to the OS shell only
  for http(s).
- The embedded static server binds to `127.0.0.1` only, serves hashed assets
  with `X-Content-Type-Options: nosniff`, resolves paths against the `dist/`
  root (no traversal), and falls back to the app shell for client routes.
- Single-instance lock prevents duplicate origins fighting over storage.

## Import safety

Imported JSON is validated field-by-field (`services/exportImport.ts`):

- Unknown roles are dropped; ids are regenerated; counts are capped.
- Attachment `dataUrl` values must start with `data:image/` or the attachment
  is rejected — no `javascript:` or remote URLs can enter the UI.
- Prompts are capped and their categories whitelisted.

Markdown rendering escapes HTML by default; links open with
`rel="noreferrer noopener"`.

## Threat model summary

| Threat | Mitigation |
| --- | --- |
| Malicious export file | Strict parser, capability whitelist, id regeneration |
| Open-relay abuse of the proxy | Private-network-only upstream validation |
| XSS via message content | React escaping + sanitized markdown; no `dangerouslySetInnerHTML` |
| Key theft via a compromised renderer | contextIsolation + sandbox; key only ever travels to the configured local server |
| Cookie leakage | Cookies never reach the client; architectural separation by design |
| Stale cached API responses | SW deny-list for all API paths |

## Reporting a vulnerability

Open a private report via the repository's security advisory channel (or an
issue if advisories are disabled). Please include reproduction steps; security
fixes are prioritised over feature work.
