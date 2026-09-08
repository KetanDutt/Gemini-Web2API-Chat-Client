import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/db'
import { useConversations } from '@/stores/conversationStore'
import type { Conversation } from '@/types'

export interface SearchHit {
  conversation: Conversation
  /** Matching message snippet (if the match was in message content). */
  snippet?: string
  messageId?: string
  titleMatch: boolean
}

export function useDebouncedValue<T>(value: T, delay = 150): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/**
 * Instant local search across titles and message content.
 * Title matching is synchronous; content matching queries IndexedDB.
 */
export function useConversationSearch(query: string, limit = 50) {
  const conversations = useConversations((s) => s.conversations)
  const debounced = useDebouncedValue(query.trim(), 120)
  const [contentHits, setContentHits] = useState<Map<string, { snippet: string; messageId: string }>>(new Map())
  const [searching, setSearching] = useState(false)

  const q = debounced.toLowerCase()

  useEffect(() => {
    if (q.length < 2) {
      setContentHits(new Map())
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    ;(async () => {
      const hits = new Map<string, { snippet: string; messageId: string }>()
      let scanned = 0
      await db.messages
        .orderBy('createdAt')
        .reverse()
        .until(() => cancelled || hits.size >= limit || scanned > 20000)
        .each((m) => {
          scanned++
          if (hits.has(m.conversationId)) return
          const idx = m.content.toLowerCase().indexOf(q)
          if (idx === -1) return
          const start = Math.max(0, idx - 40)
          const end = Math.min(m.content.length, idx + q.length + 60)
          const snippet = (start > 0 ? '…' : '') + m.content.slice(start, end).replace(/\s+/g, ' ') + (end < m.content.length ? '…' : '')
          hits.set(m.conversationId, { snippet, messageId: m.id })
        })
      if (!cancelled) {
        setContentHits(hits)
        setSearching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [q, limit])

  const results = useMemo<SearchHit[]>(() => {
    if (!q) return []
    const out: SearchHit[] = []
    for (const c of conversations) {
      const titleMatch = c.title.toLowerCase().includes(q)
      const hit = contentHits.get(c.id)
      if (titleMatch || hit) out.push({ conversation: c, titleMatch, snippet: hit?.snippet, messageId: hit?.messageId })
    }
    return out.slice(0, limit)
  }, [q, conversations, contentHits, limit])

  return { results, searching, query: debounced }
}

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-hit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}
