# Developing GlassGem

Everything you need to develop, test and ship GlassGem. For the system design,
see [ARCHITECTURE.md](./ARCHITECTURE.md); for the trust model, see
[SECURITY.md](./SECURITY.md).

## Prerequisites

- **Node.js ≥ 20.19** (Node 22+ recommended; the unit tests use Node's
  built-in TypeScript support)
- A running **Gemini Web2API** server — or none at all, if you use the mock
  server below

## Quick start

```bat
npm install          :: once
npm run mock         :: optional: fake Web2API on 127.0.0.1:8081
npm run dev          :: dev server on http://localhost:5173
```

Windows users can double-click a launcher instead:

- **`run.bat`** — the **web (browser/PWA) version**. Checks Node.js,
  installs/repairs the npm packages, optionally starts the mock server
  (`run.bat mock`), and launches the dev server. It deliberately skips the
  Electron binary download, so it works even where `github.com` is blocked.
- **`run-desktop.bat`** — the **native Windows app**. Same care, plus it
  requires (and repairs/downloads) the Electron runtime before starting
  Vite + Electron together. `run-desktop.bat clean` / `mock` work too.

`build.bat` (web production build) and `desktop.bat` (native build commands)
share the same environment checker (`scripts/check-env.bat [clean] [desktop]`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on <http://localhost:5173> |
| `npm run mock` | Mock Web2API on port 8081 (sample answers, error triggers) |
| `npm run typecheck` | Strict TypeScript check (`tsc -b`) |
| `npm test` | Unit tests (Node built-in runner, zero extra dependencies) |
| `npm run build` | Production web build into `dist/` |
| `npm run preview` | Serve `dist/` on <http://localhost:4173> (proxy included) |
| `npm run desktop:dev` | Electron shell + Vite HMR together |
| `npm run desktop:build` | Windows NSIS installers (x64/arm64) + portable exe |
| `npm run desktop:build:portable` | Portable exe only |
| `npm run desktop:pack` | Unpacked app directory (fast smoke test) |

`npm run typecheck` is the static-analysis gate: TypeScript runs in `strict`
mode with `noUnusedLocals`, `noUnusedParameters` and
`noFallthroughCasesInSwitch`.

## Mock Web2API

`scripts/mock-web2api.mjs` mimics the exact request/response shapes GlassGem
depends on (`GET /v1/models`, `POST /v1/chat/completions`, streaming +
non-streaming, multimodal message parts). Special inputs for testing:

| Message contains | Behaviour |
| --- | --- |
| `docker` or `network` | Rich Markdown sample (tables, code, blockquote) |
| `slow` | Long stream, ~60 ms per token |
| `short` | One-line answer |
| `elicit` | Answer followed by an `<ElicitationsGroup>` block (follow-up chips) |
| `error-500` | HTTP 500 |
| `error-429` | HTTP 429 |
| an image attachment | Acknowledges the image |

Run it on another port with `node scripts/mock-web2api.mjs 9099`, then point
GlassGem's Base URL at `http://127.0.0.1:9099/v1`.

## Tests

Unit tests live in `test/` and run on Node's built-in test runner with
type-stripping — **no test framework dependency**:

```bat
npm test
```

- `test/register.mjs` + `test/loader.mjs` teach Node about the `@/` alias and
  extensionless TS imports (mirroring the Vite/tsconfig setup).
- Covered today: title/preview/filename utilities, error normalisation, the
  capability decision helpers, and the export/import validators.

Add new tests as `test/*.test.ts`. Keep them dependency-free and focused on
pure logic (services/lib); UI behaviour is verified manually against the mock
server.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `GLASSGEM_WEB2API_URL` | proxies, `run.bat` | Default upstream Web2API origin (default `http://127.0.0.1:8081`) |
| `GLASSGEM_DEV_SERVER_URL` | Electron | Dev server URL for `desktop:dev` |
| `GLASSGEM_DESKTOP_PORT` | Electron | Loopback port of the packaged app (default 17384) |
| `MOCK_API_KEY` | mock server | API key the mock accepts (default `sk-gemini`) |
| `ELECTRON_MIRROR` | Electron install | Alternate download host for the Electron binary |

Copy `.env.example` to `.env` if you want a persistent
`GLASSGEM_WEB2API_URL`; `.env` is gitignored — never commit it.

## Desktop development

`npm run desktop:dev` (or **`run-desktop.bat`** on Windows) starts Vite
(strict port 5173) and, once it answers, launches Electron pointed at it.
Ctrl+C / closing the window tears both down. Note that the desktop dev server
claims port 5173 with `--strictPort`, so stop any running `run.bat` dev server
first. `desktop.bat dev|build|portable|pack|clean` wraps the same commands.

## Continuous integration

`.github/workflows/windows-desktop.yml`:

1. **verify** (ubuntu, every push + PR): `npm ci` (Electron binary skipped) →
   type-check → unit tests → production build.
2. **build-windows** (tags + manual dispatch, after verify): full `npm ci` +
   `npm run desktop:build`, uploads `release/` artifacts.

## Release checklist

1. Bump `version` in `package.json` (the app UI, build artifacts and installer
   all read it from there).
2. Update the README if user-visible behaviour changed.
3. Push a tag `vX.Y.Z` — CI builds and uploads the Windows artifacts.

## Troubleshooting the toolchain

- **`npm install` stalls on Electron** — the Electron binary comes from GitHub
  releases, not the npm registry. `run-desktop.bat` retries via npm's
  installer and then a direct zip download verified against the SHA-256
  bundled in the electron npm package. Behind a restrictive firewall set
  `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/`, or a
  proxy via `set HTTPS_PROXY=http://proxy:port` in the same window — the
  Electron downloader (`@electron/get`) only honors proxies when
  `ELECTRON_GET_USE_PROXY=1` is set, which the launcher maps across from
  `HTTPS_PROXY` or npm's `https-proxy` config automatically (npm's
  `https-proxy` alone does not affect the Electron download).
- **Port already in use** — Vite picks the next free port; the Electron
  loopback server fails fast with a hint (change `GLASSGEM_DESKTOP_PORT`).
- **Stale caches** — delete `node_modules/.vite` (dev transform cache) or run
  `run.bat clean`.
