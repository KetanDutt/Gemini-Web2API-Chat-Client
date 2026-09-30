# Changelog

All notable changes to GlassGem are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0]

### Changed — Liquid Glass design-system refinement

A dedicated visual/interaction polish pass across the whole app. No features,
flows, data or logic changed — only how it looks, moves and feels.

- **Material system** — glass blur/saturation strengths are now tokenised per
  layer (`--glass-sat-sm/md/lg/float`); every ambient shadow was re-tuned to a
  two-layer, wide-and-faint profile so depth reads as *hovering*, not *casting*.
- **Calmer background** — the ambient colour fields dropped ~30% in intensity
  and now drift over 90 s with smaller translation; the background stays
  invisible until a glass surface moves across it. The drift also stops
  entirely under reduced motion.
- **First-class dark glass** — dark-mode sidebar/composer surfaces gained
  presence (0.045/0.065 white) with a stronger top edge-light, so panels read
  as glass instead of disappearing into the background.
- **Buttons** — the primary button is now top-lit (subtle gradient + inner
  highlight) with a hover lift and a slightly deeper accent shadow; press
  compression was softened app-wide (scale 0.975, tiny downward settle) and
  icon-button presses from 0.92 → 0.94.
- **User bubble** — rebuilt as a shared `.user-bubble` material: faint
  top-lit accent gradient, inset edge light, tinted ambient shadow, and a
  readable light selection colour for selected text.
- **Thinking indicator** — "Gemini is thinking…" is now a quiet glass capsule
  instead of a bare dot row.
- **Scroll-aware chat header** — background, hairline *and* backdrop blur now
  animate together as one continuous material change (the blur used to snap).
- **Welcome hero** — the title is fluid (`clamp()`, up to 36px), tighter
  tracked, optically balanced; the sidebar list fades in on load.
- **Forms** — inputs brighten their surface on hover (previously only the
  border moved), and the prompt category select regained its dropdown chevron
  (`appearance-none` had stripped it with no replacement).
- **Typography** — all headings now use `text-wrap: balance` for even lines.
- **Accessibility** — new `prefers-contrast: more` support strengthens
  hairlines, glass edges and secondary text; reduced-motion handling now also
  covers the generating dot and ambient drift explicitly.

## [1.3.0]

### Added

- **Continue generating** — responses cut off by the model's token limit
  (`finish_reason: "length"`) now show a *Continue generating* chip. One
  click asks the model to pick up exactly where it stopped, appending the
  continuation as a new response. The finish reason is persisted per message
  (and per regenerate version), and the mock server can simulate the limit
  with the `truncate` trigger word.
- **Live activity indicator in the sidebar** — a pulsing dot marks
  conversations that are currently generating a response, visible even while
  you browse other chats.
- **Conversation-aware window title** — the browser/desktop tab now reads
  `"<conversation> · GlassGem"`, making multiple GlassGem windows easy to
  tell apart.

### Fixed

- **Half-finished responses no longer spin forever — or vanish.** If the app
  closed while a response was streaming (tab closed, crash, reload), the
  orphaned `pending`/`streaming` message showed an eternal thinking indicator
  on the next start, and since streaming text lived only in memory, the
  partial answer was lost. Messages in flight at boot are now reaped to
  *stopped* via a cheap indexed query (the messages table carries a new
  `status` index — IndexedDB schema v2, upgraded in place), and streaming
  answers are checkpointed to IndexedDB every ~1.5 s so a crash keeps
  everything the model managed to say.
- **`Ctrl+Shift+/` never opened the shortcut help.** With Shift held,
  keyboards produce `?`, so the advertised chord never matched. Both `?` and
  `/` variants now work.
- **Composer drafts are restored on startup.** The persisted draft was only
  re-read when *switching* conversations, so reloading while typing the first
  message of a brand-new chat lost the text despite the "crash-proof draft"
  promise. The draft now loads on mount, for the restored conversation and
  the not-yet-created `__new` chat alike.
- **Mid-stream errors no longer leak the connection.** When an upstream error
  chunk (or any read error) aborted a stream, the response body reader was
  never cancelled and the underlying HTTP connection stayed open until GC.
  The reader is now always cancelled/released when the turn ends.
- **SSE events split across a CRLF chunk boundary parsed incorrectly.** A
  network chunk ending in a bare `\r` (its `\n` arriving in the next chunk)
  kept the carriage return inside the event line; the trailing `\r` is now
  buffered so CRLF is normalised correctly.
- **Inserting a prompt from Settings → Prompts closed the whole Settings
  dialog.** The embedded prompt panel now stays open; only the standalone
  dialog closes.
- The toast/theme no longer goes stale when the OS switches between light and
  dark while GlassGem follows the system theme.

### Improved

- Streaming auto-scroll does no layout work while the tab is hidden.
- Removed dead code (unused `Skeleton` components, menu primitives,
  `debounce`/`isSupported` helpers).
- New unit tests for in-flight detection and the continue-request builder
  (93 tests total, all green); docs updated throughout.

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
