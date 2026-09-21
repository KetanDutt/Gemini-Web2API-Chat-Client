# Changelog

All notable changes to GlassGem are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
