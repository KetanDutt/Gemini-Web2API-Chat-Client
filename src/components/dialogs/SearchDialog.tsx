import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, MessageSquare, Plus, Search, SearchX, Settings, Star } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useUI } from '@/stores/uiStore'
import { useConversations } from '@/stores/conversationStore'
import { Highlight, useConversationSearch } from '@/hooks/useConversationSearch'
import { cn, formatRelative } from '@/lib/utils'
import { GemMark } from '@/components/layout/Logo'

type Item = { id: string; kind: 'conv' | 'action'; label: string; run: () => void; snippet?: string; time?: number; favorite?: boolean; icon?: React.ReactNode }

export function SearchDialog() {
  const open = useUI((s) => s.dialog === 'search')
  const closeDialog = useUI((s) => s.closeDialog)
  const openDialog = useUI((s) => s.openDialog)
  const setActive = useConversations((s) => s.setActive)
  const createConversation = useConversations((s) => s.createConversation)
  const conversations = useConversations((s) => s.conversations)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const { results, searching, query } = useConversationSearch(q, 30)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIndex(0)
    }
  }, [open])

  const go = (id: string) => {
    void setActive(id)
    closeDialog()
  }

  const items: Item[] = query
    ? results.map((r) => ({ id: r.conversation.id, kind: 'conv' as const, label: r.conversation.title, snippet: r.snippet ?? r.conversation.preview, time: r.conversation.updatedAt, favorite: r.conversation.favorite, run: () => go(r.conversation.id) }))
    : [
        { id: 'new', kind: 'action' as const, label: 'New chat', icon: <Plus size={15} />, run: () => { void createConversation(); closeDialog() } },
        { id: 'settings', kind: 'action' as const, label: 'Open settings', icon: <Settings size={15} />, run: () => openDialog('settings') },
        ...conversations.slice(0, 8).map((c) => ({ id: c.id, kind: 'conv' as const, label: c.title, snippet: c.preview, time: c.updatedAt, favorite: c.favorite, run: () => go(c.id) })),
      ]

  useEffect(() => setIndex(0), [query, items.length])
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[index]?.run()
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="motion-fade fixed inset-0 z-(--z-dialog) bg-(--scrim) backdrop-blur-[3px]" />
        <DialogPrimitive.Content className="glass-lg motion-palette fixed left-1/2 top-[12vh] z-(--z-dialog) w-[calc(100vw-20px)] max-w-xl overflow-hidden rounded-(--radius-xl) outline-none" onKeyDown={onKey}>
          <DialogPrimitive.Title className="sr-only">Search conversations</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Type to search titles and message content</DialogPrimitive.Description>
          <div className="relative z-1 flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations and messages…"
              className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-fg-subtle"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="search-results"
              aria-activedescendant={items[index] ? `search-item-${items[index].id}` : undefined}
            />
            <kbd className="kbd">Esc</kbd>
          </div>
          <div ref={listRef} id="search-results" role="listbox" className="relative z-1 max-h-[50vh] overflow-y-auto p-2">
            {!query && <p className="eyebrow px-3 pb-1 pt-1.5">Quick actions & recent</p>}
            {query && items.length === 0 && !searching && (
              <div className="enter-rise flex flex-col items-center py-10 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-(--radius-md) bg-surface text-fg-muted shadow-[inset_0_0_0_1px_var(--line)]">
                  <SearchX size={18} />
                </span>
                <p className="text-[14px] font-semibold tracking-tight">No results for “{query}”</p>
                <p className="mt-1 text-[12.5px] text-fg-muted">Try a different word, or start a new chat about it.</p>
                <button className="btn btn-secondary btn-sm mt-4" onClick={() => { void createConversation(); useUI.getState().insertIntoComposer(query); closeDialog() }}>
                  <Plus size={13} /> New chat about “{query.slice(0, 24)}”
                </button>
              </div>
            )}
            {items.map((it, i) => (
              <button
                key={it.id}
                id={`search-item-${it.id}`}
                data-index={i}
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={it.run}
                className={cn('flex w-full items-center gap-3 rounded-(--radius-md) px-3 py-2.5 text-left transition-colors duration-(--duration-fast)', i === index ? 'bg-(--active)' : 'hover:bg-(--hover)')}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) bg-surface text-fg-muted shadow-[inset_0_0_0_1px_var(--line)]">
                  {it.kind === 'action' ? it.icon : it.favorite ? <Star size={14} className="fill-warning text-warning" /> : <MessageSquare size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{query ? <Highlight text={it.label} query={query} /> : it.label}</span>
                  {it.snippet && <span className="block truncate text-[12px] text-fg-subtle">{query ? <Highlight text={it.snippet} query={query} /> : it.snippet}</span>}
                </span>
                {it.time && <span className="shrink-0 text-[11px] text-fg-subtle">{formatRelative(it.time)}</span>}
                {i === index && <CornerDownLeft size={13} className="shrink-0 text-fg-subtle" />}
              </button>
            ))}
          </div>
          <div className="relative z-1 flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
            <GemMark size={12} />
            <span>
              <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigate
            </span>
            <span>
              <kbd className="kbd">↵</kbd> open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
