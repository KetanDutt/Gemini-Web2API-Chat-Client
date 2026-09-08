import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(prefix = ''): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${id}` : id
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = now - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  return formatDate(ts)
}

export function formatLatency(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export type DateGroup = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older'

export function dateGroup(ts: number, now = Date.now()): DateGroup {
  const today = startOfDay(now)
  if (ts >= today) return 'Today'
  if (ts >= today - 86400000) return 'Yesterday'
  if (ts >= today - 7 * 86400000) return 'Previous 7 Days'
  return 'Older'
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'about', 'me', 'my', 'i',
  'you', 'your', 'can', 'could', 'would', 'should', 'please', 'help', 'is', 'are', 'was', 'do', 'does',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'that', 'this', 'it', 'be', 'at', 'as', 'by',
  'from', 'into', 'if', 'so', 'some', 'tell', 'give', 'write', 'explain', 'describe', 'show',
])

/**
 * Builds a short human-friendly conversation title from the first user message
 * without making any API request.
 */
export function titleFromMessage(text: string): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_>~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return 'New Chat'

  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean
  const words = firstSentence.split(' ')
  const meaningful = words.filter((w) => !STOPWORDS.has(w.toLowerCase().replace(/[^a-z0-9]/gi, '')))
  const source = meaningful.length >= 2 ? meaningful : words
  const picked = source.slice(0, 6).map((w) => w.replace(/[?!.,;:]+$/g, ''))
  let title = picked
    .map((w, i) => (i === 0 || w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
  const lower = firstSentence.toLowerCase()
  if (/^(explain|how does|how do|what is|what are|describe)/.test(lower) && !/explained$/i.test(title)) {
    title = `${title} Explained`
  }
  if (title.length > 48) title = title.slice(0, 45).trimEnd() + '…'
  return title || 'New Chat'
}

export function previewFromContent(content: string, max = 80): string {
  const text = content
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/[#*_>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Mac/.test(navigator.userAgent)
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const debounced = (...args: Parameters<T>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => t && clearTimeout(t)
  return debounced
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall back */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'conversation'
}

export function modelLabel(id: string): string {
  if (!id) return 'No model'
  return id
    .replace(/^models\//, '')
    .split(/[-_]/)
    .map((p) => {
      if (/^\d/.test(p)) return p
      if (p.length <= 3) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' ')
    .replace(/\bGemini\b/i, 'Gemini')
}

export function pluralize(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}
