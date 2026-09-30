import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Archive, ArchiveRestore, ChevronRight, CopyPlus, Download, MoreHorizontal, Pencil, Pin, PinOff, Star, Trash2, FileJson, FileText, FileType } from 'lucide-react'
import { cn, formatRelative } from '@/lib/utils'
import type { Conversation } from '@/types'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '@/components/ui/Menu'
import { Highlight } from '@/hooks/useConversationSearch'

interface Props {
  conversation: Conversation
  active: boolean
  renaming: boolean
  generating?: boolean
  query?: string
  snippet?: string
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onStartRename: (id: string | null) => void
  onFavorite: (id: string) => void
  onPin: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onExport: (id: string, format: 'json' | 'markdown' | 'txt') => void
}

export const ConversationItem = memo(function ConversationItem({ conversation: c, active, renaming, generating, query, snippet, onSelect, onRename, onStartRename, onFavorite, onPin, onArchive, onDelete, onDuplicate, onExport }: Props) {
  const [draft, setDraft] = useState(c.title)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) {
      setDraft(c.title)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [renaming, c.title])

  const commit = () => {
    if (draft.trim() && draft.trim() !== c.title) onRename(c.id, draft)
    onStartRename(null)
  }

  return (
    <div
      className={cn(
        'group relative flex items-start gap-2 rounded-(--radius-md) px-2.5 transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        !active && 'hover:bg-(--hover)',
      )}
      style={{ paddingTop: 'var(--sidebar-item-py)', paddingBottom: 'var(--sidebar-item-py)' }}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          aria-hidden
          className="absolute inset-0 rounded-(--radius-md) bg-surface-3 shadow-[inset_0_0_0_1px_var(--glass-edge),var(--shadow-sm)]"
          transition={{ type: 'spring', stiffness: 520, damping: 44, mass: 0.7 }}
        />
      )}
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') onStartRename(null)
            e.stopPropagation()
          }}
          className="field field-sm relative z-1 h-8 py-0 text-[13.5px]"
          aria-label="Rename conversation"
        />
      ) : (
        <button
          className="relative z-1 min-w-0 flex-1 rounded-(--radius-sm) text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onSelect(c.id)}
          onDoubleClick={() => onStartRename(c.id)}
          aria-current={active ? 'page' : undefined}
        >
          <div className="flex items-center gap-1.5">
            {c.pinned && <Pin size={11} className="shrink-0 text-accent" aria-label="Pinned" />}
            {c.favorite && <Star size={11} className="shrink-0 fill-warning text-warning" aria-label="Favorite" />}
            {c.archived && <Archive size={11} className="shrink-0 text-fg-subtle" aria-label="Archived" />}
            <span className={cn('truncate text-[13.5px] leading-5', active ? 'font-semibold text-fg' : 'font-medium text-fg/90')}>{query ? <Highlight text={c.title} query={query} /> : c.title}</span>
            {generating && <span className="generating-dot shrink-0" role="status" aria-label="Generating response" title="Generating response…" />}
          </div>
          {(snippet || c.preview) && (
            <p className="mt-0.5 truncate text-[12px] leading-4 text-fg-subtle">
              {snippet && query ? <Highlight text={snippet} query={query} /> : c.preview}
            </p>
          )}
          <p className="mt-0.5 text-[11px] leading-4 text-fg-subtle/80">{formatRelative(c.updatedAt)}</p>
        </button>
      )}

      {!renaming && (
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger asChild>
            <button
              className={cn('icon-btn icon-btn-sm relative z-1 -mr-1 mt-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100', (active || menuOpen) && 'opacity-100')}
              aria-label={`Options for ${c.title}`}
            >
              <MoreHorizontal size={16} />
            </button>
          </MenuTrigger>
          <MenuContent align="start" side="right">
            <MenuItem icon={<Pencil size={14} />} onSelect={() => onStartRename(c.id)}>
              Rename
            </MenuItem>
            <MenuItem icon={<Star size={14} className={c.favorite ? 'fill-warning text-warning' : ''} />} onSelect={() => onFavorite(c.id)}>
              {c.favorite ? 'Remove favorite' : 'Add to favorites'}
            </MenuItem>
            <MenuItem icon={c.pinned ? <PinOff size={14} /> : <Pin size={14} />} onSelect={() => onPin(c.id)}>
              {c.pinned ? 'Unpin' : 'Pin to top'}
            </MenuItem>
            <MenuItem icon={c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} onSelect={() => onArchive(c.id)}>
              {c.archived ? 'Unarchive' : 'Archive'}
            </MenuItem>
            <MenuSub>
              <MenuSubTrigger>
                <span className="flex w-4 items-center justify-center text-fg-muted">
                  <Download size={14} />
                </span>
                <span className="flex-1">Export</span>
                <ChevronRight size={14} className="text-fg-subtle" />
              </MenuSubTrigger>
              <MenuSubContent>
                <MenuItem icon={<FileText size={14} />} onSelect={() => onExport(c.id, 'markdown')}>
                  Markdown (.md)
                </MenuItem>
                <MenuItem icon={<FileJson size={14} />} onSelect={() => onExport(c.id, 'json')}>
                  JSON (.json)
                </MenuItem>
                <MenuItem icon={<FileType size={14} />} onSelect={() => onExport(c.id, 'txt')}>
                  Plain text (.txt)
                </MenuItem>
              </MenuSubContent>
            </MenuSub>
            <MenuItem icon={<CopyPlus size={14} />} onSelect={() => onDuplicate(c.id)}>
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => onDelete(c.id)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </div>
  )
})
