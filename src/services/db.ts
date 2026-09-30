import Dexie, { type EntityTable } from 'dexie'
import type { Conversation, Message, SavedPrompt } from '@/types'

/**
 * IndexedDB persistence via Dexie. Everything stays on this machine.
 */
export class GlassGemDB extends Dexie {
  conversations!: EntityTable<Conversation, 'id'>
  messages!: EntityTable<Message, 'id'>
  prompts!: EntityTable<SavedPrompt, 'id'>

  constructor() {
    super('glassgem')
    this.version(1).stores({
      conversations: 'id, updatedAt, createdAt, favorite, archived, title',
      messages: 'id, conversationId, [conversationId+order], createdAt',
      prompts: 'id, category, favorite, updatedAt',
    })
    // v2: index `status` so in-flight ("pending"/"streaming") messages can be
    // found cheaply at startup and reaped after a crash or reload. No shape
    // change — Dexie backfills the new index automatically on upgrade.
    this.version(2).stores({
      conversations: 'id, updatedAt, createdAt, favorite, archived, title',
      messages: 'id, conversationId, [conversationId+order], createdAt, status',
      prompts: 'id, category, favorite, updatedAt',
    })
  }
}

export const db = new GlassGemDB()

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
    }
  } catch {
    /* ignore */
  }
  return null
}
