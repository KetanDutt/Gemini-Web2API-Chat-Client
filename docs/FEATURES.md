# GlassGem Feature Guide

A tour of everything GlassGem can do, from the user's point of view. For the
system design behind these features see [ARCHITECTURE.md](./ARCHITECTURE.md);
for setup and installation see the [README](../README.md).

## Chat

- **Streaming responses** — tokens appear as they arrive. If the server
  refuses `stream: true`, GlassGem automatically falls back to a normal
  request and remembers not to try again (until you reset capabilities).
- **Stop generation** — the ⏹ button, `Esc`, or closing the page aborts the
  request end-to-end (browser → proxy → Web2API). Partial text received up to
  that point is kept and the message is marked *stopped*.
- **Markdown rendering** — headings, lists, tables, blockquotes, task lists,
  links, inline code and images. Links open in a new tab.
- **Code blocks** — language label, syntax highlighting, and one-click *Copy*
  with a confirmation check.
- **Follow-up suggestions** — servers that append
  `<ElicitationsGroup>`/`<Elicitation>` markup get dedicated clickable
  suggestion chips; the raw markup never shows in the chat.
- **Message actions** — copy, copy as plain text or Markdown, regenerate,
  export, report error, delete; user messages support **edit & resend**
  (everything after the edited message is replaced).
- **Regenerate versions** — regenerating keeps previous answers and adds a
  *Response 1 / 3* switcher with ◀ ▶ controls.
- **Continue generating** — when a response is cut off by the model's token
  limit (`finish_reason: "length"`), a *Continue generating* chip appears
  under the message. One click asks the model to pick up exactly where it
  stopped; the continued answer is appended as a new response below.
- **Timestamps, model, token usage & response time** — per message, each
  individually toggleable in Settings → Chat. Usage shows a prompt /
  completion / total breakdown on click.
- **Retry-friendly errors** — every failed message explains what went wrong
  in plain language, with **Retry** and **Open Settings** buttons.

## Attachments

- Attach up to **4 images per message** — pick a file, **paste from the
  clipboard**, or **drag & drop** onto the composer (a drop overlay appears).
- Large images are downscaled locally to at most 1568 px on the longest side
  before they are stored or sent; small images pass through untouched.
- Image input is **off by default** because not every Web2API build accepts
  multimodal messages — enable it in Settings → Chat once you have verified
  your server supports it. Nothing is faked: with the setting off, the attach
  button explains what to do instead.

## Conversations

- Multiple conversations, grouped **Pinned / Today / Yesterday / Previous
  7 days / Older**, with pin, favorite ⭐ and duplicate.
- **Archive** — file finished chats away via the ⋯ menu (sidebar or chat
  header). Archived conversations disappear from the main list, stay fully
  searchable, and can be restored anytime from the sidebar's **Archived**
  filter. Archiving the open chat closes it.
- **Rename** by double-clicking the title (sidebar) or clicking it in the
  chat header. **Delete** always asks for confirmation.
- **Automatic local titles** derived from your first message — no extra API
  call, no data leaving the machine (Settings → Chat can disable it).
- **Per-conversation system instructions** (chat header ⋯ → System
  instructions) plus an optional default system prompt for new chats.
- **Per-conversation model** — pick a model in the header or composer; each
  chat remembers its own. New chats start from the Settings → API default.
- **Crash-proof drafts** — half-typed messages survive reloads, per
  conversation. The composer restores its draft immediately on startup (not
  only after switching chats), so a reload while typing the very first
  message never loses text. Drafts are removed when their conversation is
  deleted or cleared.
- **Live activity indicator** — a pulsing dot on a sidebar conversation shows
  that a response is being generated in it, even while you browse other chats.
- **Self-healing after crashes** — if the app closes while a response is
  streaming, the half-finished message is marked *stopped* on the next start
  instead of spinning forever. Streaming answers are checkpointed to local
  storage every ~1.5 s, so even the text received before the crash survives.
