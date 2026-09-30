import { create } from 'zustand'
import { db } from '@/services/db'
import { geminiWebApi, type ChatMessageInput } from '@/services/geminiWebApi'
import { ApiError, isAbortError, normalizeError } from '@/services/errors'
import { shouldSendSamplingParams, shouldSendSystemMessage, shouldTryStreaming } from '@/services/capabilities'
import type { Attachment, Conversation, GlassGemExportConversation, Message, MessageStatus, MessageVersion } from '@/types'
import { previewFromContent, titleFromMessage, uid } from '@/lib/utils'
import { clearDrafts, deleteDraft } from '@/services/drafts'
import { useSettings, selectApiConfig } from './settingsStore'
import { useConnection } from './connectionStore'
import { useStreaming } from './streamingStore'

/* ------------------------------------------------------------------ */
/*  Store shape                                                        */
/* ------------------------------------------------------------------ */

interface ConversationStore {
  conversations: Conversation[]
  activeId: string | null
  messages: Message[] // messages of the active conversation, ordered
  loaded: boolean
  loadingMessages: boolean
  /** ids of conversations with a request in flight */
  generating: Record<string, string> // conversationId -> requestId
  editingMessageId: string | null

  load: () => Promise<void>
  setActive: (id: string | null) => Promise<void>
  createConversation: (opts?: { model?: string; title?: string; systemPrompt?: string; activate?: boolean }) => Promise<Conversation>
  renameConversation: (id: string, title: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  togglePinned: (id: string) => Promise<void>
  toggleArchived: (id: string) => Promise<void>
  setConversationModel: (id: string, model: string) => Promise<void>
  setSystemPrompt: (id: string, prompt: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  clearConversation: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  duplicateConversation: (id: string) => Promise<Conversation | null>
  importConversations: (items: GlassGemExportConversation[]) => Promise<number>
  getConversationMessages: (id: string) => Promise<Message[]>

  sendMessage: (content: string, opts?: { conversationId?: string; attachments?: Attachment[] }) => Promise<void>
  regenerate: (assistantMessageId: string) => Promise<void>
  editAndResend: (messageId: string, newContent: string) => Promise<void>
  continueMessage: (assistantMessageId: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  stopGeneration: (conversationId?: string) => void
  setEditing: (messageId: string | null) => void
  setActiveVersion: (messageId: string, index: number) => Promise<void>
  retryLast: () => Promise<void>
}

const sortConversations = (list: Conversation[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)

/**
 * In-flight load of the active conversation's messages. Anything that needs a
 * consistent view of the conversation (send, regenerate, edit & resend) awaits
 * it first, so a quickly-typed message can never race the initial load and
 * end up with a wrong `order` or a truncated request history.
 */
let activeLoad: Promise<void> | null = null

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useConversations = create<ConversationStore>()((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  loaded: false,
  loadingMessages: false,
  generating: {},
  editingMessageId: null,

  /* ---------------- loading ---------------- */

  load: async () => {
    // Reap messages that were still in flight when the app last closed (tab
    // closed mid-generation, crash, reload): their stream can never finish,
    // so they would spin forever. Keep any partial text and mark 'stopped'.
    const stale = await db.messages.where('status').anyOf([...IN_FLIGHT_STATUSES]).toArray()
    if (stale.length) {
      await db.transaction('rw', db.messages, async () => {
        for (const m of stale) {
          const fixed = withSyncedActiveVersion({ ...m, status: 'stopped', updatedAt: Date.now() })
          await db.messages.put(fixed)
        }
      })
    }
    const list = await db.conversations.toArray()
    set({ conversations: sortConversations(list), loaded: true })
    const lastActive = localStorage.getItem('glassgem.activeConversation')
    if (lastActive && list.some((c) => c.id === lastActive)) {
      await get().setActive(lastActive)
    }
  },

  setActive: async (id) => {
    if (id === get().activeId && id !== null) return
    set({ activeId: id, editingMessageId: null, loadingMessages: !!id })
    if (id) localStorage.setItem('glassgem.activeConversation', id)
    else localStorage.removeItem('glassgem.activeConversation')
    if (!id) {
      set({ messages: [], loadingMessages: false })
      return
    }
    const load = (async () => {
      const messages = await db.messages.where('[conversationId+order]').between([id, -Infinity], [id, Infinity]).toArray()
      // Guard against races if the user switched again while loading.
      if (get().activeId === id) set({ messages, loadingMessages: false })
    })()
    activeLoad = load
    try {
      await load
    } finally {
      if (activeLoad === load) activeLoad = null
    }
  },

  getConversationMessages: async (id) => {
    // Never read the in-memory list while it is still being swapped in: the
    // stale window during a conversation switch must not leak into request
    // building. Wait for the pending load, then fall back to the database
    // whenever the store cannot serve a settled view of this conversation.
    if (activeLoad) await activeLoad.catch(() => undefined)
    const s = get()
    if (s.activeId === id && !s.loadingMessages) return s.messages
    return db.messages.where('[conversationId+order]').between([id, -Infinity], [id, Infinity]).toArray()
  },

  /* ---------------- conversation CRUD ---------------- */

  createConversation: async (opts = {}) => {
    const settings = useSettings.getState()
    const now = Date.now()
    const conv: Conversation = {
      id: uid('conv'),
      title: opts.title ?? 'New Chat',
      createdAt: now,
      updatedAt: now,
      model: opts.model ?? settings.defaultModel,
      favorite: false,
      archived: false,
      pinned: false,
      systemPrompt: opts.systemPrompt ?? (settings.sendSystemPrompt && settings.defaultSystemPrompt ? settings.defaultSystemPrompt : undefined),
      messageCount: 0,
      titleEdited: !!opts.title,
    }
    await db.conversations.add(conv)
    set((s) => ({ conversations: sortConversations([conv, ...s.conversations]) }))
    if (opts.activate !== false) {
      set({ activeId: conv.id, messages: [], editingMessageId: null, loadingMessages: false })
      localStorage.setItem('glassgem.activeConversation', conv.id)
    }
    return conv
  },

  renameConversation: async (id, title) => {
    const trimmed = title.trim()
    if (!trimmed) return
    await updateConversation(id, { title: trimmed.slice(0, 120), titleEdited: true }, set)
  },

  toggleFavorite: async (id) => {
    const c = get().conversations.find((x) => x.id === id)
    if (!c) return
    await updateConversation(id, { favorite: !c.favorite }, set, false)
  },

  togglePinned: async (id) => {
    const c = get().conversations.find((x) => x.id === id)
    if (!c) return
    await updateConversation(id, { pinned: !c.pinned }, set, false)
  },

  toggleArchived: async (id) => {
    const c = get().conversations.find((x) => x.id === id)
    if (!c) return
    await updateConversation(id, { archived: !c.archived }, set, false)
    // Archiving the open chat closes it, exactly like deleting would.
    if (!c.archived && get().activeId === id) await get().setActive(null)
  },

  setConversationModel: async (id, model) => {
    await updateConversation(id, { model }, set, false)
  },

  setSystemPrompt: async (id, prompt) => {
    await updateConversation(id, { systemPrompt: prompt.trim() || undefined }, set, false)
  },

  deleteConversation: async (id) => {
    get().stopGeneration(id)
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.messages.where('conversationId').equals(id).delete()
      await db.conversations.delete(id)
    })
    deleteDraft(id)
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }))
    if (get().activeId === id) await get().setActive(null)
  },

