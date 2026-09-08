import { create } from 'zustand'
import { db } from '@/services/db'
import { geminiWebApi, type ChatMessageInput } from '@/services/geminiWebApi'
import { ApiError, isAbortError, normalizeError } from '@/services/errors'
import { shouldSendSamplingParams, shouldSendSystemMessage, shouldTryStreaming } from '@/services/capabilities'
import type { Conversation, GlassGemExportConversation, Message, MessageVersion } from '@/types'
import { previewFromContent, titleFromMessage, uid } from '@/lib/utils'
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
  setConversationModel: (id: string, model: string) => Promise<void>
  setSystemPrompt: (id: string, prompt: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  clearConversation: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  importConversations: (items: GlassGemExportConversation[]) => Promise<number>
  getConversationMessages: (id: string) => Promise<Message[]>

  sendMessage: (content: string, opts?: { conversationId?: string }) => Promise<void>
  regenerate: (assistantMessageId: string) => Promise<void>
  editAndResend: (messageId: string, newContent: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  stopGeneration: (conversationId?: string) => void
  setEditing: (messageId: string | null) => void
  setActiveVersion: (messageId: string, index: number) => Promise<void>
  retryLast: () => Promise<void>
}

const sortConversations = (list: Conversation[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)

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
    const messages = await db.messages.where('[conversationId+order]').between([id, -Infinity], [id, Infinity]).toArray()
    // Guard against races if the user switched again while loading.
    if (get().activeId === id) set({ messages, loadingMessages: false })
  },

  getConversationMessages: async (id) => {
    if (get().activeId === id) return get().messages
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
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }))
    if (get().activeId === id) await get().setActive(null)
  },

  clearConversation: async (id) => {
    get().stopGeneration(id)
    await db.messages.where('conversationId').equals(id).delete()
    await updateConversation(id, { preview: undefined, messageCount: 0 }, set, false)
    if (get().activeId === id) set({ messages: [] })
  },

  deleteAll: async () => {
    get().stopGeneration()
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.messages.clear()
      await db.conversations.clear()
    })
    set({ conversations: [], messages: [], activeId: null })
    localStorage.removeItem('glassgem.activeConversation')
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
    if (!text) return
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
    }
    await db.messages.add(userMsg)
    if (get().activeId === conversationId) set((s) => ({ messages: [...s.messages, userMsg] }))

    // Auto-title from first user message.
    const conv = get().conversations.find((c) => c.id === conversationId)
    const isFirst = existing.filter((m) => m.role === 'user').length === 0
    const patch: Partial<Conversation> = { preview: previewFromContent(text), messageCount: existing.length + 1 }
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
    const updated: Message = { ...msg, activeVersion: i, content: v.content, usage: v.usage, model: v.model, latencyMs: v.latencyMs, status: v.status, error: v.error }
    await db.messages.put(updated)
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? updated : m)) }))
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
  const out: ChatMessageInput[] = []
  if (systemPrompt && shouldSendSystemMessage(caps)) out.push({ role: 'system', content: systemPrompt })
  for (const m of history) {
    if (m.role === 'system') continue
    if (m.role === 'assistant' && (m.status === 'error' || !m.content.trim())) continue
    out.push({ role: m.role, content: m.content })
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
  opts: { replaceMessageId?: string } = {},
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
    assistant = { ...existing, content: '', status: 'pending', error: undefined, usage: undefined, latencyMs: undefined, model, versions, activeVersion: versions.length - 1, updatedAt: Date.now() }
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
  const apiMessages = buildApiMessages(history, conv?.systemPrompt)
  const params = shouldSendSamplingParams(connection.capabilities, settings.enableSamplingParams) ? settings.chatParams : undefined
  const streaming = useStreaming.getState()

  const finalize = async (patch: Partial<Message>) => {
    const current = get().messages.find((m) => m.id === assistant.id) ?? assistant
    const merged: Message = { ...current, ...patch, updatedAt: Date.now() }
    if (merged.versions?.length && merged.activeVersion != null) {
      const versions = [...merged.versions]
      versions[merged.activeVersion] = {
        ...versions[merged.activeVersion],
        content: merged.content,
        usage: merged.usage,
        model: merged.model,
        latencyMs: merged.latencyMs,
        status: merged.status,
        error: merged.error,
      }
      merged.versions = versions
    }
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
            onToken: (_delta, full) => streaming.push(assistant.id, full),
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
    await finalize({ content: result.content, status: 'complete', usage: result.usage, model: result.model ?? model, latencyMs, error: undefined })
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

export function parseMessageError(m: Message): { title: string; message: string; hint?: string; kind: string; status?: number } | null {
  if (!m.error) return null
  try {
    return JSON.parse(m.error)
  } catch {
    return { title: 'Error', message: m.error, kind: 'unknown' }
  }
}
