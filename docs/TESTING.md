# Testing GlassGem

How the project verifies itself, and how to extend the suites.

## Quick reference

```bat
npm run typecheck   :: strict TypeScript gate (tsc -b)
npm test            :: unit tests — Node's built-in runner, zero extra deps
npm run build       :: production build (also runs the type-check)
```

CI (`.github/workflows/windows-desktop.yml`) runs all three on every push and
pull request, plus `go vet` / `go test` for the vendored backend and the
Windows packaging job for tags.

## Unit tests (`test/`)

The frontend tests use **Node's built-in test runner** (`node --test`) with
two tiny helpers and no external test framework:

- `test/register.mjs` + `test/loader.mjs` — a module-resolution hook that
  teaches Node the `@/` alias (→ `src/`) and extensionless relative imports,
  mirroring the Vite/TypeScript setup. Node 22+ runs the `.ts` test files
  natively.
- Tests import **pure modules only** (services, lib, stores' pure selectors).
  Anything touching the DOM or IndexedDB is covered by the browser itself.

| File | Covers |
| --- | --- |
| `utils.test.ts` | Title generation, previews, formatting, filenames, model labels, date groups, timestamp slugs |
| `elicitations.test.ts` | Parsing/stripping `<ElicitationsGroup>` markup, including half-streamed tags |
| `errors.test.ts` | HTTP status → human-friendly `ApiError` mapping, network/proxy/timeout/abort normalisation |
| `exportImport.test.ts` | Markdown/text/JSON serializers, strict import validation (malformed files, attachments, versions) |
| `drafts.test.ts` | Per-conversation draft persistence, caps, attachment drafts, bulk clearing |
| `capabilities.test.ts` | Capability decision helpers (stream/system/sampling gating) |
| `settingsStore.test.ts` | Request-timeout clamping and the settings → API-config mapping |
| `conversationStore.test.ts` | In-flight status detection and the *Continue generating* request builder (system prompt kept, broken messages skipped, no duplicated turns) |
| `streamClient.test.ts` | The real streaming client against a local SSE server: CRLF delimiters split across chunk boundaries, mid-stream error chunks (partial text kept, connection released), `finish_reason: "length"` |
| `ensure-web2api.test.ts` | Backend auto-installer: port parsing, asset names, PID/log path resolution |
| `desktop-dev.test.ts` | Desktop launcher argument handling |

### Writing a new test

1. Create `test/<topic>.test.ts`.
2. Import the module under test with the `@/` alias.
3. Use `test()` from `node:test` and `assert` from `node:assert/strict`.
4. Keep the module pure (or factor the pure part out) — the runner has no
   DOM/IndexedDB.

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timestampSlug } from '@/lib/utils'

test('timestampSlug is filesystem-safe', () => {
  assert.equal(timestampSlug(new Date(2026, 8, 21, 9, 5).getTime()), '2026-09-21-0905')
})
```

Run a single file while iterating:

```bat
node --import ./test/register.mjs --test test/utils.test.ts
```

## Backend tests

The vendored Gemini Web2API server in `gemini-web2api-ikhsan3adi/` is a Go
module with its own suite:

```sh
cd gemini-web2api-ikhsan3adi
go vet ./...
go test ./...
```

These cover the payload building, response parsing, model listings and the
multimodal/SSRF guards that GlassGem's API client depends on.

## Manual test checklist

Before releasing, walk through this list against the mock server
(`npm run mock`):

1. **Onboarding** → Test Connection → Connected → Start Chatting.
2. Send a message with streaming on; verify the caret, stop button (`Esc`),
   and a complete message afterwards.
3. Regenerate twice; switch between *Response 1/2/3*.
4. Edit a user message; confirm later messages are replaced.
5. Attach an image (Settings → Chat → Enable image input first); paste and
   drag-drop variants too.
6. Search (`Ctrl+K`) for a word from an old message; open the hit.
7. Archive a conversation from the sidebar; find it under **Archived**;
   restore it.
8. Export a conversation as Markdown / JSON / TXT; re-import the JSON.
9. Settings → Data → Export all data; then Import it in a fresh profile.
10. Toggle theme, density, reduce-motion; resize to mobile width and use the
    drawer.
11. Stop the mock server → send a message → verify the friendly offline error
    and the **Retry** path after restarting it.

## Performance smoke

- Open a conversation with 100+ messages: sidebar and message list stay
  responsive during streaming (only the streamed message re-renders).
- `npm run build` → check the chunk sizes in the output; the initial bundle
  should stay under ~250 kB gzipped, with markdown/Motion in shared chunks
  and dialogs lazy.
