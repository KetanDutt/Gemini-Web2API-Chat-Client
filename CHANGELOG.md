# Changelog

All notable changes to GlassGem are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0]

### Added

- **Archive conversations** — the `archived` flag finally has a UI: archive
  from the sidebar or chat-header ⋯ menu, restore anytime from the sidebar's
  new **Archived** filter. Archived chats leave the main list but stay fully
  searchable; archiving the open chat closes it, and duplicates are always
  created unarchived.
- **Configurable request timeout** (Settings → API, 1–10 minutes) for slow
  non-streaming generations. Streaming responses never time out; the value
  is clamped (30–600 s) and covered by unit tests.
- **Copy conversation as Markdown** — chat header ⋯ menu now offers a
  clipboard copy of the whole conversation, formatted exactly like the
  Markdown export.
- New documentation: [docs/FEATURES.md](./docs/FEATURES.md) (user-facing
  feature guide), [docs/TESTING.md](./docs/TESTING.md) (test suites + a
  manual pre-release checklist),
  [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) (expanded, step-by-step
  problem solving) and [docs/ROADMAP.md](./docs/ROADMAP.md) (candidate future
  work). README and ARCHITECTURE updated to match.

### Fixed

- **`run-desktop.bat` left the Web2API server running after the desktop app
  closed.** The desktop session (`run-desktop.bat`, `desktop.bat dev`,
  `npm run desktop:dev`) now owns the backend it starts: the daemon is
  spawned session-scoped — attached to the session's console/terminal — and
  is stopped automatically when the Electron window closes; Ctrl+C or closing
  the terminal stops it together with the session on Windows, macOS and
  Linux. A server that was already running beforehand (`npm run web2api`, a
  system service) is detected and left untouched, and the browser/PWA flow
  keeps its classic persistent daemon. `run-desktop.bat mock` now starts the
  mock through the same session lifecycle instead of a separate `cmd /k`
  window that outlived the app.
- `ensure-web2api` no longer spawns a second daemon on top of one that is
  still booting: a live pid file makes the next call wait for the recorded
  daemon (respawning only if it dies), so the pid file always points at the
  real server and it stays stoppable.
- The vendored backend's `run.bat` is a valid batch script again (it had been
  committed wrapped in markdown code fences and errored out when run).
- **Send-race on conversation switch**: sending a message while the target
  conversation's messages were still loading computed the new message's
  `order` from a stale list and could send a truncated history to the API.
  The in-flight load is now awaited before any send/regenerate/edit, and the
  store falls back to the database whenever its view isn't settled.
- **User-message actions were invisible on touch devices** — the hover-only
  opacity now also lifts below the `sm` breakpoint (matching assistant
  messages).
- **Orphaned composer drafts**: deleting or clearing a conversation (or
  deleting all conversations) now removes its persisted draft instead of
  waiting for the 200-entry cap to evict it.
- Exported single messages get a clean, sortable filename
  (`gemini-2026-09-21-1435.md`) instead of a locale time string with a
  stripped colon.

### Changed

- The default model ID (`gemini-3.6-flash`) is now a single exported
  `DEFAULT_MODEL` constant used by the settings store, the import validator
  and the API form, instead of being hardcoded in three places.
- The visible message list is memoised (no per-render filtering) and the
  chat-header rename input lost an unused ref.

## [1.1.0]

### Added

- **Bundled Web2API backend** — the Go sources of
  [gemini-web2api](https://github.com/ikhsan3adi/gemini-web2api) are vendored
  in `gemini-web2api-ikhsan3adi/` and are now actually used by every launcher
  (previously the vendored tree sat unused while launchers cloned from
  GitHub). Priority: `WEB2API_DIR` → bundled sources → legacy checkouts →
  git clone. See the new [docs/BACKEND.md](./docs/BACKEND.md).
- **Duplicate conversation** — sidebar and chat-header menus can now copy a
  conversation (including all messages and regenerate-versions) as
  “title (copy)”.
- **Paste & drag-drop image attachments** — drop images anywhere on the
  composer or paste from the clipboard; both respect the image-input
  capability and show a live drop overlay.
- **Esc stops generation** — when no dialog/drawer/rename/edit is open,
  `Escape` stops the running response.
- **Crash-safe composer drafts** — text drafts per conversation survive
  reloads (debounced to localStorage, capped at 200 entries); attachments are
  kept per conversation in memory.
- **Global error boundary** — render crashes show a glass recovery screen
  with Reload, Reset & reload and a copyable diagnostics report.
- `npm run web2api`, `npm run web2api:foreground`, `npm run web2api:stop`
  convenience scripts; equivalent Go test coverage for the backend changes.
- **Alpine Linux support throughout** — every `.sh` script is now POSIX sh
  and runs under bash, dash and BusyBox ash alike (no bash needed on
  Alpine); `setup-linux.sh` auto-detects the init system and registers
  services on **systemd and OpenRC** (Alpine/Gentoo), can auto-install
  missing tools via `apk`/`apt`/`dnf`/`yum`/`zypper`/`pacman`, and builds a
  static `CGO_ENABLED=0` Web2API binary that runs on glibc and musl systems.
  CI now parses every shell script with dash (`sh -n`) to keep it that way.

### Changed

- **Smaller initial bundle** — top-level dialogs (settings, search, shortcuts,
  prompt library, onboarding, debug, delete-confirm) and the PWA prompt are
  lazy chunks loaded on first open and kept mounted afterwards.
- **Backend: deterministic model listings** — `/v1/models`, `/v1beta/models`
  and the health endpoint return a stable alphabetical order.
- **Backend: mid-stream failures are surfaced** — a dying upstream stream now
  emits an OpenAI-style error chunk, so clients show a retryable error with
  partial text instead of a silently truncated answer.
- Background connection polls no longer flash the status pill into
  “checking” (the `silent` option is finally honored).
- Docs: new [docs/BACKEND.md](./docs/BACKEND.md); refreshed README,
  ARCHITECTURE, DEVELOPMENT and SECURITY notes; vendored `.gitignore` also
  covers the launcher-generated `config.json`.

## [1.0.0]

Initial public release: Liquid Glass chat UI for Gemini Web2API with
streaming, capability detection, prompt library, search, export/import, PWA
and the Electron desktop shell.
