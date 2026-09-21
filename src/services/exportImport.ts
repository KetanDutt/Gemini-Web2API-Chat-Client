import type { Attachment, Conversation, ExportFormat, GlassGemExport, GlassGemExportConversation, Message, SavedPrompt } from '@/types'
import { formatBytes, formatDateTime, safeFilename, uid } from '@/lib/utils'
import { stripElicitations } from '@/lib/elicitations'
import { DEFAULT_MODEL } from './geminiWebApi'

const ROLE_LABEL: Record<string, string> = { user: 'User', assistant: 'Gemini', system: 'System' }

function attachmentLine(m: Message): string | undefined {
  if (!m.attachments?.length) return undefined
  return m.attachments.map((a) => (a.size > 0 ? `[image: ${a.name} · ${formatBytes(a.size)}]` : `[image: ${a.name}]`)).join('  ')
}

function activeContent(m: Message): string {
  if (m.versions?.length && m.activeVersion != null) {
    return m.versions[m.activeVersion]?.content ?? m.content
  }
  return m.content
}

function usageSummary(messages: Message[]) {
  let prompt = 0
  let completion = 0
  let total = 0
  for (const m of messages) {
    const u = m.usage
    if (!u) continue
    prompt += u.prompt_tokens ?? 0
    completion += u.completion_tokens ?? 0
    total += u.total_tokens ?? 0
  }
  return { prompt, completion, total }
}

export function conversationToMarkdown(conversation: Conversation, messages: Message[]): string {
  const lines: string[] = [`# ${conversation.title}`, '']
  if (conversation.systemPrompt) {
    lines.push('## System', '', conversation.systemPrompt, '')
  }
  for (const m of messages) {
    if (m.role === 'system') continue
    const body = [stripElicitations(activeContent(m)), attachmentLine(m)].filter(Boolean).join('\n\n')
    lines.push(`## ${ROLE_LABEL[m.role] ?? m.role}`, '', body, '')
  }
  const u = usageSummary(messages)
  lines.push('---', '', `**Model:** ${conversation.model}  `, `**Date:** ${formatDateTime(conversation.createdAt)}  `)
  if (u.total > 0) lines.push(`**Usage:** ${u.total.toLocaleString()} tokens (prompt ${u.prompt.toLocaleString()}, completion ${u.completion.toLocaleString()})  `)
  lines.push(`**Exported from GlassGem:** ${formatDateTime(Date.now())}`, '')
  return lines.join('\n')
}

export function conversationToText(conversation: Conversation, messages: Message[]): string {
  const lines: string[] = [conversation.title, '='.repeat(Math.min(conversation.title.length, 60)), '']
  for (const m of messages) {
    if (m.role === 'system') continue
    const att = attachmentLine(m)
    lines.push(`${ROLE_LABEL[m.role] ?? m.role} (${formatDateTime(m.createdAt)}):`, stripElicitations(activeContent(m)), ...(att ? [att] : []), '')
  }
  const u = usageSummary(messages)
  lines.push('---', `Model: ${conversation.model}`, `Date: ${formatDateTime(conversation.createdAt)}`)
  if (u.total > 0) lines.push(`Usage: ${u.total} tokens`)
  return lines.join('\n')
}

export function buildExport(items: GlassGemExportConversation[], prompts?: SavedPrompt[]): GlassGemExport {
  return {
    app: 'GlassGem',
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: items,
    ...(prompts?.length ? { prompts } : {}),
  }
}

export function serializeConversation(format: ExportFormat, conversation: Conversation, messages: Message[]): { content: string; mime: string; ext: string } {
  switch (format) {
    case 'markdown':
      return { content: conversationToMarkdown(conversation, messages), mime: 'text/markdown', ext: 'md' }
    case 'txt':
      return { content: conversationToText(conversation, messages), mime: 'text/plain', ext: 'txt' }
    case 'json':
    default:
      return { content: JSON.stringify(buildExport([{ conversation, messages }]), null, 2), mime: 'application/json', ext: 'json' }
  }
}

export function exportFilename(conversation: Conversation, ext: string) {
  return `${safeFilename(conversation.title)}.${ext}`
}

/* ------------------------------------------------------------------ */
/*  Import validation                                                  */
/* ------------------------------------------------------------------ */

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback)