  clearConversation: async (id) => {
    get().stopGeneration(id)
    await db.messages.where('conversationId').equals(id).delete()
    deleteDraft(id)
    await updateConversation(id, { preview: undefined, messageCount: 0 }, set, false)
    if (get().activeId === id) set({ messages: [] })
  },

  deleteAll: async () => {
    get().stopGeneration()
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.messages.clear()
      await db.conversations.clear()
    })
    clearDrafts()
    set({ conversations: [], messages: [], activeId: null })
    localStorage.removeItem('glassgem.activeConversation')
  },

  duplicateConversation: async (id) => {
    const source = get().conversations.find((c) => c.id === id) ?? (await db.conversations.get(id))
    if (!source) return null
    const now = Date.now()
    const copy: Conversation = {
      ...source,
      id: uid('conv'),
      title: `${source.title} (copy)`.slice(0, 120),
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      titleEdited: true,
    }
    const sourceMessages = await db.messages.where('[conversationId+order]').between([id, -Infinity], [id, Infinity]).toArray()
    const copiedMessages: Message[] = sourceMessages.map((m) => ({
      ...m,
      id: uid('msg'),
      conversationId: copy.id,
      // Never carry over in-flight states: the copy is a static snapshot.
      status: m.status === 'pending' || m.status === 'streaming' ? 'stopped' : m.status,
    }))
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.conversations.add(copy)
      if (copiedMessages.length) await db.messages.bulkAdd(copiedMessages)
    })
    set((s) => ({ conversations: sortConversations([copy, ...s.conversations]) }))
    return copy
  },

  importConversations: async (items) => {
    await db.transaction('rw', db.conversations, db.messages, async () => {
      for (const item of items) {
        const last = item.messages[item.messages.length - 1]
        item.conversation.preview = last ? previewFromContent(last.content) : undefined
        await db.conversations.add(item.conversation)
        if (item.messages.length) await db.messages.bulkAdd(item.messages)
      }
    })
    set((s) => ({ conversations: sortConversations([...items.map((i) => i.conversation), ...s.conversations]) }))
    return items.length
  },

  /* ---------------- messaging ---------------- */

  setEditing: (messageId) => set({ editingMessageId: messageId }),

  stopGeneration: (conversationId) => {
    const generating = get().generating
    const ids = conversationId ? [conversationId] : Object.keys(generating)
    for (const cid of ids) {
      const reqId = generating[cid]
      if (reqId) geminiWebApi.abortRequest(reqId)
    }
  },

  sendMessage: async (content, opts = {}) => {
    const text = content.trim()
    const hasAttachments = !!opts.attachments?.length
    if (!text && !hasAttachments) return
    let conversationId = opts.conversationId ?? get().activeId
    if (!conversationId) {
      const conv = await get().createConversation()
      conversationId = conv.id
    }
    if (get().generating[conversationId]) return

    const existing = await get().getConversationMessages(conversationId)
    const order = existing.length ? existing[existing.length - 1].order + 1 : 0
    const userMsg: Message = {
      id: uid('msg'),
      conversationId,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      status: 'complete',
      order,
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    }
    await db.messages.add(userMsg)
    if (get().activeId === conversationId) set((s) => ({ messages: [...s.messages, userMsg] }))

    // Auto-title from first user message.
    const conv = get().conversations.find((c) => c.id === conversationId)
    const isFirst = existing.filter((m) => m.role === 'user').length === 0
    const patch: Partial<Conversation> = { preview: text ? previewFromContent(text) : '[image]', messageCount: existing.length + 1 }
    if (conv && isFirst && !conv.titleEdited && useSettings.getState().autoTitle) patch.title = titleFromMessage(text)
    await updateConversation(conversationId, patch, set)

    await runAssistantTurn(conversationId, [...existing, userMsg], set, get)
  },

  regenerate: async (assistantMessageId) => {
    const conversationId = get().activeId
    if (!conversationId || get().generating[conversationId]) return
    const messages = get().messages
    const idx = messages.findIndex((m) => m.id === assistantMessageId)
    if (idx === -1) return
    const target = messages[idx]
    if (target.role !== 'assistant') return
    const history = messages.slice(0, idx)
    await runAssistantTurn(conversationId, history, set, get, { replaceMessageId: assistantMessageId })
  },

  editAndResend: async (messageId, newContent) => {
    const conversationId = get().activeId
    if (!conversationId || get().generating[conversationId]) return
    const text = newContent.trim()
    if (!text) return
    const messages = get().messages
    const idx = messages.findIndex((m) => m.id === messageId)
    if (idx === -1 || messages[idx].role !== 'user') return

    const edited: Message = { ...messages[idx], content: text, updatedAt: Date.now() }
    const removed = messages.slice(idx + 1).map((m) => m.id)
    await db.transaction('rw', db.messages, async () => {
      if (removed.length) await db.messages.bulkDelete(removed)
      await db.messages.put(edited)
    })
    const kept = [...messages.slice(0, idx), edited]
    set({ messages: kept, editingMessageId: null })
    const patch: Partial<Conversation> = { preview: previewFromContent(text), messageCount: kept.length }
    const conv = get().conversations.find((c) => c.id === conversationId)
    if (conv && idx === 0 && !conv.titleEdited && useSettings.getState().autoTitle) patch.title = titleFromMessage(text)
    await updateConversation(conversationId, patch, set)
    await runAssistantTurn(conversationId, kept, set, get)
  },

  deleteMessage: async (messageId) => {
    const conversationId = get().activeId
    if (!conversationId) return
    await db.messages.delete(messageId)
    const messages = get().messages.filter((m) => m.id !== messageId)
    set({ messages })
    const last = messages[messages.length - 1]
    await updateConversation(conversationId, { preview: last ? previewFromContent(last.content) : undefined, messageCount: messages.length }, set, false)
  },

  setActiveVersion: async (messageId, index) => {
    const msg = get().messages.find((m) => m.id === messageId)
    if (!msg?.versions?.length) return
    const i = Math.max(0, Math.min(index, msg.versions.length - 1))
    const v = msg.versions[i]
    const updated: Message = { ...msg, activeVersion: i, content: v.content, usage: v.usage, model: v.model, latencyMs: v.latencyMs, status: v.status, error: v.error, finishReason: v.finishReason }
    await db.messages.put(updated)
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? updated : m)) }))
  },

  continueMessage: async (assistantMessageId) => {
    const conversationId = get().activeId
    if (!conversationId || get().generating[conversationId]) return
    const messages = get().messages
    const idx = messages.findIndex((m) => m.id === assistantMessageId)
    if (idx === -1) return
    const target = messages[idx]
    if (target.role !== 'assistant' || !target.content.trim()) return
    if (target.conversationId !== conversationId) return
    const conv = get().conversations.find((c) => c.id === conversationId)
    // The truncated answer is replayed as the assistant's own words followed
    // by a continuation instruction — no visible filler turn is added.
    const apiOverride = buildContinueMessages(messages, assistantMessageId, CONTINUE_INSTRUCTION, conv?.systemPrompt)
    await runAssistantTurn(conversationId, messages, set, get, { apiOverride })
  },

  retryLast: async () => {
    const messages = get().messages
    const last = messages[messages.length - 1]
    if (!last) return
    if (last.role === 'assistant' && (last.status === 'error' || last.status === 'stopped')) {
      await get().regenerate(last.id)
    } else if (last.role === 'user') {
      const conversationId = get().activeId
      if (conversationId) await runAssistantTurn(conversationId, messages, set, get)
    }
  },
}))

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type Set = (partial: Partial<ConversationStore> | ((s: ConversationStore) => Partial<ConversationStore>)) => void
type Get = () => ConversationStore

