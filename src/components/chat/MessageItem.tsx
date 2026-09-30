import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { AlertTriangle, ArrowDownToLine, Check, ChevronLeft, ChevronRight, Copy, Download, FileText, MoreHorizontal, Paperclip, Pencil, RefreshCw, Settings2, Sparkles, Trash2, Bug } from 'lucide-react'
import type { Message } from '@/types'
import { cn, copyToClipboard, downloadFile, formatLatency, formatTime, modelLabel, timestampSlug } from '@/lib/utils'
import { parseElicitations } from '@/lib/elicitations'
import { Markdown } from './Markdown'
import { GemMark } from '@/components/layout/Logo'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Tooltip'
import { ThinkingIndicator } from '@/components/ui/ThinkingIndicator'
import { useStreamingText } from '@/stores/streamingStore'
import { parseMessageError, useConversations } from '@/stores/conversationStore'
import { useUI } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'

interface Props {
  message: Message
  showTimestamps: boolean
  showUsage: boolean
  showLatency: boolean
  isLast: boolean
  generating: boolean
}

export const MessageItem = memo(function MessageItem(props: Props) {
  return props.message.role === 'user' ? <UserMessage {...props} /> : <AssistantMessage {...props} />
})

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async (text: string, label = 'Copied') => {
    if (await copyToClipboard(text)) {
      setCopied(true)
      toast.success(label)
      setTimeout(() => setCopied(false), 1500)
    } else toast.error('Could not copy to clipboard')
  }, [])
  return { copied, copy }
}

/** Copy → check morph: the two glyphs cross-fade and scale in place. */
function CopyIcon({ copied }: { copied: boolean }) {
  return (
    <span className="icon-swap" aria-hidden>
      <Copy size={14} className={copied ? 'hidden-icon' : 'shown-icon'} />
      <Check size={14} className={cn('text-success', copied ? 'shown-icon' : 'hidden-icon')} />
    </span>
  )
}

function toPlainText(md: string) {
  return md
    .replace(/```[\w-]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

/* ------------------------------------------------------------------ */
/*  User                                                               */
/* ------------------------------------------------------------------ */

function UserMessage({ message, showTimestamps, generating }: Props) {
  const editingId = useConversations((s) => s.editingMessageId)
  const setEditing = useConversations((s) => s.setEditing)
  const editAndResend = useConversations((s) => s.editAndResend)
  const deleteMessage = useConversations((s) => s.deleteMessage)
  const { copied, copy } = useCopy()
  const editing = editingId === message.id
  const [draft, setDraft] = useState(message.content)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(message.content)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`
        el.setSelectionRange(el.value.length, el.value.length)
      })
    }
  }, [editing, message.content])

  const submit = () => {
    if (!draft.trim() || draft.trim() === message.content) {
      setEditing(null)
      return
    }
    void editAndResend(message.id, draft)
  }

  return (
    <article className="group flex flex-col items-end" aria-label="Your message">
      {editing ? (
        <div className="glass-md enter-pop w-full max-w-[720px] rounded-(--radius-xl) p-2 sm:w-[85%]">
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') setEditing(null)
            }}
            className="relative z-1 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed outline-none"
            rows={1}
            aria-label="Edit message"
          />
          <div className="relative z-1 flex items-center justify-between px-1.5 pb-1">
            <span className="text-[12px] text-fg-subtle">Messages after this one will be replaced.</span>
            <div className="flex gap-1.5">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={submit} disabled={!draft.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative max-w-[85%] rounded-(--radius-xl) rounded-br-(--radius-xs) px-4 py-2.5 text-[15px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_24px_-12px_var(--accent-ring)] sm:max-w-[72%]"
          style={{ background: 'var(--user-bubble)', color: 'var(--user-bubble-fg)', fontSize: 'var(--msg-font-size)' }}
        >
          {message.attachments?.length ? (
            <div className={cn('flex flex-wrap gap-1.5', message.content.trim() && 'mb-2')}>
              {message.attachments.map((a) =>
                a.dataUrl ? (
                  <a key={a.id} href={a.dataUrl} target="_blank" rel="noreferrer noopener" title={`${a.name} · open full size`} className="block">
                    <img src={a.dataUrl} alt={a.name} className="max-h-56 max-w-full rounded-(--radius-sm) object-contain" />
                  </a>
                ) : (
                  <span key={a.id} className="flex items-center gap-1.5 rounded-(--radius-sm) bg-(--hover) px-2 py-1 text-[12px]" title={a.name}>
                    <Paperclip size={12} /> {a.name}
                  </span>
                ),
              )}
            </div>
          ) : null}
          {message.content.trim() && <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</div>}
        </div>
      )}
      {!editing && (
        <div className="mt-1 flex h-7 items-center gap-0.5 opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 sm:pr-1">
          {showTimestamps && <span className="mr-1 text-[11px] text-fg-subtle">{formatTime(message.createdAt)}{message.updatedAt && message.updatedAt !== message.createdAt ? ' · edited' : ''}</span>}
          <Tooltip content="Edit & resend">
            <button className="icon-btn icon-btn-sm" onClick={() => setEditing(message.id)} disabled={generating} aria-label="Edit message">
              <Pencil size={14} />
            </button>
          </Tooltip>
          <Tooltip content="Copy">
            <button className="icon-btn icon-btn-sm" onClick={() => void copy(message.content)} aria-label="Copy message">
              <CopyIcon copied={copied} />
            </button>
          </Tooltip>
          <Tooltip content="Delete">
            <button className="icon-btn icon-btn-sm hover:!text-danger" onClick={() => void deleteMessage(message.id)} disabled={generating} aria-label="Delete message">
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
      )}
    </article>
  )
}