- **Tab title** — the browser/desktop window title mirrors the open
  conversation (`"Deploying to Vercel · GlassGem"`), so multiple GlassGem
  windows or tabs are easy to tell apart.

## Search

- **`Ctrl+K`** opens the command palette: type to search across **titles and
  full message content**, with arrow-key navigation and highlighted matches.
- The sidebar search box does the same live search scoped to the list.
- Search runs locally against IndexedDB — debounced, capped and cancelled
  when you keep typing, so it stays instant even with thousands of messages.

## Prompt library

- Save reusable prompts with a name, description and category
  (Coding / Writing / Research / Business / Learning / Personal).
- Favorite prompts, one-click insert into the composer, full create/edit/
  delete — via `Ctrl+Shift+P` or the sidebar.
- Six starter prompts ship with the app; delete them freely.

## Settings

| Section | What lives there |
| --- | --- |
| **General** | Theme (System / Light / Dark), density (compact / comfortable / spacious), reduce motion, debug panel |
| **API** | Base URL, API key, default model, local proxy toggle, **request timeout** (1–10 min), model list refresh, detected capabilities |
| **Chat** | Enter-to-send, streaming, timestamps / usage / response time, auto-titles, default system prompt, sampling parameters (temperature, top_p, max_tokens), image input |
| **Prompts** | The full prompt library, embedded |
| **Privacy** | What is stored where, storage usage, clear API credentials, delete all conversations |
| **Data** | Export / import everything, delete conversations, clear settings, full reset |
| **About** | Version, connection details, how GlassGem fits together |

**Request timeout** bounds non-streaming requests (and the connection test).
Streaming responses never time out. Slow models that need several minutes
should use 5–10 minutes.

### Capability detection

GlassGem never assumes the server supports an OpenAI feature. Settings → API
shows the live verdict for chat completions, model listing, streaming, system
messages, image input, usage information and sampling parameters — each
*Unknown* until observed, then *Supported* or *Unsupported*. A rejected
feature is automatically dropped from future requests; **Re-detect** resets
the record.

## Data ownership

- Everything — conversations, messages, prompts, drafts, settings — is stored
  **on your machine** (IndexedDB + localStorage). Nothing is uploaded.
- **Export** any conversation as Markdown, JSON or plain text (sidebar or
  header ⋯ menu), copy a whole conversation as Markdown to the clipboard, or
  export **everything** as one backup file from Settings → Data.
- **Import** accepts single-conversation and full-backup GlassGem JSON (and
  makes a best effort with OpenAI-style transcripts). Files are validated
  field by field; imports never overwrite — they get fresh IDs.

## Platform

- **Responsive** — full sidebar on desktop, collapsible on tablet, slide-over
  drawer (with swipe-to-close) on phones.
- **Accessible** — semantic roles, ARIA labels, focus rings, full keyboard
  navigation, `prefers-reduced-motion` respected.
- **Installable PWA** — works like a native app on Edge/Chrome, offline app
  shell included.
- **Native Windows app** — Electron shell with a stable local origin so your
  data survives reinstalls of the web app (see the README's desktop section).
- **Connection awareness** — the status pill re-tests automatically on
  startup, on settings changes, when the tab becomes visible, and every 20 s
  while offline; clicking it shows URL, model, latency and last success.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` | Search / command palette |
| `Ctrl+N` | New chat |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+S` | Settings |
| `Ctrl+Shift+P` | Prompt library |
| `Ctrl+/` | Focus composer |
| `Ctrl+Shift+/` | Shortcut help |
| `Enter` | Send (`Shift+Enter` newline, `Ctrl+Enter` always sends) |
| `Ctrl+V` / drag & drop | Attach images |
| `Esc` | Close dialog / drawer / editor · otherwise stop generating |

On macOS use `⌘` instead of `Ctrl`.