function sanitizeMessage(raw: unknown, conversationId: string, order: number): Message | null {
  if (!isObj(raw)) return null
  const role = raw.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null
  const content = str(raw.content)
  const now = Date.now()
  const msg: Message = {
    id: uid('msg'),
    conversationId,
    role,
    content,
    createdAt: num(raw.createdAt, now),
    status: 'complete',
    order,
  }
  if (typeof raw.model === 'string') msg.model = raw.model
  if (isObj(raw.usage)) {
    msg.usage = {
      prompt_tokens: typeof raw.usage.prompt_tokens === 'number' ? raw.usage.prompt_tokens : undefined,
      completion_tokens: typeof raw.usage.completion_tokens === 'number' ? raw.usage.completion_tokens : undefined,
      total_tokens: typeof raw.usage.total_tokens === 'number' ? raw.usage.total_tokens : undefined,
    }
  }
  if (typeof raw.latencyMs === 'number') msg.latencyMs = raw.latencyMs
  if (Array.isArray(raw.attachments)) {
    const attachments = raw.attachments.filter(isObj).slice(0, 8).flatMap((a) => {
      const name = str(a.name).trim()
      if (!name) return []
      // A data URL that is not an image data URL would be unsafe to render - drop the whole attachment.
      if (typeof a.dataUrl === 'string' && !a.dataUrl.startsWith('data:image/')) return []
      const dataUrl = typeof a.dataUrl === 'string' ? a.dataUrl : undefined
      const attachment: Attachment = {
        id: uid('att'),
        name: name.slice(0, 200),
        mimeType: typeof a.mimeType === 'string' && a.mimeType.startsWith('image/') ? a.mimeType.slice(0, 100) : 'image/png',
        size: num(a.size, 0),
        ...(dataUrl ? { dataUrl } : {}),
      }
      return [attachment]
    })
    if (attachments.length) msg.attachments = attachments
  }
  if (Array.isArray(raw.versions)) {
    const versions = raw.versions
      .filter(isObj)
      .map((v) => ({
        id: uid('ver'),
        content: str(v.content),
        createdAt: num(v.createdAt, msg.createdAt),
        model: typeof v.model === 'string' ? v.model : undefined,
        status: 'complete' as const,
      }))
    if (versions.length) {
      msg.versions = versions
      msg.activeVersion = Math.min(Math.max(0, num(raw.activeVersion, versions.length - 1)), versions.length - 1)
      msg.content = versions[msg.activeVersion]?.content ?? msg.content
    }
  }
  return msg
}

function sanitizeConversationItem(raw: unknown, index: number): GlassGemExportConversation {
  if (!isObj(raw)) throw new ImportError(`Conversation #${index + 1} is not an object.`)
  const c = isObj(raw.conversation) ? raw.conversation : raw
  const rawMessages = Array.isArray(raw.messages) ? raw.messages : []
  const id = uid('conv')
  const now = Date.now()
  const messages = rawMessages
    .map((m, i) => sanitizeMessage(m, id, i))
    .filter((m): m is Message => !!m)
    .map((m, i) => ({ ...m, order: i }))
  const title = str(c.title).trim() || `Imported conversation ${index + 1}`
  const conversation: Conversation = {
    id,
    title: title.slice(0, 120),
    createdAt: num(c.createdAt, now),
    updatedAt: num(c.updatedAt, num(c.createdAt, now)),
    model: str(c.model, DEFAULT_MODEL),
    favorite: bool(c.favorite),
    archived: bool(c.archived),
    pinned: bool(c.pinned),
    systemPrompt: typeof c.systemPrompt === 'string' ? c.systemPrompt : undefined,
    messageCount: messages.length,
    titleEdited: true,
  }
  return { conversation, messages }
}

/**
 * Parses and validates a GlassGem export. Also accepts a bare single
 * `{conversation, messages}` object and (best-effort) OpenAI-style
 * `{messages:[...]}` transcripts.
 */
export function parseImport(text: string): { conversations: GlassGemExportConversation[]; prompts: SavedPrompt[] } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ImportError('The file is not valid JSON. Only GlassGem JSON exports can be imported.')
  }
  if (!isObj(data)) throw new ImportError('The JSON file must contain an object.')

  let items: unknown[]
  if (Array.isArray(data.conversations)) items = data.conversations
  else if (isObj(data.conversation) || Array.isArray(data.messages)) items = [data]
  else throw new ImportError('No conversations found. Expected a GlassGem export with a "conversations" array.')

  if (items.length === 0) throw new ImportError('The export contains no conversations.')
  if (items.length > 5000) throw new ImportError('The export contains too many conversations to import at once.')

  const conversations = items.map((raw, i) => sanitizeConversationItem(raw, i))

  const prompts: SavedPrompt[] = Array.isArray(data.prompts)
    ? data.prompts.filter(isObj).flatMap((p) => {
        const textValue = str(p.text).trim()
        if (!textValue) return []
        const category = str(p.category, 'Personal') as SavedPrompt['category']
        return [
          {
            id: uid('prompt'),
            name: str(p.name, 'Untitled prompt').slice(0, 80),
            description: typeof p.description === 'string' ? p.description.slice(0, 200) : undefined,
            text: textValue,
            category: ['Coding', 'Writing', 'Research', 'Business', 'Learning', 'Personal'].includes(category) ? category : 'Personal',
            favorite: bool(p.favorite),
            createdAt: num(p.createdAt, Date.now()),
            updatedAt: num(p.updatedAt, Date.now()),
          },
        ]
      })
    : []

  return { conversations, prompts }
}