async function updateConversation(id: string, patch: Partial<Conversation>, set: Set, touch = true) {
  const full = touch ? { ...patch, updatedAt: Date.now() } : patch
  await db.conversations.update(id, full)
  set((s) => ({ conversations: sortConversations(s.conversations.map((c) => (c.id === id ? { ...c, ...full } : c))) }))
}

function buildApiMessages(history: Message[], systemPrompt?: string): ChatMessageInput[] {
  const caps = useConnection.getState().capabilities
  const imagesSupported = caps.imageInput === 'supported'
  const out: ChatMessageInput[] = []
  if (systemPrompt && shouldSendSystemMessage(caps)) out.push({ role: 'system', content: systemPrompt })
  for (const m of history) {
    if (m.role === 'system') continue
    if (m.role === 'assistant' && (m.status === 'error' || !m.content.trim())) continue
    const images = imagesSupported && m.role === 'user' ? (m.attachments ?? []).filter((a) => !!a.dataUrl) : []
    if (images.length) {
      const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [{ type: 'text', text: m.content }]
      for (const a of images) content.push({ type: 'image_url', image_url: { url: a.dataUrl! } })
      out.push({ role: 'user', content })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

async function persistMessage(msg: Message, set: Set, get: Get) {
  await db.messages.put(msg)
  if (get().activeId === msg.conversationId) {
    set((s) => ({ messages: s.messages.map((m) => (m.id === msg.id ? msg : m)) }))
  }
}

/**
 * Executes one assistant turn: builds the request from `history`, creates (or
 * reuses) the assistant message, streams if possible, falls back otherwise,
 * and persists everything.
 */
async function runAssistantTurn(
  conversationId: string,
  history: Message[],
  set: Set,
  get: Get,
  opts: { replaceMessageId?: string; apiOverride?: ChatMessageInput[] } = {},
) {
  const settings = useSettings.getState()
  const connection = useConnection.getState()
  const conv = get().conversations.find((c) => c.id === conversationId)
  const model = conv?.model ?? settings.defaultModel
  const requestId = uid('req')

  geminiWebApi.setConfig(selectApiConfig(settings))

  // Prepare the assistant message (new, or a new version of an existing one).
  let assistant: Message
  const existing = opts.replaceMessageId ? get().messages.find((m) => m.id === opts.replaceMessageId) : undefined
  if (existing) {
    const versions: MessageVersion[] = existing.versions?.length
      ? [...existing.versions]
      : [{ id: uid('ver'), content: existing.content, createdAt: existing.createdAt, model: existing.model, usage: existing.usage, latencyMs: existing.latencyMs, status: existing.status, error: existing.error }]
    const newVersion: MessageVersion = { id: uid('ver'), content: '', createdAt: Date.now(), model, status: 'pending' }
    versions.push(newVersion)
    assistant = { ...existing, content: '', status: 'pending', error: undefined, usage: undefined, latencyMs: undefined, finishReason: undefined, model, versions, activeVersion: versions.length - 1, updatedAt: Date.now() }
  } else {
    const lastOrder = history.length ? history[history.length - 1].order : -1
    assistant = { id: uid('msg'), conversationId, role: 'assistant', content: '', createdAt: Date.now(), status: 'pending', order: lastOrder + 1, model }
  }

  await db.messages.put(assistant)
  if (get().activeId === conversationId) {
    set((s) => ({ messages: existing ? s.messages.map((m) => (m.id === assistant.id ? assistant : m)) : [...s.messages, assistant] }))
  }
  set((s) => ({ generating: { ...s.generating, [conversationId]: requestId } }))

  const controller = new AbortController()
  const apiMessages = opts.apiOverride ?? buildApiMessages(history, conv?.systemPrompt)
  // Streaming partial-text checkpointing (crash resilience).
  const STREAM_CHECKPOINT_MS = 1500
  let lastStreamCheckpoint = performance.now()
  const params = shouldSendSamplingParams(connection.capabilities, settings.enableSamplingParams) ? settings.chatParams : undefined
  const streaming = useStreaming.getState()

  const finalize = async (patch: Partial<Message>) => {
    const current = get().messages.find((m) => m.id === assistant.id) ?? assistant
    const merged = withSyncedActiveVersion({ ...current, ...patch, updatedAt: Date.now() })
    streaming.clear(assistant.id)
    await persistMessage(merged, set, get)
    const preview = merged.content ? previewFromContent(merged.content) : undefined
    const count = (await db.messages.where('conversationId').equals(conversationId).count()) || undefined
    await updateConversation(conversationId, { ...(preview ? { preview } : {}), messageCount: count }, set)
  }

  const started = performance.now()
  try {
    let result
    const tryStream = shouldTryStreaming(connection.capabilities, settings.streaming)
    if (tryStream) {
      try {
        useConnection.getState().setStreamingNow(true)
        result = await geminiWebApi.streamMessage(
          { model, messages: apiMessages, params, signal: controller.signal },
          {
            onStart: () => {
              streaming.start(assistant.id)
              if (get().activeId === conversationId) {
                set((s) => ({ messages: s.messages.map((m) => (m.id === assistant.id ? { ...m, status: 'streaming' } : m)) }))
              }
            },
            onToken: (_delta, full) => {
              streaming.push(assistant.id, full)
              // Checkpoint the partial answer to IndexedDB every so often so a
              // crash or reload mid-stream keeps the text received so far (the
              // startup sweep then marks the message 'stopped' instead of
              // losing it). The on-screen rendering still comes from the
              // in-memory streaming buffer — this write is invisible to the UI.
              const now = performance.now()
              if (now - lastStreamCheckpoint > STREAM_CHECKPOINT_MS) {
                lastStreamCheckpoint = now
                void db.messages.put(withSyncedActiveVersion({ ...assistant, content: full, status: 'streaming', model, updatedAt: Date.now() }))
              }
            },
          },
          requestId,
        )
      } catch (err) {
        const e = normalizeError(err, settings.baseUrl)
        const partial = streaming.get(assistant.id)
        // Streaming refused by the server (not a network / auth problem, and nothing received yet) → fall back once.
        const streamRefused = !partial && (e.kind === 'bad_request' || e.kind === 'not_found' || e.kind === 'invalid_response')
        if (streamRefused && !controller.signal.aborted) {
          useConnection.getState().setCapability('streaming', 'unsupported')
          result = await geminiWebApi.sendMessage({ model, messages: apiMessages, params, signal: controller.signal }, requestId)
        } else {
          throw err
        }
      } finally {
        useConnection.getState().setStreamingNow(false)
      }
    } else {
      result = await geminiWebApi.sendMessage({ model, messages: apiMessages, params, signal: controller.signal }, requestId)
    }

    const latencyMs = performance.now() - started
    await finalize({ content: result.content, status: 'complete', usage: result.usage, model: result.model ?? model, latencyMs, error: undefined, finishReason: result.finishReason })
    useConnection.getState().noteSuccess(latencyMs)
  } catch (err) {
    const partial = streaming.get(assistant.id)
    if (isAbortError(err) || (err instanceof ApiError && err.kind === 'aborted')) {
      await finalize({ content: partial ?? '', status: 'stopped', latencyMs: performance.now() - started })
    } else {
      const e = normalizeError(err, settings.baseUrl)
      if (e.kind === 'bad_request' && params) {
        // Sampling params might be the culprit; don't send them again.
        useConnection.getState().setCapability('samplingParams', 'unsupported')
      }
      if (e.kind === 'bad_request' && apiMessages[0]?.role === 'system') {
        useConnection.getState().setCapability('systemMessages', 'unsupported')
      }
      useConnection.getState().noteFailure(e)
      await finalize({ content: partial ?? '', status: 'error', error: JSON.stringify({ title: e.title, message: e.message, hint: e.hint, kind: e.kind, status: e.status }), latencyMs: performance.now() - started })
    }
  } finally {
    set((s) => {
      const generating = { ...s.generating }
      delete generating[conversationId]
      return { generating }
    })
  }
}

/** Messages that were in flight when the app died and can never finish. */
export const IN_FLIGHT_STATUSES: readonly MessageStatus[] = ['pending', 'streaming']

export function isInFlightStatus(status: Message['status']): boolean {
  return status === 'pending' || status === 'streaming'
}

/** Copies the message's top-level state into its active version entry. */
export function withSyncedActiveVersion(msg: Message): Message {
  if (!msg.versions?.length || msg.activeVersion == null) return msg
  const versions = [...msg.versions]
  versions[msg.activeVersion] = {
    ...versions[msg.activeVersion],
    content: msg.content,
    usage: msg.usage,
    model: msg.model,
    latencyMs: msg.latencyMs,
    status: msg.status,
    error: msg.error,
    finishReason: msg.finishReason,
  }
  return { ...msg, versions }
}

/**
 * Builds the request that asks the model to continue a response that was cut
 * off by a token limit (`finish_reason: "length"`). The truncated answer is
 * replayed as the assistant's own words followed by an explicit instruction,
 * which is the most reliable continuation pattern for OpenAI-style APIs.
 */
export function buildContinueMessages(history: Message[], assistantId: string, instruction: string, systemPrompt?: string): ChatMessageInput[] {
  const idx = history.findIndex((m) => m.id === assistantId)
  if (idx === -1) return buildApiMessages(history, systemPrompt)
  // History up to and including the truncated answer, then the instruction.
  // (The truncated answer must appear exactly once — as the assistant's own
  // previous turn — followed by an explicit user "continue" request.)
  const api = buildApiMessages(history.slice(0, idx + 1), systemPrompt)
  api.push({ role: 'user', content: instruction })
  return api
}

const CONTINUE_INSTRUCTION = 'Continue your previous answer exactly where it stopped — do not repeat any earlier text, do not add an introduction.'

export function parseMessageError(m: Message): { title: string; message: string; hint?: string; kind: string; status?: number } | null {
  if (!m.error) return null
  try {
    return JSON.parse(m.error)
  } catch {
    return { title: 'Error', message: m.error, kind: 'unknown' }
  }
}
