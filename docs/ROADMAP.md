# GlassGem Roadmap

Candidate improvements, ordered roughly by value versus effort. None of these
are required for daily use — the app is fully functional without them — but
each would meaningfully move the product forward. Contributions welcome.

## High value

- **Virtualised message list** — conversations with several hundred messages
  still render every message component. Windowing (e.g. `virtua` or a small
  custom virtualiser that preserves the current scroll-anchoring behaviour)
  would keep long chats at a constant frame cost.
- **In-conversation find** (`Ctrl+F` inside a chat) — highlight and jump
  between matches within the active conversation. The infrastructure
  (`useConversationSearch`) already exists; it needs a scoped UI.
- **AI-generated titles, opt-in** — today titles are derived locally (by
  design, zero extra requests). An optional "improve title with Gemini" action
  on the header would be a natural, opt-in enhancement.
- **End-to-end tests** — the unit suites cover pure logic; a small Playwright
  flow (onboard → send → stop → regenerate → archive → export) against
  `npm run mock` would guard the UI itself in CI.
- **Message list diffing for streaming** — react-markdown re-parses the full
  message on every animation frame while streaming. A chunked/incremental
  markdown renderer would cut CPU on very fast streams.

## Medium value

- **Conversation statistics** — per-conversation and global token usage
  history (the data is already persisted per message).
- **Bulk sidebar actions** — multi-select conversations for archive/delete/
  export.
- **Markdown export of everything** — Settings → Data currently exports one
  JSON backup; a "zip of Markdown files" variant would be friendlier for
  non-GlassGem destinations.
- **lighter syntax highlighting** — highlight.js `common` (~40 languages) is
  the largest chunk after React. A curated subset or a lazy `createHighlighter`
  core would trim ~60 kB gzip from the markdown chunk.
- **Per-conversation sampling overrides** — temperature/top_p are global
  today; storing `chatParams` on the conversation would match how model and
  system prompt already work.

## Nice to have

- **Editable assistant messages** (with a clear "edited" marker).
- **Conversation branching** (fork from any message, not just duplicate).
- **Pinned/favourite prompts in the composer** — quick-access row above the
  input.
- **Desktop: native notifications** when a long generation finishes while the
  window is in the background.
- **i18n** — the UI strings are currently English-only; extracting them would
  unlock translations.

## Non-goals

Deliberately out of scope, to keep the trust model simple:

- Any cloud sync or telemetry of any kind.
- File (non-image) attachments that the Web2API backend cannot actually
  process — GlassGem does not fake support.
- Speaking for Gemini authentication: cookies live on the server only.
