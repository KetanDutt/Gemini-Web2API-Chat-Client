import { useCallback, useMemo, useState } from 'react'
import { BookMarked, MessageSquareDashed, Plus, Search, SearchX, Star, X } from 'lucide-react'
import { useConversations } from '@/stores/conversationStore'
import { useUI } from '@/stores/uiStore'
import { ConversationItem } from './ConversationItem'
import { dateGroup, downloadFile, modKey, type DateGroup } from '@/lib/utils'
import type { Conversation, ExportFormat } from '@/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConversationSearch } from '@/hooks/useConversationSearch'
import { exportFilename, serializeConversation } from '@/services/exportImport'
import { toast } from '@/hooks/useToast'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/layout/Logo'

const GROUP_ORDER: DateGroup[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 Days', 'Older']

export function Sidebar({ onNavigate, isDrawer }: { onNavigate?: () => void; isDrawer?: boolean }) {
  const conversations = useConversations((s) => s.conversations)
  const activeId = useConversations((s) => s.activeId)
  const loaded = useConversations((s) => s.loaded)
  const setActive = useConversations((s) => s.setActive)
  const createConversation = useConversations((s) => s.createConversation)
  const renameConversation = useConversations((s) => s.renameConversation)
  const toggleFavorite = useConversations((s) => s.toggleFavorite)
  const togglePinned = useConversations((s) => s.togglePinned)
  const getConversationMessages = useConversations((s) => s.getConversationMessages)
  const requestDelete = useUI((s) => s.requestDelete)
  const renamingId = useUI((s) => s.renamingId)
  const setRenaming = useUI((s) => s.setRenaming)
  const openDialog = useUI((s) => s.openDialog)
  const setDrawerOpen = useUI((s) => s.setDrawerOpen)

  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const { results, query: activeQuery } = useConversationSearch(query)

  const grouped = useMemo(() => {
    const list = favoritesOnly ? conversations.filter((c) => c.favorite) : conversations
    const groups = new Map<DateGroup, Conversation[]>()
    for (const c of list) {
      if (c.archived) continue
      const g: DateGroup = c.pinned ? 'Pinned' : dateGroup(c.updatedAt)
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(c)
    }
    return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g)! }))
  }, [conversations, favoritesOnly])

  const handleSelect = useCallback(
    (id: string) => {
      void setActive(id)
      onNavigate?.()
    },
    [setActive, onNavigate],
  )

  const handleExport = useCallback(
    async (id: string, format: ExportFormat) => {
      const conv = useConversations.getState().conversations.find((c) => c.id === id)
      if (!conv) return
      const messages = await getConversationMessages(id)
      const { content, mime, ext } = serializeConversation(format, conv, messages)
      downloadFile(exportFilename(conv, ext), content, mime)
      toast.success('Export complete', `${conv.title} · ${ext.toUpperCase()}`)
    },
    [getConversationMessages],
  )

  const handleNew = async () => {
    await createConversation()
    onNavigate?.()
  }

  const showingSearch = activeQuery.length > 0
  const mod = modKey()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        {isDrawer ? (
          <>
            <Logo />
            <button className="icon-btn icon-btn-sm" onClick={() => setDrawerOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </>
        ) : (
          <span className="eyebrow px-1">Conversations</span>
        )}
      </div>

      <div className="px-3">
        <Tooltip content="New chat" shortcut={`${mod}+N`} side="right">
          <button className="btn btn-primary btn-lg h-10 w-full justify-start rounded-(--radius-md) px-3.5" onClick={() => void handleNew()}>
            <Plus size={17} strokeWidth={2.2} />
            <span>New Chat</span>
          </button>
        </Tooltip>

        <div className="relative mt-2.5">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search conversations"
            className="field h-9 rounded-(--radius-sm) py-0 pl-9 pr-8 text-[13.5px]"
          />
          {query && (
            <button className="icon-btn icon-btn-xs enter-pop absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <button className={cn('pill pill-interactive', favoritesOnly && 'pill-on')} onClick={() => setFavoritesOnly((v) => !v)} aria-pressed={favoritesOnly}>
            <Star size={12} className={cn('star-toggle', favoritesOnly && 'is-on fill-warning text-warning')} /> Favorites
          </button>
          <button className="pill pill-interactive" onClick={() => openDialog('prompts')}>
            <BookMarked size={12} /> Prompts
          </button>
        </div>
      </div>

      <nav className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversation list">
        {!loaded ? (
          <div className="enter-fade space-y-1 px-1 pt-2" role="status" aria-label="Loading conversations">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5 px-2 py-2" style={{ opacity: 1 - i * 0.16 }}>
                <div className="skeleton h-3.5" style={{ width: `${62 + ((i * 23) % 30)}%` }} />
                <div className="skeleton h-3 w-[40%]" />
              </div>
            ))}
          </div>
        ) : showingSearch ? (
          results.length === 0 ? (
            <EmptyState compact icon={<SearchX size={18} />} title="No matches" description={`Nothing in your conversations mentions “${activeQuery}”.`} />
          ) : (
            <div className="space-y-0.5">
              <p className="eyebrow px-2.5 pb-1 pt-2">
                {results.length} result{results.length === 1 ? '' : 's'}
              </p>
              {results.map((r) => (
                <ConversationItem
                  key={r.conversation.id}
                  conversation={r.conversation}
                  active={r.conversation.id === activeId}
                  renaming={renamingId === r.conversation.id}
                  query={activeQuery}
                  snippet={r.snippet}
                  onSelect={handleSelect}
                  onRename={renameConversation}
                  onStartRename={setRenaming}
                  onFavorite={toggleFavorite}
                  onPin={togglePinned}
                  onDelete={requestDelete}
                  onExport={handleExport}
                />
              ))}
            </div>
          )
        ) : grouped.length === 0 ? (
          favoritesOnly ? (
            <EmptyState
              compact
              icon={<Star size={18} />}
              title="No favorites yet"
              description="Star a conversation from its menu to keep it close."
              action={
                <button className="btn btn-secondary btn-sm" onClick={() => setFavoritesOnly(false)}>
                  Show all
                </button>
              }
            />
          ) : (
            <EmptyState
              compact
              icon={<MessageSquareDashed size={18} />}
              title="No conversations yet"
              description="Start a new chat and it will appear here — saved locally, always."
              action={
                <button className="btn btn-secondary btn-sm" onClick={() => void handleNew()}>
                  <Plus size={14} /> New chat
                </button>
              }
            />
          )
        ) : (
          grouped.map(({ group, items }) => (
            <section key={group} className="mb-2">
              <h3 className="eyebrow sticky top-0 z-(--z-content) px-2.5 pb-1 pt-2 backdrop-blur-(--blur-sm)">{group}</h3>
              <div className="space-y-0.5">
                {items.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    renaming={renamingId === c.id}
                    onSelect={handleSelect}
                    onRename={renameConversation}
                    onStartRename={setRenaming}
                    onFavorite={toggleFavorite}
                    onPin={togglePinned}
                    onDelete={requestDelete}
                    onExport={handleExport}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </nav>
    </div>
  )
}
