/**
 * Per-conversation composer drafts (text only), persisted to localStorage so
 * an accidental reload or app restart never loses half-typed messages.
 *
 * Image attachments are deliberately NOT persisted: their data: URLs can be
 * megabytes each and would blow through the localStorage quota. They stay in
 * a runtime-only map keyed by conversation id (attachments survive app-level
 * navigation and conversation switches, just not a reload).
 */
const STORAGE_KEY = 'glassgem.drafts'
/** Hard cap so long-used profiles never bloat localStorage. */
const MAX_ENTRIES = 200

let cache: Map<string, string> | null = null

function load(): Map<string, string> {
  if (cache) return cache
  cache = new Map()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const [id, text] of Object.entries(parsed)) {
        if (typeof id === 'string' && typeof text === 'string' && text) cache.set(id, text)
      }
    }
  } catch {
    /* corrupted storage — start empty */
  }
  return cache
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function schedulePersist() {
  // Writes are debounced: typing produces far more changes than we need to save.
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    try {
      const map = load()
      // Insertion order is oldest → newest; drop the oldest when over the cap.
      while (map.size > MAX_ENTRIES) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)))
    } catch {
      /* quota or private mode — drafts simply stay in memory */
    }
  }, 400)
}

export function getDraft(conversationId: string): string {
  return load().get(conversationId) ?? ''
}

export function setDraft(conversationId: string, text: string) {
  const map = load()
  if (text) {
    // Re-insert so recently edited drafts sort newest-last for the cap prune.
    map.delete(conversationId)
    map.set(conversationId, text)
  } else {
    map.delete(conversationId)
  }
  schedulePersist()
}

export function deleteDraft(conversationId: string) {
  setDraft(conversationId, '')
}

/* ---------------- attachments (runtime only) ---------------- */

const attachmentDrafts = new Map<string, unknown[]>()

export function getAttachmentDraft<T>(conversationId: string): T[] {
  return (attachmentDrafts.get(conversationId) as T[] | undefined) ?? []
}

export function setAttachmentDraft<T>(conversationId: string, items: T[]) {
  if (items.length) attachmentDrafts.set(conversationId, items)
  else attachmentDrafts.delete(conversationId)
}
