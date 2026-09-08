import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, BookMarked, Paperclip, Square } from 'lucide-react'
import { useConversations } from '@/stores/conversationStore'
import { useSettings } from '@/stores/settingsStore'
import { useUI } from '@/stores/uiStore'
import { useConnection } from '@/stores/connectionStore'
import { cn, modKey } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { COMPOSER_FOCUS_EVENT } from '@/hooks/useKeyboardShortcuts'
import { ModelSelector } from './ModelSelector'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { toast } from '@/hooks/useToast'

const MAX_HEIGHT = 240

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
  const ref = useRef<HTMLTextAreaElement>(null)
  const drafts = useRef<Map<string, string>>(new Map())

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

  // Keep a per-conversation draft.
  const prevId = useRef<string | null>(activeId)
  useEffect(() => {
    if (prevId.current !== activeId) {
      drafts.current.set(prevId.current ?? '__none', value)
      const next = drafts.current.get(activeId ?? '__none') ?? ''
      setValue(next)
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

  const canSend = value.trim().length > 0 && !generating

  const submit = () => {
    if (!canSend) return
    const text = value
    setValue('')
    drafts.current.delete(activeId ?? '__none')
    requestAnimationFrame(resize)
    void sendMessage(text)
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
          placeholder={generating ? 'Gemini is responding…' : 'Message Gemini…'}
          rows={1}
          className="relative z-1 block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15.5px] leading-relaxed outline-none placeholder:text-fg-subtle"
          style={{ paddingTop: 'var(--composer-pad)', maxHeight: MAX_HEIGHT }}
          autoComplete="off"
          spellCheck
        />
        <div className="relative z-1 flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex min-w-0 items-center gap-0.5">
            <Tooltip content={imageCap === 'supported' ? 'Attach image' : 'Attachments are unavailable with the current Web2API configuration.'}>
              <span>
                <button
                  className="icon-btn"
                  aria-label="Attach file"
                  disabled={imageCap !== 'supported'}
                  onClick={() => toast.info('Attachments unavailable', 'Enable image input in Settings → Chat once your Web2API server supports it.')}
                >
                  <Paperclip size={17} />
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