/* ------------------------------------------------------------------ */
/*  Assistant                                                          */
/* ------------------------------------------------------------------ */

function AssistantMessage({ message, showTimestamps, showUsage, showLatency, generating }: Props) {
  const streamed = useStreamingText(message.id)
  const regenerate = useConversations((s) => s.regenerate)
  const continueMessage = useConversations((s) => s.continueMessage)
  const setActiveVersion = useConversations((s) => s.setActiveVersion)
  const deleteMessage = useConversations((s) => s.deleteMessage)
  const sendMessage = useConversations((s) => s.sendMessage)
  const openDialog = useUI((s) => s.openDialog)
  const { copied, copy } = useCopy()

  const isActive = message.status === 'pending' || message.status === 'streaming'
  const content = isActive && streamed != null ? streamed : message.content
  // Follow-up suggestions (<ElicitationsGroup/>) arrive as markup: strip them
  // from the rendered text and show them as clickable chips instead.
  const parsed = useMemo(() => parseElicitations(content, { streaming: isActive }), [content, isActive])
  const display = parsed.clean
  const err = message.status === 'error' ? parseMessageError(message) : null
  const versions = message.versions?.length ? message.versions : null
  const vIndex = message.activeVersion ?? 0

  const exportMessage = () => {
    downloadFile(`gemini-${timestampSlug(message.createdAt)}.md`, display, 'text/markdown')
    toast.success('Export complete')
  }

  const reportError = () => {
    const report = [
      '# GlassGem error report',
      `Time: ${new Date(message.createdAt).toISOString()}`,
      `Model: ${message.model ?? '—'}`,
      `Status: ${message.status}`,
      err ? `Error: ${err.title} — ${err.message}${err.status ? ` (HTTP ${err.status})` : ''}` : 'Error: none',
      '',
      'Response content:',
      display || '(empty)',
    ].join('\n')
    void copy(report, 'Report copied')
  }

  return (
    <article className="group flex gap-3 sm:gap-4" aria-label="Gemini response" aria-busy={isActive}>
      <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) bg-surface-2 shadow-[inset_0_0_0_1px_var(--glass-edge)] sm:flex">
        <GemMark size={18} />
      </div>
      <div className="min-w-0 flex-1">
        {message.status === 'pending' && !content ? (
          <div className="py-2">
            <ThinkingIndicator />
          </div>
        ) : (
          <>
            {display && <Markdown content={display} streaming={message.status === 'streaming'} />}
            {message.status === 'stopped' && <p className="mt-2 text-[12.5px] italic text-fg-subtle">Generation stopped.</p>}
          </>
        )}

        {/* The server hit its token limit mid-answer → offer a one-click continuation. */}
        {!isActive && message.finishReason === 'length' && display && (
          <div className="mt-2">
            <button
              className="pill pill-interactive h-7 px-3 text-[12.5px]"
              onClick={() => void continueMessage(message.id)}
              disabled={generating}
              title="The response reached its token limit. Ask the model to continue from where it stopped."
            >
              <ArrowDownToLine size={12} /> Continue generating
            </button>
          </div>
        )}

        {err && (
          <div className="enter-pop mt-3 rounded-(--radius-lg) bg-(--danger-soft) p-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_25%,transparent)]" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1 text-[13.5px]">
                <p className="font-semibold">{err.title}</p>
                <p className="mt-0.5 text-fg-muted">{err.message}</p>
                {err.hint && <p className="mt-1.5 whitespace-pre-wrap text-fg-muted">{err.hint}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => void regenerate(message.id)} disabled={generating}>
                    <RefreshCw size={13} /> Retry
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDialog('settings', 'api')}>
                    <Settings2 size={13} /> Open Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isActive && parsed.groups.length > 0 && (
          <div className="mt-3 space-y-2.5" aria-label="Follow-up suggestions">
            {parsed.groups.map((group, gi) => (
              <div key={gi} className="enter-rise" style={parsed.groups.length > 1 ? { animationDelay: `${gi * 60}ms` } : undefined}>
                {group.message && <p className="mb-1.5 text-[12.5px] text-fg-subtle">{group.message}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {group.elicitations.map((el, ei) => (
                    <button
                      key={ei}
                      className="glass-sm flex max-w-full items-center gap-1.5 rounded-(--radius-pill) px-3 py-1.5 text-left text-[12.5px] text-fg-muted transition-[background-color,color,transform] duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2 hover:text-fg active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => void sendMessage(el.query, { conversationId: message.conversationId })}
                      disabled={generating}
                      title={el.query}
                      aria-label={`Send follow-up: ${el.label}`}
                    >
                      <Sparkles size={12} className="shrink-0 text-accent" />
                      <span className="truncate">{el.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isActive && (
          <div className="mt-1.5 flex min-h-7 flex-wrap items-center gap-0.5 sm:-ml-1">
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 focus-within:opacity-100 sm:opacity-0 max-sm:opacity-100">
              <Tooltip content="Copy">
                <button className="icon-btn icon-btn-sm" onClick={() => void copy(display)} aria-label="Copy response" disabled={!display}>
                  <CopyIcon copied={copied} />
                </button>
              </Tooltip>
              <Tooltip content="Regenerate">
                <button className="icon-btn icon-btn-sm" onClick={() => void regenerate(message.id)} aria-label="Regenerate response" disabled={generating}>
                  <RefreshCw size={14} />
                </button>
              </Tooltip>
              <Menu>
                <MenuTrigger asChild>
                  <button className="icon-btn icon-btn-sm" aria-label="More actions">
                    <MoreHorizontal size={15} />
                  </button>
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuItem icon={<Copy size={14} />} onSelect={() => void copy(toPlainText(display))}>
                    Copy as plain text
                  </MenuItem>
                  <MenuItem icon={<FileText size={14} />} onSelect={() => void copy(display, 'Markdown copied')}>
                    Copy as Markdown
                  </MenuItem>
                  <MenuItem icon={<RefreshCw size={14} />} onSelect={() => void regenerate(message.id)} disabled={generating}>
                    Regenerate
                  </MenuItem>
                  <MenuItem icon={<Download size={14} />} onSelect={exportMessage} disabled={!content}>
                    Export message
                  </MenuItem>
                  <MenuItem icon={<Bug size={14} />} onSelect={reportError}>
                    Report error
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => void deleteMessage(message.id)} disabled={generating}>
                    Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>

            {versions && versions.length > 1 && (
              <div className="ml-1 flex items-center gap-0.5 text-[12px] text-fg-muted">
                <button className="icon-btn icon-btn-xs" onClick={() => void setActiveVersion(message.id, vIndex - 1)} disabled={vIndex === 0 || generating} aria-label="Previous response">
                  <ChevronLeft size={14} />
                </button>
                <span className="tabular-nums">
                  Response {vIndex + 1} / {versions.length}
                </span>
                <button className="icon-btn icon-btn-xs" onClick={() => void setActiveVersion(message.id, vIndex + 1)} disabled={vIndex >= versions.length - 1 || generating} aria-label="Next response">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2 text-[11.5px] text-fg-subtle">
              {message.model && <span className="hidden sm:inline">{modelLabel(message.model)}</span>}
              {showLatency && message.latencyMs != null && <span>{formatLatency(message.latencyMs)}</span>}
              {showUsage && message.usage?.total_tokens != null && <UsagePill usage={message.usage} />}
              {showTimestamps && <span>{formatTime(message.createdAt)}</span>}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function UsagePill({ usage }: { usage: NonNullable<Message['usage']> }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="rounded-(--radius-xs) px-1 tabular-nums transition-colors duration-(--duration-fast) hover:bg-(--hover) hover:text-fg" aria-label={`${usage.total_tokens} tokens, click for details`}>
          {usage.total_tokens?.toLocaleString()} tokens
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} collisionPadding={8} className="glass-float motion-pop z-(--z-popover) origin-(--radix-popover-content-transform-origin) rounded-(--radius-md) px-3.5 py-2.5 text-[12.5px] outline-none">
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 tabular-nums">
            <dt className="text-fg-subtle">Prompt</dt>
            <dd className="text-right">{usage.prompt_tokens?.toLocaleString() ?? '—'}</dd>
            <dt className="text-fg-subtle">Completion</dt>
            <dd className="text-right">{usage.completion_tokens?.toLocaleString() ?? '—'}</dd>
            <dt className="text-fg-subtle">Total</dt>
            <dd className={cn('text-right font-medium')}>{usage.total_tokens?.toLocaleString() ?? '—'}</dd>
          </dl>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
