import { useEffect, useState } from 'react'
import { Archive, ChevronRight, ClipboardCopy, CopyPlus, Download, Eraser, FileJson, FileText, FileType, MoreHorizontal, Pencil, ScrollText, Star, Trash2 } from 'lucide-react'
import { useConversations } from '@/stores/conversationStore'
import { useUI } from '@/stores/uiStore'
import { ModelSelector } from './ModelSelector'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '@/components/ui/Menu'
import { ConfirmDialog, GlassDialog } from '@/components/ui/Dialog'
import { cn, copyToClipboard, downloadFile } from '@/lib/utils'
import { conversationToMarkdown, exportFilename, serializeConversation } from '@/services/exportImport'
import { toast } from '@/hooks/useToast'
import type { ExportFormat } from '@/types'
import { useSettings } from '@/stores/settingsStore'
import { useConnection } from '@/stores/connectionStore'

export function ChatHeader({ scrolled = false }: { scrolled?: boolean }) {
  const conv = useConversations((s) => s.conversations.find((c) => c.id === s.activeId))
  const setConversationModel = useConversations((s) => s.setConversationModel)
  const toggleFavorite = useConversations((s) => s.toggleFavorite)
  const toggleArchived = useConversations((s) => s.toggleArchived)
  const clearConversation = useConversations((s) => s.clearConversation)
  const duplicateConversation = useConversations((s) => s.duplicateConversation)
  const getConversationMessages = useConversations((s) => s.getConversationMessages)
  const setSystemPrompt = useConversations((s) => s.setSystemPrompt)
  const renameConversation = useConversations((s) => s.renameConversation)
  const requestDelete = useUI((s) => s.requestDelete)
  const defaultModel = useSettings((s) => s.defaultModel)
  const setSetting = useSettings((s) => s.set)
  const sysCap = useConnection((s) => s.capabilities.systemMessages)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sysOpen, setSysOpen] = useState(false)
  const [sysDraft, setSysDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => setRenaming(false), [conv?.id])

  const startRename = () => {
    if (!conv) return
    setTitleDraft(conv.title)
    setRenaming(true)
  }
  const commitRename = () => {
    if (conv && titleDraft.trim() && titleDraft.trim() !== conv.title) void renameConversation(conv.id, titleDraft)
    setRenaming(false)
  }

  const model = conv?.model ?? defaultModel

  const onModel = (id: string) => {
    if (conv) void setConversationModel(conv.id, id)
    else setSetting('defaultModel', id)
  }

  const exportAs = async (format: ExportFormat) => {
    if (!conv) return
    const messages = await getConversationMessages(conv.id)
    const { content, mime, ext } = serializeConversation(format, conv, messages)
    downloadFile(exportFilename(conv, ext), content, mime)
    toast.success('Export complete', `${conv.title} · ${ext.toUpperCase()}`)
  }

  return (
    <div
      className={cn(
        'relative z-(--z-panel) flex h-12 shrink-0 items-center justify-between gap-2 px-2 transition-[background-color,box-shadow] duration-(--duration-slow) ease-(--ease-standard) sm:px-4',
        scrolled ? 'bg-(--glass-md-bg) shadow-[0_1px_0_var(--line)] backdrop-blur-(--blur-md) backdrop-saturate-150' : 'bg-transparent',
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <ModelSelector value={model} onChange={onModel} side="bottom" />
        {conv && (
          <>
            <span className="hidden text-fg-subtle sm:inline">/</span>
            {renaming ? (
              <input
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                className="field field-sm h-8 w-[min(40vw,320px)] py-0 text-[13.5px]"
                aria-label="Conversation title"
              />
            ) : (
              <button
                className="hidden h-8 min-w-0 max-w-[30vw] truncate rounded-(--radius-sm) px-2 text-[13.5px] font-medium text-fg-muted transition-colors duration-(--duration-fast) hover:bg-(--hover) hover:text-fg sm:block"
                onClick={startRename}
                title="Rename conversation"
              >
                {conv.title}
              </button>
            )}
            {conv.systemPrompt && (
              <span className="pill hidden h-6 px-2 text-[11px] md:inline-flex" title="This conversation has system instructions">
                <ScrollText size={11} /> System
              </span>
            )}
          </>
        )}
      </div>

      {conv && (
        <div className="flex items-center gap-0.5">
          <button className="icon-btn" onClick={() => void toggleFavorite(conv.id)} aria-label={conv.favorite ? 'Remove favorite' : 'Add to favorites'} aria-pressed={conv.favorite}>
            <Star size={17} className={cn('star-toggle', conv.favorite && 'is-on fill-warning text-warning')} />
          </button>
          <Menu>
            <MenuTrigger asChild>
              <button className="icon-btn" aria-label="Conversation options">
                <MoreHorizontal size={18} />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<Pencil size={14} />} onSelect={() => setTimeout(startRename, 0)}>
                Rename
              </MenuItem>
              <MenuItem
                icon={<ScrollText size={14} />}
                onSelect={() => {
                  setSysDraft(conv.systemPrompt ?? '')
                  setSysOpen(true)
                }}
                disabled={sysCap === 'unsupported'}
              >
                System instructions
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
                  <MenuItem icon={<FileText size={14} />} onSelect={() => void exportAs('markdown')}>
                    Markdown (.md)
                  </MenuItem>
                  <MenuItem icon={<FileJson size={14} />} onSelect={() => void exportAs('json')}>
                    JSON (.json)
                  </MenuItem>
                  <MenuItem icon={<FileType size={14} />} onSelect={() => void exportAs('txt')}>
                    Plain text (.txt)
                  </MenuItem>
                </MenuSubContent>
              </MenuSub>
              <MenuItem
                icon={<CopyPlus size={14} />}
                onSelect={async () => {
                  const copy = await duplicateConversation(conv.id)
                  if (copy) toast.success('Conversation duplicated', copy.title)
                }}
              >
                Duplicate
              </MenuItem>
              <MenuItem
                icon={<ClipboardCopy size={14} />}
                onSelect={async () => {
                  const messages = await getConversationMessages(conv.id)
                  if (await copyToClipboard(conversationToMarkdown(conv, messages))) toast.success('Conversation copied', 'Formatted as Markdown — paste anywhere.')
                  else toast.error('Could not copy to clipboard')
                }}
              >
                Copy as Markdown
              </MenuItem>
              <MenuItem
                icon={<Archive size={14} />}
                onSelect={async () => {
                  await toggleArchived(conv.id)
                  toast.success('Conversation archived', 'Restore it anytime from the Archived view in the sidebar.')
                }}
              >
                Archive
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Eraser size={14} />} onSelect={() => setConfirmClear(true)}>
                Clear messages
              </MenuItem>
              <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => requestDelete(conv.id)}>
                Delete conversation
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this conversation?"
        description="All messages will be removed. The conversation itself stays in your list."
        confirmLabel="Clear"
        onConfirm={async () => {
          if (conv) await clearConversation(conv.id)
        }}
      />

      <GlassDialog open={sysOpen} onOpenChange={setSysOpen} title="System instructions" description="Sent as a system message at the start of every request in this conversation." size="md">
        <div className="px-6 pb-5">
          <textarea
            value={sysDraft}
            onChange={(e) => setSysDraft(e.target.value)}
            rows={6}
            placeholder="You are a helpful coding assistant…"
            className="field resize-y text-[14px] leading-relaxed"
            autoFocus
          />
          <p className="mt-2 text-[12px] text-fg-subtle">
            {sysCap === 'supported' ? 'Your Web2API server accepted system messages.' : 'Support depends on your Web2API version — if the server rejects it, GlassGem stops sending it automatically.'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setSysOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (conv) await setSystemPrompt(conv.id, sysDraft)
                setSysOpen(false)
                toast.success('System instructions saved')
              }}
            >
              Save
            </button>
          </div>
        </div>
      </GlassDialog>
    </div>
  )
}
