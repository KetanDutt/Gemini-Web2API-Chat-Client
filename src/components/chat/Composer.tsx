import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, BookMarked, ImagePlus, Loader2, Paperclip, Square, X } from 'lucide-react'
import { useConversations } from '@/stores/conversationStore'
import { useSettings } from '@/stores/settingsStore'
import { useUI } from '@/stores/uiStore'
import { useConnection } from '@/stores/connectionStore'
import { cn, formatBytes, modKey } from '@/lib/utils'
import { fileToAttachment, AttachmentError } from '@/lib/images'
import { Tooltip } from '@/components/ui/Tooltip'
import { COMPOSER_FOCUS_EVENT } from '@/hooks/useKeyboardShortcuts'
import { ModelSelector } from './ModelSelector'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { toast } from '@/hooks/useToast'
import type { Attachment } from '@/types'

const MAX_HEIGHT = 240
const MAX_ATTACHMENTS = 4

export function Composer() {
  const activeId = useConversations((s) => s.activeId)
  const generating = useConversations((s) => (s.activeId ? !!s.generating[s.activeId] : false))
  const sendMessage = useConversations((s) => s.sendMessage)
  const stopGeneration = useConversations((s) => s.stopGeneration)
  const conv = useConversations((s) => s.conversations.find((c) => c.id === s.activeId))
  const setConversationModel = useConversations((s) => s.setConversationModel)
  const enterToSend = useSettings((s) => s.enterToSend)
  const defaultModel = useSettings((s) => s.defaultModel)
  const setSetting = useSettings((s) => s.set)
  const imageCap = useConnection((s) => s.capabilities.imageInput)
  const draft = useUI((s) => s.composerDraft)
  const insertNonce = useUI((s) => s.composerInsertNonce)
  const openDialog = useUI((s) => s.openDialog)
  const isMobile = useIsMobile()

  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [reading, setReading] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const drafts = useRef<Map<string, { text: string; attachments: Attachment[] }>>(new Map())

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  // Insert from suggestions / prompt library.
  useEffect(() => {
    if (!insertNonce) return
    setValue((v) => (v.trim() ? `${v}\n${draft}` : draft))
    requestAnimationFrame(() => {
      resize()
      const el = ref.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertNonce])

  // Keep a per-conversation draft (text + attachments).
  const prevId = useRef<string | null>(activeId)
  useEffect(() => {
    if (prevId.current !== activeId) {
      drafts.current.set(prevId.current ?? '__none', { text: value, attachments })
      const next = drafts.current.get(activeId ?? '__none')
      setValue(next?.text ?? '')
      setAttachments(next?.attachments ?? [])
      prevId.current = activeId
      requestAnimationFrame(resize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  useEffect(() => {
    const focus = () => ref.current?.focus()
    window.addEventListener(COMPOSER_FOCUS_EVENT, focus)
    if (!isMobile) focus()
    return () => window.removeEventListener(COMPOSER_FOCUS_EVENT, focus)
  }, [isMobile])

  useEffect(resize, [value, resize])

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !generating && !reading

  const submit = () => {
    if (!canSend) return
    const text = value.trim()
    const toSend = attachments
    setValue('')
    setAttachments([])
    drafts.current.delete(activeId ?? '__none')
    requestAnimationFrame(resize)
    void sendMessage(text, { attachments: toSend.length ? toSend : undefined })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const mod = e.ctrlKey || e.metaKey
      if (mod) {
        e.preventDefault()
        submit()
        return
      }
      if (enterToSend && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        submit()
      }
    }
  }

  const pickFiles = () => {
    if (imageCap !== 'supported') {
      toast.info('Attachments unavailable', 'Enable image input in Settings → Chat once your Web2API server supports it.')
      return
    }
    fileRef.current?.click()
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      toast.error('Attachment limit reached', `You can attach up to ${MAX_ATTACHMENTS} images per message.`)
      return
    }
    setReading(true)
    const added: Attachment[] = []
    try {
      for (const file of [...files].slice(0, room)) {
        try {
          added.push(await fileToAttachment(file))
        } catch (e) {
          toast.error('Attachment skipped', e instanceof AttachmentError ? e.message : `Could not read “${file.name}”.`)
        }
      }
      if (added.length) {
        setAttachments((prev) => [...prev, ...added])
        ref.current?.focus()
      }
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id))

  const model = conv?.model ?? defaultModel
  const onModel = (id: string) => {
    if (conv) void setConversationModel(conv.id, id)
    else setSetting('defaultModel', id)
  }

  const charCount = value.length

  return (
    <div className="relative z-(--z-panel) px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 sm:px-6 sm:pb-5">
      <div
        className={cn(
          'glass-md mx-auto w-full max-w-3xl rounded-(--radius-xl) transition-[box-shadow,border-color] duration-(--duration-slow) ease-(--ease-standard)',
          focused && 'border-(--accent-ring) shadow-[inset_0_0_0_1px_var(--glass-edge),0_0_0_4px_var(--accent-soft),var(--shadow-md)]',
        )}
      >
        {attachments.length > 0 && (
          <div className="relative z-1 flex flex-wrap gap-2 px-4 pt-3.5" aria-label="Attached images">
            {attachments.map((a) => (
              <div key={a.id} className="group/chip enter-pop relative" title={`${a.name} · ${formatBytes(a.size)}`}>
                {a.dataUrl ? (
                  <img src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-(--radius-sm) border border-line object-cover shadow-(--shadow-sm)" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-(--radius-sm) border border-line bg-surface-2 text-fg-subtle">
                    <Paperclip size={16} />
                  </span>
                )}
                <button
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-(--radius-pill) bg-fg text-(--bg) shadow-(--shadow-sm) transition-transform duration-(--duration-fast) hover:scale-110 active:scale-95"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`Remove ${a.name}`}
                  type="button"
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </div>
            ))}
            {reading && (
              <span className="flex h-16 w-16 items-center justify-center rounded-(--radius-sm) border border-dashed border-line text-fg-subtle" aria-label="Reading image">
                <Loader2 size={16} className="animate-spin-slow" />
              </span>
            )}
          </div>
        )}
        <label htmlFor="composer" className="sr-only">
          Message Gemini
        </label>
        <textarea
          id="composer"
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={generating ? 'Gemini is responding…' : attachments.length ? 'Add a message or send the images…' : 'Message Gemini…'}
          rows={1}
          className="relative z-1 block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15.5px] leading-relaxed outline-none placeholder:text-fg-subtle"
          style={{ paddingTop: 'var(--composer-pad)', maxHeight: MAX_HEIGHT }}
          autoComplete="off"
          spellCheck
        />
        <div className="relative z-1 flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex min-w-0 items-center gap-0.5">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} aria-hidden tabIndex={-1} />
            <Tooltip
              content={
                imageCap === 'supported'
                  ? `Attach images (up to ${MAX_ATTACHMENTS})`
                  : 'Attachments are unavailable with the current Web2API configuration.'
              }
            >
              <span>
                <button
                  className="icon-btn"
                  aria-label="Attach image"
                  disabled={generating || reading || (imageCap === 'supported' && attachments.length >= MAX_ATTACHMENTS)}
                  onClick={pickFiles}
                >
                  {imageCap === 'supported' ? <ImagePlus size={17} /> : <Paperclip size={17} />}
                </button>
              </span>
            </Tooltip>
            <Tooltip content="Prompt library" shortcut={`${modKey()}+Shift+P`}>
              <button className="icon-btn" aria-label="Open prompt library" onClick={() => openDialog('prompts')}>
                <BookMarked size={17} />
              </button>
            </Tooltip>
            <ModelSelector value={model} onChange={onModel} compact={isMobile} />
          </div>
          <div className="flex items-center gap-2">
            {charCount > 0 && !isMobile && <span className="text-[11px] tabular-nums text-fg-subtle">{charCount.toLocaleString()}</span>}
            {!isMobile && !generating && (
              <span className="hidden text-[11px] text-fg-subtle md:inline">
                {enterToSend ? (
                  <>
                    <kbd className="kbd">↵</kbd> send · <kbd className="kbd">⇧↵</kbd> newline
                  </>
                ) : (
                  <>
                    <kbd className="kbd">{modKey()}</kbd>+<kbd className="kbd">↵</kbd> send
                  </>
                )}
              </span>
            )}
            {generating ? (
              <Tooltip content="Stop generating">
                <button
                  className="enter-pop flex h-9 w-9 items-center justify-center rounded-(--radius-pill) bg-fg text-(--bg) shadow-(--shadow-sm) transition-transform duration-(--duration-fast) ease-(--ease-spring) hover:scale-105 active:scale-92"
                  onClick={() => stopGeneration(activeId ?? undefined)}
                  aria-label="Stop generating"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Send">
                <button
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-(--radius-pill) transition-[transform,opacity,box-shadow,background-color,color] duration-(--duration-base) ease-(--ease-spring)',
                    canSend
                      ? 'bg-accent text-(--fg-on-accent) shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_16px_-6px_var(--accent-ring)] hover:scale-105 hover:bg-(--accent-hover) active:scale-92'
                      : 'bg-(--active) text-fg-subtle',
                  )}
                  onClick={submit}
                  disabled={!canSend}
                  aria-label="Send message"
                >
                  <ArrowUp size={18} strokeWidth={2.4} className={cn('transition-transform duration-(--duration-base) ease-(--ease-spring)', canSend ? 'translate-y-0' : 'translate-y-px')} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-2 hidden max-w-3xl text-center text-[11px] text-fg-subtle sm:block">Gemini can make mistakes. Responses come from your local Web2API server.</p>
    </div>
  )
}
